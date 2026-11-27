# Kontrak Sprint 4: Aslab, Keanggotaan Lab, Denda, dan Pembayaran

Dokumen acuan programmer dan dasar SRS v4. Pemilik: Elang (PM). Perubahan isi kontrak (tipe, rules, API) dari programmer
lewat PR terpisah yang disetujui PM. Status: **T0 selesai** (26 Nov 2026): PR #1 dan #2 di-merge, seed `--apply` dijalankan, rules di-deploy, backend aktif di https://rawuh-ppk.vercel.app. Rumusan resmi kebutuhan ada di `docs/SRS.md` v4.0.

Berkas kode kontrak: `src/types/index.ts`, `src/types/bulk.ts`, `src/types/api.ts`, `src/constants/denda.ts`,
`firestore.rules`, `server/lib/contract.ts` (salinan untuk server, **wajib sinkron**).

## 1. Keputusan yang dikunci

1. **Role**: satu role per akun. Nilai `'asisten'` tetap (disebut **Asprak** di UI/SRS); ditambah `'aslab'`. Akun aslab tidak bisa
   mendaftar sendiri (dibuat lewat seed/Admin SDK) dan terikat mata kuliah (`User.mataKuliahIds`).
2. **Keanggotaan (Opsi A)**: lab = rombongan praktikum per mata kuliah dengan lokasi sendiri. `labs` diperluas dengan `mataKuliahId`,
   `praktikanEmails`, `asprakEmails`, `graceMinutes`. Praktikan ikut sesi di lab yang memuat emailnya; Asprak bertanggung jawab atas
   sesi di lab yang memuat emailnya. Identitas = **email**, selalu `normalizeEmail` (trim + huruf kecil). `kelas` menjadi data lama.
3. **Backend**: Vercel Functions (TypeScript/Node) + Firebase Admin SDK di `server/` (Root Directory Vercel = `server`),
   Midtrans Sandbox (Snap). Rahasia hanya di environment Vercel.
4. **Denda**: tagihan dibuat backend saat Asprak menutup sesi (`POST /api/fines/generate`). Telat = waktu presensi
   `> startAt sesi + graceMinutes lab`. Nominal tetap (`DENDA_NOMINAL`). ID tagihan `bills/{sessionId}_{userId}` (satu telat = satu tagihan).
   Klien hanya **membaca** `bills` dan `payments`; semua tulis lewat Admin SDK. Izin disetujui = tidak presensi = tanpa tagihan.
   Pembayaran tidak mengubah kehadiran.
5. **Webhook Midtrans** (aturan sejak 28 Okt 2026): `signature_key = SHA512(order_id + status_code + gross_amount + SIGNATURE_SECRET_KEY)`,
   **bukan** server key.
6. **Bulk insert**: CSV + papaparse. Satu komponen review generik untuk 3 jenis (`lab`, `praktikan`, `asprak`); yang beda hanya definisi kolom + validasi.

Keputusan tambahan PM di T0 (boleh diubah lewat PR kontrak):

- `lateMinutes` = menit sejak `startAt` (dibulatkan ke atas), bukan sejak batas toleransi. Tepat di batas toleransi belum telat (`computeLateMinutes`).
- Batas toleransi `graceMinutes` bertipe bilangan bulat 0..60; bawaan 15.
- `payments/{orderId}` berisi status Midtrans mentah (`midtransStatus`) di samping `status` ternormalisasi.
- Notifikasi `capture` dengan `fraud_status = challenge` dianggap `pending`; status Midtrans yang tidak dikenal (refund, chargeback) **diabaikan**.
- Semua respons error API berbentuk `ApiError` langsung `{ code, message }` (tanpa pembungkus).

## 2. Model data Firestore

| Koleksi / dokumen | Isi | ID | Penulis |
| --- | --- | --- | --- |
| `mataKuliah/{id}` (baru) | `kode`, `nama` | slug, mis. `mk-basis-data` | Seed/Admin SDK. Klien: baca |
| `users/{uid}` (diubah) | + `mataKuliahIds?: string[]` (aslab). `kelas` opsional untuk praktikan | uid Auth | Pendaftaran (praktikan/asisten); aslab hanya Admin SDK |
| `labs/{labId}` (diubah) | lama + `mataKuliahId`, `praktikanEmails[]`, `asprakEmails[]`, `graceMinutes` (int 0..60) | labId | **Aslab** pemilik MK (rules `aslabOwnsMk`); Asprak tidak lagi menulis lab |
| `sessions/{id}` (diubah rules) | tetap | auto | Asprak yang emailnya ada di `asprakEmails` lab sesi |
| `attendances/{sessionId}_{uid}`, `izin/{sessionId}_{uid}` | tetap; `kelas` tidak lagi wajib | deterministik | Praktikan anggota lab (atau kelas lama, masa transisi) |
| `bills/{sessionId}_{userId}` (baru) | `Bill` (lihat `src/types/index.ts`) | deterministik | **Hanya Admin SDK** (server) |
| `payments/{orderId}` (baru) | `Payment`; `orderId = {billId}-{n}`, unik per percobaan bayar | orderId | **Hanya Admin SDK** (server) |
| `users/{uid}/devices/{deviceId}` | tetap; server membaca lewat Admin SDK untuk push | hash token | Pemilik |

Akses baca baru: `bills`: pemilik, Asprak lab terkait (query wajib `where('labId','==',X)`), aslab. `payments`: pemilik, Asprak lab terkait
(query wajib `where('billId','==',X)`), aslab. Praktikan membaca sesi dengan `where('labId','==',X)` per lab keanggotaannya; kueri `in` hanya lolos bila
praktikan anggota **semua** lab dalam daftar (diuji di emulator).

Catatan rules: isi `praktikanEmails`/`asprakEmails` **harus** sudah huruf kecil dan di-trim (rules hanya menormalkan email pengguna, tidak bisa mengiterasi list).
Maksimum 500 email per daftar.

## 3. Kontrak API

Basis URL di aplikasi: `EXPO_PUBLIC_API_BASE_URL` (tanpa slash di akhir; sudah ditambahkan ke `.env.example`). Autentikasi: `Authorization: Bearer <Firebase ID token>`
(kecuali webhook). Tipe: `src/types/api.ts`.

| Endpoint | Auth | Body | Sukses | Error |
| --- | --- | --- | --- | --- |
| `GET /api/health` | tidak ada | - | `200 { ok: true }` | 405 |
| `POST /api/fines/generate` | Asprak yang emailnya ada di `asprakEmails` lab sesi | `{ sessionId }` | `200 { created, skipped }` | 400, 401, 403, 404 (sesi/lab), 409 (sesi belum `closed`) |
| `POST /api/payments/create` | pemilik tagihan | `{ billId }` | `200 { orderId, snapToken, redirectUrl }` | 400, 401, 403, 404, 409 (status bukan `unpaid`/`failed`), 502 (Midtrans) |
| `POST /api/payments/notification` | `signature_key` Midtrans | JSON notifikasi Midtrans | `200 { ok: true }` | 400 (bentuk), 403 (signature salah) |

Semua error: `{ code, message }` dengan `code` salah satu `ApiErrorCode`
(`UNAUTHENTICATED` 401, `FORBIDDEN` 403, `INVALID_INPUT` 400, `NOT_FOUND` 404, `METHOD_NOT_ALLOWED` 405, `CONFLICT` 409, `UPSTREAM_ERROR` 502,
`NOT_IMPLEMENTED` 501, `INTERNAL` 500). **Status T0**: tiga endpoint bisnis baru memvalidasi method dan body lalu membalas `501 NOT_IMPLEMENTED`;
hanya `/api/health` yang berfungsi. Langkah implementasi ada di komentar TODO tiap berkas.

Environment server (nama saja; nilai hanya di Vercel): `FIREBASE_SERVICE_ACCOUNT_BASE64`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`,
`MIDTRANS_SIGNATURE_SECRET_KEY`, `MIDTRANS_IS_PRODUCTION=false`, `DENDA_NOMINAL=5000`. Aplikasi: `EXPO_PUBLIC_API_BASE_URL`.
Webhook di Midtrans: `https://<domain>/api/payments/notification`.

## 4. Status Midtrans dan tagihan

`mapMidtransStatus(transaction_status, fraud_status?)` (`src/constants/denda.ts`, salinan di `server/lib/contract.ts`):

| `transaction_status` Midtrans | `PaymentStatus` |
| --- | --- |
| `settlement` | `success` |
| `capture` (`fraud_status` `accept`/kosong) | `success` |
| `capture` + `fraud_status = challenge` | `pending` |
| `pending`, `authorize` | `pending` |
| `deny`, `cancel`, `expire`, `failure` | `failed` |
| lainnya (`refund`, `chargeback`, ...) | `null` = abaikan, status tersimpan tidak berubah |

Status tagihan (`BillStatus`) dan transisi (server saja):

| Dari | Ke | Pemicu |
| --- | --- | --- |
| (belum ada) | `unpaid` | `fines/generate` membuat tagihan |
| `unpaid` / `failed` | `pending` | `payments/create` (orderId baru, `lastOrderId` diisi) |
| `pending` | `pending` | webhook `pending` |
| `pending` | `success` | webhook `success` (`paidAt` diisi) |
| `pending` | `failed` | webhook `failed` untuk order = `lastOrderId` |
| `failed` | `pending` | percobaan bayar baru |


- Dibuat `unpaid` oleh `fines/generate`. `create` memindahkan `unpaid`/`failed` -> `pending` dan mengisi `lastOrderId`.
- `success` bersifat terminal. Notifikasi `failed`/`pending` untuk order lama (bukan `lastOrderId`) tidak mengubah tagihan.
- Notifikasi duplikat idempoten: tidak mengubah data dan tidak mengirim push dua kali.

## 5. Notifikasi N7–N9

Dikirim **dari server** lewat Expo Push API (`https://exp.host/--/api/v2/push/send`, maks 100 pesan per permintaan) ke token di `users/{uid}/devices`.
Pengiriman terjadi setelah penulisan berhasil dan tidak menggagalkan aksi. Token `DeviceNotRegistered` boleh dihapus server. Payload mengikuti `NotifPayload`; diketuk membuka **detail tagihan**.

| ID | Pemicu | Penerima | Judul / isi | Payload | Tujuan ketuk |
| --- | --- | --- | --- | --- | --- |
| N7 | Tagihan baru dibuat `fines/generate` | Praktikan pemilik tagihan | "Denda keterlambatan" / "Kamu terlambat {n} menit di {Praktikum}. Denda Rp{nominal}." | `{ type: 'bill_created', billId }` | Detail tagihan |
| N8 | Webhook: pembayaran `success` (status berubah) | Pemilik tagihan | "Pembayaran berhasil" / "Denda {Praktikum} Rp{nominal} sudah lunas." | `{ type: 'payment_success', billId }` | Detail tagihan |
| N9 | Webhook: pembayaran `failed` (status berubah) | Pemilik tagihan | "Pembayaran belum berhasil" / "Pembayaran denda {Praktikum} gagal atau kedaluwarsa. Coba bayar lagi." | `{ type: 'payment_failed', billId }` | Detail tagihan |

Root layout (`src/app/_layout.tsx`, Dhimas) menangani navigasi ketuk untuk tiga tipe baru. Rute detail tagihan ditentukan Dhimas.

## 6. Kepemilikan file Sprint 4 (anti merge conflict)

| Pemilik | File |
| --- | --- |
| **IBRAHIM** (Domain A, Aslab) | `src/app/aslab/**`, `src/features/aslab/**`, `src/features/bulk/**` (komponen review generik + template CSV), `src/services/aslab.ts`, `src/store/aslabStore.ts` (store Zustand **terpisah** dari `appStore`), komponen baru di `src/components/**` yang dibutuhkan domainnya. Juga memindahkan layar kelola lab dari asisten ke aslab |
| **DHIMAS** (Domain B, Denda/Bayar/Asprak) | `server/**` (kecuali `server/scripts/seed-sprint4.ts`), `src/services/denda.ts`, `src/services/payments.ts`, `src/store/dendaStore.ts` (store **terpisah**), layar tagihan dan riwayat bayar di `src/app/praktikan/**`, penyesuaian Asprak di `src/app/asisten/**`, `src/store/appStore.ts`, `src/store/sync.ts`, `src/services/sessions.ts` (pindah query ke keanggotaan lab), root layout untuk navigasi notifikasi N7–N9 |
| **ELANG** (PM) | `src/types/**`, `src/constants/denda.ts`, `firestore.rules`, `server/scripts/seed-sprint4.ts`, `docs/KONTRAK-SPRINT4.md`, `docs/SRS.md` |

Aturan:

- Perubahan tipe/rules/kontrak oleh programmer lewat PR terpisah yang disetujui PM. **Rules hanya di-deploy oleh Elang.**
- **Routing role**: root routing mengarahkan role `'aslab'` ke `/aslab`. Dhimas menyediakan titik belokan di root layout/`src/app/index.tsx`;
  Ibrahim mengisi isi `/aslab`.
- `server/lib/contract.ts` dan `src/types/api.ts` selalu diubah bersamaan.
- Dua store baru (`aslabStore`, `dendaStore`) tidak menambah state ke `appStore` agar tidak bentrok.

## 7. Tahapan dan pembagian FR

| Tahap | Ibrahim (A) | Dhimas (B) |
| --- | --- | --- |
| **T0** fondasi | - | Dev build dari `main` setelah PR #2 (selesai 26 Nov) |
| **T1** | FR-60 role & routing Aslab, FR-61 CRUD lab (pindah dari asisten), FR-62 grace period | FR-72/FR-73 `fines/generate` + tutup sesi memicu denda, FR-74 daftar tagihan, FR-71 pembatasan Asprak |
| **T2** | FR-66 template, FR-67 komponen review generik, FR-63/64/65 bulk & single insert, FR-68 pindah | FR-75 `payments/create` + Snap, FR-76 webhook, perubahan FR lama ke keanggotaan lab |
| **T3** | FR-69, FR-70 dashboard | FR-77 notifikasi N7–N9, FR-78 riwayat; `eas.json` preview + `EXPO_PUBLIC_API_BASE_URL` |
| **T4** | NFR-19 layar Aslab, `DESIGN.md` | NFR-19 layar praktikan/Asprak, APK preview untuk demo |

Kode FR (ringkas; rumusan resmi masuk SRS v4):

| FR | Pemilik | Ringkasan |
| --- | --- | --- |
| FR-60 | Ibrahim | Role aslab: login dari akun seed, routing ke `/aslab`, terikat mata kuliah |
| FR-61 | Ibrahim | CRUD lab per mata kuliah (nama, gedung, koordinat, radius); layar kelola lab dipindah dari asisten ke aslab |
| FR-62 | Ibrahim | Pengaturan `graceMinutes` per lab (0..60, bawaan 15) |
| FR-63 | Ibrahim | Single & bulk insert lab (CSV) per mata kuliah |
| FR-64 | Ibrahim | Single & bulk insert praktikan ke lab (email) |
| FR-65 | Ibrahim | Single & bulk insert Asprak ke lab (email) |
| FR-66 | Ibrahim | Template CSV yang dapat diunduh per jenis (3 bulk insert terpisah) |
| FR-67 | Ibrahim | Layar review generik: terima/tolak, ubah, lengkapi, terima semua yang valid, peringatan "akun belum terdaftar" |
| FR-68 | Ibrahim | Pindah praktikan dan Asprak antar lab (jadwal tidak ikut pindah) |
| FR-69 | Ibrahim | Dashboard: jumlah lab & praktikan, status per lab, lokasi & waktu, jadwal berlangsung & akan datang |
| FR-70 | Ibrahim | Dashboard: riwayat kegiatan & riwayat keuangan denda + filter hari/minggu/bulan |
| FR-71 | Dhimas | Asprak hanya mengelola lab/jadwal/sesi tempat emailnya terdaftar; tanpa kewenangan distribusi & konfigurasi lab |
| FR-72 | Dhimas | Penentuan keterlambatan dengan grace period saat sesi ditutup |
| FR-73 | Dhimas | Tagihan denda: nominal tetap, satu per kejadian, tertaut praktikan/sesi/presensi; izin bebas denda; bayar tidak ubah kehadiran |
| FR-74 | Dhimas | Daftar dan detail tagihan praktikan |
| FR-75 | Dhimas | Bayar lewat backend (`/api/payments/create`) → Midtrans Snap Sandbox |
| FR-76 | Dhimas | Webhook terverifikasi memperbarui pembayaran & tagihan (idempoten) |
| FR-77 | Dhimas | Notifikasi N7–N9 dan navigasi ke detail tagihan |
| FR-78 | Dhimas | Riwayat pembayaran persisten |

Perubahan FR lama karena keanggotaan lab (FR-07/32/33/35/47/51, pendaftaran tanpa kelas) dikerjakan Dhimas; finalisasi UI dicatat sebagai NFR-19. Rincian di SRS v4.0 §4.1 dan §7.

## 8. Daftar TRANSISI-SPRINT4 (bereskan sebelum gladi)

Cari di repo dengan `grep -rn TRANSISI-SPRINT4`. Semua cabang "kelas lama" bertahan sampai klien praktikan memakai keanggotaan lab.

`firestore.rules` (Elang menghapus setelah klien dipindah dan data dimigrasi):

1. `sessions` read praktikan: cabang `resource.data.kelas == me().kelas`.
2. `sessions` update dan delete: cabang sesi lama tanpa `labId` (`!('labId' in resource.data)`).
3. `attendances` create: cabang `sessionOf(...).kelas == me().kelas` dan `kelas` opsional pada dokumen.
4. `izin` create: cabang `sessionOf(...).kelas == me().kelas` dan `kelas` opsional pada dokumen.

Kode aplikasi (Dhimas, kecuali dicatat lain):

5. `listenSessions` memakai `where('kelas', '==', user.kelas)` -> pindah ke query per `labId` (satu listener per lab keanggotaan). Perlu cara mengetahui lab anggota: baca `labs` lalu saring `praktikanEmails`.
6. Pendaftaran praktikan yang mewajibkan `kelas` (`src/app/(auth)/daftar.tsx`, `src/services/auth.ts`) -> hentikan.
7. Klien masih menulis `kelas` pada presensi/izin; `Izin.kelas` bertipe wajib di `src/types/index.ts` -> jadikan opsional lewat PR kontrak.
8. Tipe `Lab` Sprint 4 (`mataKuliahId`, `praktikanEmails`, `asprakEmails`, `graceMinutes`) opsional -> wajibkan setelah seed `--apply` dan setelah semua lab punya field itu.
9. Koleksi `kelasPraktikum` dan layar kelola kelas (Sprint 2) -> pensiun setelah `kelas` tidak dipakai (Ibrahim memindahkan/menghapus layarnya).
10. Seed lama (`scripts/seed-firebase.js`, `scripts/seed-labs.js`) menulis lab tanpa field Sprint 4 dan tidak lolos rules baru bila dijalankan lewat klien -> sesuaikan atau pensiunkan.

Urutan rilis data (Elang): `seed-sprint4.ts` dry-run -> `--apply` -> deploy `firestore.rules`. Lab yang belum dimigrasi tidak bisa diubah klien dan praktikan di dalamnya tidak lolos cabang lab.
