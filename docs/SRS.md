# SRS & Rencana Kerja Sprint 4: Aplikasi Presensi Praktikum "Rawuh" (Aslab, Keanggotaan Lab, Denda, dan Pembayaran)

PM: Elang · Tim: Dhimas, Ibrahim · Sprint: 4 · Versi 4.0 (lanjutan SRS v3.3) · Repo: `PPK-01/pertemuan-9` · Batas pengerjaan: Senin 30 Nov 2026 pukul 23.59

> **Versi sebelumnya:** SRS v1.3 (Sprint 1), v2.2 (Sprint 2), dan v3.3 (Sprint 3) di `docs/arsip/`. Rujukan "SRS v3 §x" di kode dan `DESIGN.md` mengacu ke v3.3. Rujukan baru sejak Sprint 4 ditulis "SRS v4 §x".

> **Hubungan dengan kontrak:** detail teknis (model data lengkap, kontrak API, pemetaan status, kepemilikan file, daftar transisi) ada di `docs/KONTRAK-SPRINT4.md`. SRS ini menetapkan **apa** yang harus jadi dan **kapan dianggap selesai**, lalu merujuk kontrak untuk **cara membangunnya**. Bila keduanya bertentangan, PM memutuskan dan memperbaiki salah satunya lewat PR.

## 1. Pendahuluan

### 1.1 Tujuan

Dokumen ini mendefinisikan kebutuhan perangkat lunak Sprint 4 dan melanjutkan SRS v3.3. Sampai Sprint 3, Rawuh memiliki dua peran (praktikan dan asisten), presensi berbasis kode dan lokasi, peta lab, izin dengan bantuan AI, dan push notification. Sprint 4 menambahkan:

1. **Peran baru Aslab** (asisten laboratorium) yang mengelola laboratorium dan distribusi praktikan serta asprak per mata kuliah, termasuk **bulk insert** dari CSV.
2. **Dashboard keberlangsungan laboratorium** untuk Aslab.
3. **Pemusatan peran Asprak** (asisten praktikum, sebelumnya "asisten") pada pengelolaan sesi di lab yang menjadi tanggung jawabnya.
4. **Perhitungan keterlambatan dan denda** dengan grace period.
5. **Pembayaran denda** lewat payment gateway **Midtrans (Sandbox)** dengan alur client, server, dan payment gateway.
6. **Notifikasi dan riwayat pembayaran.**
7. **Finalisasi antarmuka** agar modern, konsisten, dan mudah digunakan semua peran.

Dokumen ini juga membagi tugas Dhimas dan Ibrahim dan menetapkan tahapan pengerjaan.

### 1.2 Ruang Lingkup

**Berubah dari Sprint 3:**

- **Lab menjadi rombongan praktikum** per mata kuliah dengan lokasi sendiri. Praktikan dan Asprak **terdaftar di lab** lewat email; praktikan mengikuti sesi di lab tempat ia terdaftar (menggantikan `kelas`).
- Pengelolaan lab berpindah dari asisten ke **Aslab**. Asprak tidak lagi dapat mengubah konfigurasi lab.
- Ada **backend** untuk pertama kalinya: Vercel Functions di folder `server/` untuk denda dan pembayaran.
- Koleksi baru: `mataKuliah`, `bills` (tagihan denda), `payments` (transaksi).

**Di luar lingkup Sprint 4 (backlog):** pembayaran dengan uang sungguhan (Production Midtrans), refund dan pembatalan transaksi, cicilan, perpindahan jadwal praktikum antar lab (dinyatakan tidak perlu oleh studi kasus), verifikasi email akun, aplikasi iOS resmi, ekspor laporan keuangan, serta backlog v3.3 (bagian 15). Demo dan kriteria penerimaan **hanya di Android**.

### 1.3 Yang Dipertahankan dari Sprint 3

- Stack aplikasi: Expo SDK 57, TypeScript strict, Expo Router (`src/app/`), Zustand 5, Firebase JS SDK (Auth + Firestore), Firebase **Spark**, light mode, development build Android.
- Presensi: kode sesi 4 digit, validasi lokasi dan radius, `serverTimestamp()` yang dipaksa rules (`timestamp == request.time`), satu kali per sesi.
- Izin dengan AI EDOM lokal, peta MapLibre + OpenFreeMap, notifikasi N1–N4 dan N6 dari aplikasi Asprak lewat Expo Push Service.
- Pola `Result`, pra-cek offline, timeout 10 detik, security rules deny-by-default, sistem desain `DESIGN.md`, aturan kepemilikan file.

### 1.4 Keputusan Teknis Baru

| Aspek | Keputusan | Alasan |
| --- | --- | --- |
| Biaya | Tetap **gratis tanpa kartu**: Firebase Spark, Vercel **Hobby**, Midtrans **Sandbox** | Ketentuan PM sejak Sprint 3 |
| Backend | **Vercel Functions** (TypeScript/Node) + **Firebase Admin SDK** di folder `server/` (Root Directory Vercel = `server`), domain `https://rawuh-ppk.vercel.app` | Payment gateway mewajibkan server: secret key tidak boleh di aplikasi dan status pembayaran harus diverifikasi lewat webhook. Ditolak: Cloud Functions (wajib Blaze), Cloudflare Workers (Admin SDK resmi tidak berjalan), server lokal + tunnel (URL tidak stabil saat demo) |
| Payment gateway | **Midtrans Snap**, Sandbox. Halaman pembayaran dibuka dengan `expo-web-browser` dari `redirectUrl` | Diminta studi kasus; Snap tidak memerlukan Client Key di aplikasi |
| Verifikasi webhook | `signature_key = SHA512(order_id + status_code + gross_amount + Signature Secret Key)`, dibandingkan timing-safe | Aturan Midtrans sejak 28 Okt 2026 (bukan Server Key) |
| Peran | Satu peran per akun. Nilai `asisten` **tetap** di kode/DB dan disebut **Asprak** di UI dan dokumen; ditambah `aslab` | Nol migrasi untuk route, rules, dan data Sprint 3 |
| Keanggotaan | **Keanggotaan lab** (email di `praktikanEmails`/`asprakEmails`) menentukan sesi yang diikuti praktikan dan dikelola Asprak | Studi kasus: distribusi dan pemindahan praktikan antar lab, jadwal melekat ke lab |
| Identitas | **Email** (dinormalisasi huruf kecil dan trim). Akun tidak wajib sudah ada saat dimasukkan ke lab | Data user tidak memiliki NIM; Aslab biasanya menerima daftar kelas sebelum mahasiswa mendaftar |
| Pembuatan tagihan | **Server** membuat tagihan saat Asprak menutup sesi (`POST /api/fines/generate`); ID deterministik `bills/{sessionId}_{userId}` | Aturan "satu keterlambatan satu tagihan" tidak bisa diakali klien; klien hanya membaca tagihan |
| Bulk insert | **CSV** + `papaparse` dengan deteksi pemisah otomatis (`,` atau `;`); satu komponen review generik untuk tiga jenis | Excel berlocale Indonesia menyimpan CSV dengan `;`. XLSX (SheetJS) di npm tidak terawat dan memiliki celah keamanan |
| File | `expo-document-picker` (pilih CSV), `expo-file-system` + `expo-sharing` (unduh template) | Dipasang sekaligus di Tahap 0 agar development build cukup dibuat ulang satu kali |
| Store | Store Zustand **terpisah** per domain: `aslabStore.ts` dan `dendaStore.ts` | `appStore.ts` sudah 1.452 baris; mencegah merge conflict |
| Akun layanan | Vercel dan Midtrans dipegang Elang (PM); Firebase dan EAS tetap pada pemegang Sprint 3; Elang anggota project Firebase | Vercel Hobby tidak mendukung anggota tim |

### 1.5 Asumsi dan Hal yang Masih Terbuka

1. Elang menjadi PM Sprint 4. Karena kelompok hanya tiga orang, asprak mengizinkan PM ikut menulis kode **secara terbatas**; penulisan kode fitur tetap pekerjaan utama programmer. Kode PM dibatasi pada fondasi dan kontrak (Tahap 0).
2. Studi kasus dipaparkan umum oleh asprak; implementasi dibebaskan ke tiap kelompok. Penafsiran tim: lab = rombongan praktikum per mata kuliah; nominal denda tetap Rp5.000; grace period bawaan 15 menit, dapat diatur 0–60 menit per lab.
3. Data awal Sprint 4 dibuat skrip `server/scripts/seed-sprint4.ts`: 2 mata kuliah, 1 akun Aslab, dan 6 lab lama dimigrasi (semua Asprak dimasukkan ke semua lab; tiga lab yang dipakai sesi berisi praktikan kelas A).
4. Selama masa transisi, rules masih menerima jalur `kelas` lama (ditandai `TRANSISI-SPRINT4`) agar aplikasi Sprint 3 tetap berjalan sampai query praktikan dipindah ke keanggotaan lab (kontrak §8).
5. Pembayaran Sandbox diuji dengan simulator Midtrans; tidak ada uang sungguhan.

## 2. Aktor dan Hak Akses

| Kemampuan | Praktikan | Asprak (`asisten`) | Aslab (`aslab`) |
| --- | --- | --- | --- |
| Mendaftar sendiri | Ya | Ya (kode undangan) | **Tidak** (seed/Admin SDK) |
| Melihat sesi | Sesi lab tempat ia terdaftar | Semua sesi; mengelola hanya sesi lab tempat ia terdaftar | Semua sesi (dashboard) |
| Membuat, membuka, menutup sesi | Tidak | Ya, di lab tempat ia terdaftar | Tidak |
| Presensi dan mengajukan izin | Ya, di sesi lab tempat ia terdaftar | Tidak | Tidak |
| Memutuskan izin | Tidak | Ya | Tidak |
| Tambah, ubah, hapus lab (lokasi, radius, grace period) | Tidak | **Tidak lagi** | Ya, untuk mata kuliah miliknya |
| Insert/pindah praktikan dan Asprak ke lab | Tidak | Tidak | Ya |
| Dashboard keberlangsungan lab | Tidak | Tidak | Ya |
| Melihat tagihan denda | Milik sendiri | Tagihan lab tempat ia terdaftar | Semua |
| Membayar denda | Milik sendiri | Tidak | Tidak |
| Menulis tagihan dan transaksi | Tidak (hanya server) | Tidak (hanya server) | Tidak (hanya server) |

## 3. Arsitektur dan Model Data

### 3.1 Arsitektur

```
[Aplikasi Expo]  --Firebase JS SDK-->  [Firestore]  <--Admin SDK--  [Vercel Functions: server/]
      |                                                                   ^        |
      |--HTTPS + Firebase ID token--> /api/fines/generate, /api/payments/create      |
      |                                                                            v
      |--expo-web-browser--> [Halaman Snap Midtrans Sandbox] --webhook--> /api/payments/notification
```

- Aplikasi tetap membaca dan menulis data biasa langsung ke Firestore (dijaga rules).
- Aplikasi **tidak pernah** menulis `bills` dan `payments`; keduanya hanya ditulis server dengan Admin SDK.
- Server memverifikasi pemanggil dengan Firebase ID token (`Authorization: Bearer`) dan peran dari `users/{uid}`.
- Rahasia (service account Firebase, Server Key, Signature Secret Key) hanya ada di environment Vercel.

### 3.2 Model Data (ringkas)

Rincian field, ID dokumen, dan penulis: **kontrak §2**. Ringkasan perubahan:

```
mataKuliah/{id}                 { kode, nama }                                          // BARU, ditulis seed
users/{uid}                     { ...v3, mataKuliahIds? }                              // aslab; kelas kini opsional
labs/{labId}                    { ...v3, mataKuliahId, praktikanEmails[], asprakEmails[], graceMinutes }   // DIUBAH
sessions/{id}                   tetap; dikelola Asprak lab sesi
attendances, izin               tetap; kelas tidak lagi wajib
bills/{sessionId}_{userId}      { userId, userEmail, sessionId, labId, mataKuliahId, attendanceId,
                                  amount, lateMinutes, status, createdAt, updatedAt, paidAt?, lastOrderId? }   // BARU, server
payments/{orderId}              { billId, userId, amount, status, midtransStatus, paymentType?,
                                  redirectUrl?, createdAt, updatedAt, settledAt? }                            // BARU, server
```

`orderId = {billId}-{n}`, unik per percobaan bayar karena Midtrans mewajibkan `order_id` unik.

### 3.3 Alur Denda

```
[Asprak] tutup sesi (status open -> closed) berhasil
  -> aplikasi memanggil POST /api/fines/generate { sessionId }
  -> server: pemanggil = Asprak lab sesi? sesi sudah closed?
  -> untuk setiap presensi sesi: telat bila waktu presensi > startAt + graceMinutes lab
  -> buat bills/{sessionId}_{userId} status 'unpaid' bila belum ada (dilewati bila sudah ada)
  -> kirim N7 ke praktikan yang mendapat tagihan baru
```

- Praktikan dengan izin disetujui tidak memiliki presensi, sehingga tidak mendapat tagihan. Catatan izin tetap "tidak hadir dengan izin".
- Pembayaran **tidak** mengubah data kehadiran.
- Bila pemanggilan gagal (mis. offline), sesi tetap tertutup dan Asprak dapat mengulang pembuatan denda dari detail sesi; pemanggilan ulang aman karena idempoten.

### 3.4 Alur Pembayaran

```
[Praktikan] buka tagihan 'unpaid'/'failed' -> "Bayar"
  -> POST /api/payments/create { billId } -> server membuat transaksi Snap -> { orderId, snapToken, redirectUrl }
  -> tagihan 'pending'; aplikasi membuka redirectUrl dengan expo-web-browser
  -> praktikan menyelesaikan pembayaran di simulator Midtrans Sandbox
[Midtrans] -> POST /api/payments/notification
  -> server verifikasi signature_key -> petakan status -> update payments dan bills (idempoten) -> N8/N9
[Aplikasi] status tagihan berubah lewat listener Firestore (bukan dari respons browser)
```

Status hanya ditentukan dari webhook yang lolos verifikasi; kembalinya praktikan dari halaman Snap tidak menandai tagihan lunas.

### 3.5 Status Tagihan dan Pembayaran

Pemetaan status Midtrans ke `PaymentStatus` dan transisi `BillStatus` (`unpaid`, `pending`, `success`, `failed`): **kontrak §4**. Di UI: `unpaid` = "Belum dibayar", `pending` = "Menunggu pembayaran", `success` = "Lunas", `failed` = "Gagal, bayar ulang".

### 3.6 Kontrak API

Tiga endpoint bisnis dan `GET /api/health`, beserta auth, body, respons, dan kode error: **kontrak §3**. Aplikasi membaca basis URL dari `EXPO_PUBLIC_API_BASE_URL`.

## 4. Kebutuhan Fungsional

Kolom **Status** membandingkan dengan SRS v3.3: *Tetap*, *Diubah*, atau *Baru*. Kode FR-60 s.d. FR-78 sama dengan form awal Sprint 4.

### 4.1 Daftar Kebutuhan

**Aslab dan manajemen laboratorium (Ibrahim)**

| ID | Kebutuhan | Peran | Status | Prioritas |
| --- | --- | --- | --- | --- |
| FR-60 | Aslab masuk dengan akun yang dibuat lewat seed (tanpa pendaftaran mandiri) dan diarahkan ke menu Aslab (`/aslab`) yang hanya menampilkan mata kuliah miliknya. | Aslab | Baru | Must |
| FR-61 | Aslab menambah, mengubah, dan menghapus lab pada mata kuliah miliknya: nama, gedung, koordinat, dan radius validasi presensi. Layar kelola lab Sprint 3 dipindah dari menu asisten ke menu Aslab. Lab yang masih dipakai sesi belum Ditutup tidak dapat dihapus. | Aslab | Diubah (dari FR-40, FR-41, FR-43) | Must |
| FR-62 | Aslab mengatur batas toleransi keterlambatan (`graceMinutes`, 0–60 menit, bawaan 15) per lab. | Aslab | Baru | Must |
| FR-63 | Aslab menambahkan lab satu per satu (form) maupun sekaligus dari CSV untuk satu mata kuliah. | Aslab | Baru | Must |
| FR-64 | Aslab menambahkan praktikan ke lab tertentu satu per satu (email) maupun sekaligus dari CSV. | Aslab | Baru | Must |
| FR-65 | Aslab menambahkan Asprak ke lab tertentu satu per satu (email) maupun sekaligus dari CSV. | Aslab | Baru | Must |
| FR-66 | Setiap jenis bulk insert (lab, praktikan, Asprak) memiliki **template CSV** yang dapat diunduh (header + satu baris contoh). Ketiga bulk insert terpisah. | Aslab | Baru | Must |
| FR-67 | Hasil bulk insert ditampilkan sebagai daftar yang dapat digulir sebelum disimpan: setiap baris dapat diterima/ditolak, diubah, dan dilengkapi; ada aksi "terima semua yang valid"; baris dengan email yang belum punya akun diberi peringatan "akun belum terdaftar" tetapi tetap boleh diterima. | Aslab | Baru | Must |
| FR-68 | Aslab memindahkan praktikan dan Asprak dari satu lab ke lab lain pada mata kuliah yang sama. Jadwal sesi tidak ikut dipindah. Setelah dipindah, praktikan mengikuti sesi lab barunya. | Aslab | Baru | Must |
| FR-69 | Dashboard Aslab menampilkan jumlah lab dan praktikan, status kegiatan setiap lab (ada sesi Dibuka atau tidak), lokasi dan waktu pelaksanaan, serta jadwal yang sedang berlangsung dan akan datang. Data dari `labs` dan `sessions` di Firestore. | Aslab | Baru | Must |
| FR-70 | Dashboard Aslab menampilkan riwayat kegiatan lab (sesi yang sudah Ditutup) dan riwayat keuangan denda (jumlah tagihan, lunas, belum lunas, total nominal) dengan filter hari, minggu, dan bulan. | Aslab | Baru | Must |

**Asprak, denda, dan pembayaran (Dhimas)**

| ID | Kebutuhan | Peran | Status | Prioritas |
| --- | --- | --- | --- | --- |
| FR-71 | Asprak melihat daftar lab, jadwal, dan sesi yang menjadi tanggung jawabnya (lab tempat emailnya terdaftar) dan hanya dapat membuat, membuka, dan menutup sesi di lab tersebut. Asprak tidak memiliki menu distribusi praktikan maupun konfigurasi lab. Perubahan status sesi tetap tersinkron realtime ke aplikasi praktikan. | Asprak | Diubah | Must |
| FR-72 | Saat Asprak menutup sesi, sistem menentukan praktikan yang terlambat: waktu presensi (server) setelah `startAt + graceMinutes` lab. Presensi sebelum atau tepat pada batas toleransi dianggap tepat waktu. | Asprak → sistem | Baru | Must |
| FR-73 | Setiap keterlambatan menghasilkan **tepat satu** tagihan bernominal tetap (Rp5.000) yang tertaut ke praktikan, sesi, dan catatan presensi. Praktikan dengan izin disetujui tercatat tidak hadir dengan izin dan tidak didenda. Pembayaran tidak mengubah status kehadiran. | Sistem | Baru | Must |
| FR-74 | Praktikan melihat daftar tagihan denda beserta rincian (praktikum, sesi, tanggal, menit terlambat, nominal, status). | Praktikan | Baru | Must |
| FR-75 | Praktikan membayar tagihan `unpaid`/`failed`: transaksi dibuat lewat backend, lalu praktikan diarahkan ke halaman pembayaran Midtrans Sandbox. Tidak ada secret key di aplikasi. | Praktikan | Baru | Must |
| FR-76 | Status pembayaran (`pending`, `success`, `failed`) ditentukan dari callback/webhook Midtrans yang diverifikasi di backend, lalu status tagihan diperbarui. Notifikasi ganda tidak mengubah data dua kali. | Sistem | Baru | Must |
| FR-77 | Praktikan menerima notifikasi saat tagihan baru dibuat (N7), pembayaran berhasil (N8), dan pembayaran gagal atau perlu tindakan lanjut (N9); diketuk membuka detail tagihan. | Praktikan | Baru | Must |
| FR-78 | Halaman riwayat pembayaran menampilkan sesi, tanggal tagihan, nominal, waktu transaksi, dan status; tetap tersedia setelah aplikasi ditutup dan dibuka kembali (data dari Firestore). | Praktikan | Baru | Must |

**Kebutuhan lama yang diubah karena keanggotaan lab (Dhimas)**

| ID | Perubahan | Prioritas |
| --- | --- | --- |
| FR-32 / FR-33 | Halaman presensi menampilkan sesi hari ini dari **lab tempat praktikan terdaftar**, bukan dari `kelas`. | Must |
| FR-07 / FR-35 | Syarat "kelas sama" pada presensi diganti "terdaftar di lab sesi". Syarat lain (sesi Dibuka, kode, radius, akurasi, lokasi asli, sekali per sesi) tetap. | Must |
| FR-47 | Panel info lab menampilkan sesi praktikan berdasarkan keanggotaan lab. | Must |
| FR-51 | Penerima notifikasi N1–N4 dan N6 dihitung dari `praktikanEmails` lab sesi. | Must |
| Pendaftaran | Praktikan tidak lagi memilih kelas saat mendaftar. | Should |

**Lintas fitur**

| ID | Kebutuhan | Pemilik | Prioritas |
| --- | --- | --- | --- |
| FR-31 | Security rules diperluas untuk peran Aslab, keanggotaan lab, `mataKuliah`, `bills`, dan `payments` (bagian 6). | Elang | Must |
| FR-12 | Alur demo Sprint 4 (bagian 9) berjalan end-to-end. | Semua | Must |

Kebutuhan finalisasi antarmuka dicatat sebagai NFR-19 (bagian 7).

**Urutan pemangkasan bila waktu tidak cukup** (keputusan PM saat pemantauan, bukan rencana awal): (1) filter minggu/bulan di FR-70 dirapikan belakangan, filter hari tetap ada; (2) pemindahan Asprak di FR-68 (pemindahan praktikan tetap); (3) single insert Asprak di FR-65 lewat bulk saja. FR-72 s.d. FR-76 **tidak boleh dipangkas** karena menjadi inti studi kasus.

### 4.2 Aturan Validasi (tambahan)

| Input | Aturan |
| --- | --- |
| Lab (form dan CSV) | Aturan v3.3 (nama 2–50 karakter unik, gedung ≤ 60, koordinat valid, radius 10–200) + `mataKuliahId` milik Aslab + `graceMinutes` bilangan bulat 0–60 |
| Email (praktikan/Asprak) | Format email valid; dinormalisasi `trim` + huruf kecil sebelum disimpan; tidak ganda dalam satu lab |
| Satu praktikan | Terdaftar paling banyak di satu lab untuk satu mata kuliah (pindah = keluar dari lab lama lalu masuk lab baru) |
| CSV | UTF-8, pemisah `,` atau `;` (dideteksi otomatis), baris pertama header sesuai template, maksimal 500 baris data per unggahan |
| Kolom template lab | `nama`, `gedung`, `lat`, `lng`, `radiusM`, `graceMinutes` (mata kuliah dipilih di layar, bukan di CSV) |
| Kolom template praktikan / Asprak | `email`, `nama` (nama hanya informasi; lab dipilih di layar) |
| Nominal denda | Bilangan bulat rupiah dari `DENDA_NOMINAL` server (bawaan 5000); disalin ke tagihan saat dibuat |

Fungsi validasi berupa fungsi murni di `src/features/bulk/**` dan `src/features/aslab/**` (Ibrahim). Konstanta di `src/constants/denda.ts`.

### 4.3 Pesan Error (tambahan)

| Kondisi | Pesan | Aksi |
| --- | --- | --- |
| Baris CSV tidak valid | "Baris {n}: {kolom} {alasan}." | Ubah di daftar review |
| Email belum punya akun (peringatan) | "Akun belum terdaftar. Praktikan akan masuk lab ini setelah mendaftar dengan email yang sama." | Tetap dapat diterima |
| Header CSV tidak sesuai | "Format file tidak sesuai template. Unduh template lalu coba lagi." | "Unduh template" |
| Email ganda di lab | "Email ini sudah terdaftar di lab {lab}." | n/a |
| Gagal membuat denda setelah tutup sesi | "Sesi ditutup, tetapi denda belum dibuat. Coba lagi." | "Buat denda" |
| Gagal membuat transaksi | "Pembayaran belum bisa dimulai. Periksa koneksi lalu coba lagi." | "Coba lagi" |
| Kembali dari Snap tanpa status final | "Menunggu konfirmasi pembayaran dari Midtrans." | n/a (status berubah otomatis) |
| Pembayaran gagal/kedaluwarsa | "Pembayaran belum berhasil. Silakan bayar ulang." | "Bayar ulang" |

Pesan error v3.3 tetap berlaku.

### 4.4 Peristiwa Notifikasi (tambahan)

N7 (tagihan baru), N8 (pembayaran berhasil), dan N9 (pembayaran gagal/perlu tindakan) dikirim **dari server** lewat Expo Push API ke token di `users/{uid}/devices`. Pemicu, penerima, judul/isi, payload, dan tujuan ketuk: **kontrak §5**. N1–N4 dan N6 tetap seperti v3.3 §4.4, dengan penerima dihitung dari keanggotaan lab.

### 4.5 Status Akhir Kebutuhan

Diisi PM setelah audit `main` sebelum gladi (Minggu 29 Nov atau Senin 30 Nov 2026), dengan kolom: ID, prioritas, status (Selesai/Sebagian/Ditunda), catatan/PR.

## 5. Integrasi AI

Tidak berubah dari v2.2 bagian 5 (model sentimen EDOM lokal untuk izin).

## 6. Keamanan dan Firebase Security Rules

### 6.1 Prinsip (tambahan)

- **Rahasia hanya di server.** Service account Firebase, Server Key, dan Signature Secret Key Midtrans hanya ada di environment Vercel; tidak di repo, `.env` aplikasi, maupun chat grup. Pola `*firebase-adminsdk*.json` diabaikan git.
- **Klien hanya membaca uang.** `bills` dan `payments` tidak dapat ditulis klien; semua perubahan lewat Admin SDK.
- **Status dari webhook terverifikasi**, bukan dari respons halaman pembayaran.
- **Least privilege:** Server Key Midtrans `rawuh-backend` hanya berizin Snap Checkout (Write) dan Core API (Read), tanpa kapabilitas refund/cancel.
- Rules hanya di-deploy oleh Elang.

### 6.2 Ringkasan Akses per Koleksi (tambahan dan perubahan)

| Koleksi | Baca | Tulis |
| --- | --- | --- |
| `users` | Pemilik, Asprak, **Aslab** | Pendaftaran praktikan/Asprak; role `aslab` ditolak dari klien |
| `mataKuliah` | Pengguna login | Tidak ada (seed) |
| `labs` | Pengguna login | **Aslab** pemilik mata kuliah, dengan validasi field (4.2); Asprak tidak lagi |
| `sessions` | Asprak, Aslab, praktikan anggota lab (+ jalur kelas lama selama transisi) | Asprak yang terdaftar di lab sesi |
| `attendances`, `izin` | Tetap + Aslab | Praktikan anggota lab sesi (+ jalur kelas lama selama transisi) |
| `bills` | Pemilik, Asprak lab terkait, Aslab | **Tidak ada** (server) |
| `payments` | Pemilik, Asprak lab terkait, Aslab | **Tidak ada** (server) |

Rules lengkap: `firestore.rules`. Query praktikan untuk sesi memakai `where('labId', '==', X)` per lab keanggotaan (kontrak §2).

### 6.3 Pengujian Rules

Rules diuji di Firestore Emulator dengan **56 kasus** (`scripts/rules-test/rules.test.js`, semua lulus pada PR #2), termasuk praktikan tanpa kelas, jalur kelas lama, query list per `labId`, tulis lab oleh Aslab/Asprak, dan larangan tulis `bills`/`payments`. Setiap PR yang mengubah rules wajib menjalankan ulang uji ini.

### 6.4 Risiko Sisa yang Diterima (tambahan)

- **Keanggotaan berbasis email tanpa verifikasi email.** Karena akun tidak wajib ada saat dimasukkan ke lab, orang lain dapat mendaftar lebih dulu memakai email praktikan yang belum terdaftar dan otomatis menjadi anggota lab. Penangkal penuh (`email_verified`) membutuhkan alur verifikasi email dan masuk backlog.
- **Masa transisi rules.** Selama cabang `TRANSISI-SPRINT4` ada, praktikan juga dapat mengakses sesi lewat kesamaan `kelas`; memindahkan praktikan antar lab belum mencabut akses jalur lama. Cabang dihapus sebelum gladi (kontrak §8).
- **Semua Asprak terdaftar di semua lab** hasil migrasi seed; distribusi dirapikan Aslab lewat fitur FR-65/FR-68.
- **Vercel Hobby** hanya untuk pemakaian non-komersial; sesuai untuk praktikum dengan Midtrans Sandbox.
- **Pembuatan denda bergantung pada aplikasi Asprak** yang memanggil endpoint setelah menutup sesi; bila gagal, denda dibuat ulang manual (3.3). Penutupan sesi lewat Firebase Console tidak memicu denda.
- **Akses expo.dev hanya pada pemegang akun EAS**; PM memeriksa build lewat tangkapan layar detail build.

## 7. Kebutuhan Non-Fungsional

NFR-01 s.d. NFR-18 dari v3.3 tetap berlaku.

| ID | Kebutuhan |
| --- | --- |
| NFR-19 Konsistensi antarmuka | Semua layar baru dan lama untuk tiga peran memakai token `src/theme` dan komponen `components/ui` sesuai `DESIGN.md`: tidak ada warna langsung, tipografi dan jarak seragam, tombol ≥ 44dp, empty/loading/error state di setiap daftar, label status tidak hanya warna. |
| NFR-20 Keamanan pembayaran | Tidak ada secret key Midtrans maupun service account di bundle aplikasi; status pembayaran hanya berubah lewat webhook terverifikasi. |
| NFR-21 Persistensi riwayat | Tagihan dan riwayat pembayaran tersimpan di Firestore dan tampil kembali setelah aplikasi ditutup dan dibuka. |
| NFR-22 Webhook | Endpoint webhook membalas ≤ 5 detik dan bersifat idempoten terhadap notifikasi ganda. |
| NFR-23 Biaya | Tetap tanpa layanan berbayar atau kartu: Firebase Spark, Vercel Hobby, Midtrans Sandbox, Expo Push Service, OpenFreeMap. |
| NFR-24 Bulk insert | Unggahan 500 baris dapat ditinjau tanpa membeku (daftar tervirtualisasi) dan disimpan dalam batch. |

## 8. Navigasi dan Interaksi

```
/aslab  (BARU)                                                                                     [Ibrahim]
  index                 Dashboard keberlangsungan lab (FR-69, FR-70)
  lab/**                Daftar, tambah/ubah lab, pengaturan radius & grace period (FR-61, FR-62)
  bulk/**               Pilih jenis, unduh template, unggah CSV, layar review (FR-63–FR-67)
  anggota/**            Anggota lab, pindah praktikan/Asprak (FR-64, FR-65, FR-68)
/asisten  (Asprak)                                                                                 [Dhimas]
  index, sesi/**        Hanya lab dan sesi tanggung jawabnya; tutup sesi memicu pembuatan denda (FR-71, FR-72)
  lab/** (Sprint 3)     Dipindah ke /aslab (FR-61)
/praktikan                                                                                         [Dhimas]
  tagihan (BARU)        Daftar dan detail tagihan, tombol Bayar (FR-74, FR-75)
  riwayat bayar (BARU)  Riwayat pembayaran (FR-78)
  presensi, jadwal      Berdasarkan keanggotaan lab
```

- Root routing mengarahkan role `aslab` ke `/aslab` (titik belokan disediakan Dhimas, isi oleh Ibrahim).
- Nama rute tagihan dan letaknya di tab ditentukan Dhimas; navigasi ketuk N7–N9 menuju detail tagihan.
- Halaman Snap dibuka di browser dalam aplikasi; setelah ditutup, aplikasi kembali ke detail tagihan dan menunggu status dari Firestore.

## 9. Skenario Demo (kriteria penerimaan utama)

Dijalankan di dua HP Android (development build terbaru atau APK preview) dengan Firebase dan backend Vercel sungguhan. Prasyarat: akun Aslab dari seed; akun Asprak (mis. Dina) dan dua praktikan (mis. Bagas, Citra) yang notifikasinya diizinkan.

### Alur 4: Aslab mengelola lab dan distribusi

1. Aslab login → diarahkan ke dashboard Aslab (FR-60).
2. Aslab mengunduh template lab, mengisi 2 lab di Excel, mengunggahnya → daftar review tampil; satu baris diubah, satu ditolak, lalu disimpan (FR-63, FR-66, FR-67).
3. Aslab mengatur koordinat lab demo dengan "Pakai lokasi saya", radius 50 m, grace period 10 menit (FR-61, FR-62).
4. Aslab mengunggah CSV praktikan berisi email Bagas, Citra, dan satu email belum terdaftar → peringatan "akun belum terdaftar" tampil, semua diterima (FR-64, FR-67).
5. Aslab menambahkan Dina ke lab demo secara single insert (FR-65).
6. Aslab memindahkan Citra ke lab lain → di HP Citra, sesi lab lama hilang dan sesi lab baru tampil (FR-68).

### Alur 5: Asprak, keterlambatan, dan denda

1. Dina hanya melihat lab tempat ia terdaftar; menu kelola lab tidak ada (FR-71).
2. Dina membuat sesi di lab demo dengan jam mulai **lebih dari 10 menit yang lalu**, lalu membukanya → Bagas menerima N1 (FR-71).
3. Bagas presensi (di dalam radius) → tercatat **terlambat** karena melewati batas toleransi.
4. Dina menutup sesi → backend membuat tagihan Bagas Rp5.000; HP Bagas menerima **N7** (FR-72, FR-73, FR-77).
5. Dina menutup ulang/memicu ulang pembuatan denda → tidak ada tagihan ganda (FR-73).
6. (Tepi) Praktikan dengan izin disetujui di sesi itu tidak mendapat tagihan dan tetap tercatat izin (FR-73).

### Alur 6: Pembayaran denda

1. Bagas membuka tab tagihan → tagihan "Belum dibayar" dengan rincian (FR-74).
2. Bagas menekan Bayar → halaman Snap Sandbox terbuka (FR-75).
3. Bagas menyelesaikan pembayaran dengan simulator Midtrans → menutup browser → status berubah "Menunggu" lalu "Lunas" tanpa memuat ulang; HP menerima **N8** (FR-76, FR-77).
4. Riwayat pembayaran menampilkan transaksi itu; aplikasi ditutup paksa lalu dibuka → riwayat tetap ada (FR-78).
5. (Tepi) Pembayaran dibiarkan kedaluwarsa/dibatalkan di simulator → status "Gagal, bayar ulang" dan N9; bayar ulang berhasil (FR-76, FR-77).
6. Status kehadiran Bagas di rekap tetap "hadir" sebelum dan sesudah bayar (FR-73).

### Alur 7: Dashboard

1. Aslab membuka dashboard → jumlah lab dan praktikan, lab yang sedang ada sesi Dibuka, jadwal berlangsung dan akan datang (FR-69).
2. Filter "hari ini" lalu "minggu ini" → riwayat kegiatan dan keuangan (1 tagihan, lunas Rp5.000) berubah sesuai filter (FR-70).

### Skenario Tepi (wajib lolos sebelum sign-off)

| Kasus | Hasil yang diharapkan |
| --- | --- |
| CSV dengan pemisah `;` (Excel Indonesia) | Terbaca benar |
| CSV dengan header salah | Ditolak dengan pesan + tombol unduh template |
| Email huruf besar/spasi di CSV | Disimpan huruf kecil tanpa spasi; cocok dengan akun |
| Presensi tepat di batas toleransi | Tidak telat, tanpa tagihan |
| Webhook dengan signature salah (uji manual) | Ditolak 403, data tidak berubah |
| Notifikasi webhook ganda | Data dan push tidak ganda |
| Praktikan mencoba menulis `bills` lewat klien | Ditolak rules |
| Asprak mencoba mengubah lab | Ditolak rules; menu tidak tersedia |
| Offline saat menutup sesi | Sesi tertutup; denda dapat dibuat ulang |

## 10. Struktur File dan Kepemilikan

Kepemilikan file Sprint 4: **kontrak §6**. Ringkas:

- **Ibrahim:** `src/app/aslab/**`, `src/features/aslab/**`, `src/features/bulk/**`, `src/services/aslab.ts`, `src/store/aslabStore.ts`, komponen baru di `src/components/**` untuk domainnya, pemindahan layar kelola lab, serta `DESIGN.md` (lanjutan Sprint 3).
- **Dhimas:** `server/**` (kecuali seed), `src/services/denda.ts`, `src/services/payments.ts`, `src/store/dendaStore.ts`, layar tagihan dan riwayat di `src/app/praktikan/**`, penyesuaian `src/app/asisten/**`, `src/store/appStore.ts`, `src/store/sync.ts`, `src/services/sessions.ts`, root layout, konfigurasi native (`app.json`, `eas.json`, `package.json`).
- **Elang:** `src/types/**`, `src/constants/denda.ts`, `firestore.rules`, `server/scripts/seed-sprint4.ts`, `docs/KONTRAK-SPRINT4.md`, `docs/SRS.md`.

Aturan v3.3 tetap berlaku. Tambahan: perubahan tipe, rules, atau kontrak oleh programmer lewat PR terpisah yang disetujui PM; `server/lib/contract.ts` dan `src/types/api.ts` selalu diubah bersamaan; dua store baru tidak menambah state ke `appStore`.

## 11. Pembagian Tugas dan Tahapan Pengerjaan

**Batas pengerjaan: Senin 30 Nov 2026 pukul 23.59.** Domain A (Ibrahim) dan B (Dhimas) dikerjakan **paralel**; di dalam tiap domain, tahap dikerjakan **berurutan**.

### 11.1 Peran

| Orang | Peran | Bertanggung jawab atas |
| --- | --- | --- |
| Elang | Project Manager | SRS, kontrak dan Tahap 0, akun Vercel/Midtrans, deploy rules, persetujuan PR kontrak, review dan merge PR, pemantauan tahap, audit `main`, gladi dan sign-off, form awal dan akhir |
| Ibrahim | Developer Domain A | FR-60 s.d. FR-70, NFR-19 untuk layar Aslab, `DESIGN.md` |
| Dhimas | Developer Domain B | FR-71 s.d. FR-78, perubahan FR lama karena keanggotaan lab, NFR-19 untuk layar praktikan/Asprak, dev build dan APK preview |

### 11.2 Tugas PM

| ID | Tugas | Status |
| --- | --- | --- |
| P-01 | Keputusan teknis Sprint 4 (backend, peran, denda, bulk insert, keanggotaan) | Selesai 25–26 Nov |
| P-02 | Repo `pertemuan-9`, proteksi `main` | Selesai 25 Nov |
| P-03 | Tahap 0: PR #1 dependency, PR #2 kontrak (tipe, rules + uji emulator, kerangka `server/`, seed, kontrak) | Selesai 26 Nov |
| P-04 | Seed `--apply`, deploy rules, Vercel + env, Midtrans Sandbox + Notification URL | Selesai 26 Nov |
| P-05 | Form awal (FR-60 s.d. FR-78, link repo) | Selesai |
| P-06 | SRS v4.0 | 27 Nov |
| P-07 | Review/merge PR, persetujuan PR kontrak, deploy rules, menghapus cabang `TRANSISI-SPRINT4` | Sepanjang sprint |
| P-08 | Audit `main`, gladi Alur 4–7 + skenario tepi, sign-off, SRS final (4.5), form akhir | Minggu–Senin |

### 11.3 Tahapan

| Tahap | Ibrahim (A) | Dhimas (B) | Gerbang |
| --- | --- | --- | --- |
| **0. Fondasi** | - | Dev build dari `main` setelah PR #2 | **Selesai** 26 Nov |
| **1** | FR-60 role & routing Aslab, FR-61 CRUD lab (pindah dari asisten), FR-62 grace period | FR-72/FR-73 `fines/generate` + tutup sesi memicu denda, FR-74 daftar tagihan, FR-71 pembatasan Asprak | Aslab dapat membuat lab; tutup sesi menghasilkan tagihan |
| **2** | FR-66 template, FR-67 komponen review generik, FR-63/64/65 bulk & single insert, FR-68 pindah | FR-75 `payments/create` + Snap, FR-76 webhook, perubahan FR lama ke keanggotaan lab | Alur 4 dan Alur 6 langkah 1–3 lolos |
| **3** | FR-69, FR-70 dashboard | FR-77 notifikasi N7–N9, FR-78 riwayat; `eas.json` preview + `EXPO_PUBLIC_API_BASE_URL` | Alur 5 dan Alur 7 lolos |
| **4** | NFR-19 layar Aslab, `DESIGN.md` | NFR-19 layar praktikan/Asprak, APK preview untuk demo | Semua alur + skenario tepi lolos |

Catatan:

- PR rules/tipe yang dibutuhkan di tengah tahap diajukan sedini mungkin karena perlu persetujuan dan deploy oleh PM.
- Bila satu tahap tersendat, PM memakai urutan pemangkasan di 4.1, bukan melompati gerbang.
- Penghapusan cabang `TRANSISI-SPRINT4` dilakukan setelah Dhimas menyelesaikan perubahan FR lama (Tahap 2).

## 12. Alur Git dan Konfigurasi

- Aturan v3.3 bagian 12 tetap: `main` wajib lewat PR (approval tidak diwajibkan secara teknis), merge oleh PM, PR kontrak menunggu persetujuan PM, branch otomatis dihapus, commit head-body huruf kecil tanpa scope, tanpa trailer `Co-Authored-By`.
- Branch: `feat/<nama>-<topik>`, `fix/...`, `chore/...`, `docs/...`. Satu tugas = satu PR.
- **Backend:** Vercel men-deploy `main` ke `https://rawuh-ppk.vercel.app` dan membuat **preview deployment** untuk setiap PR yang mengubah `server/` (env tersedia di Production dan Preview).
- **Rahasia:** tidak pernah di repo atau grup. Nilai env server untuk uji lokal (`server/.env.local`, diabaikan git) diberikan PM lewat chat pribadi bila diperlukan.
- **Development build:** dibuat Dhimas dari `main` setelah PR #2 (dikonfirmasi lewat detail build). Tidak ada modul native baru yang direncanakan; bila ada, wajib PR terpisah dan rebuild.
- **APK preview demo:** `eas.json` profile `preview` memuat `EXPO_PUBLIC_API_BASE_URL` (bukan rahasia). Sebelum build: `git checkout main && git pull && npm install && git status` bersih.

## 13. Definition of Done

- Alur 4, 5, 6, dan 7 berjalan penuh di dua HP Android dengan Firebase, Vercel, dan Midtrans Sandbox sungguhan.
- Seluruh FR Must (FR-60 s.d. FR-78 dan FR lama yang diubah) terpenuhi atau tercatat di 4.5 beserta alasannya; NFR-19 s.d. NFR-24 terpenuhi.
- Cabang `TRANSISI-SPRINT4` di rules dihapus, rules di-deploy, dan 56+ kasus uji emulator lulus.
- Tidak ada rahasia di repo atau bundle aplikasi; webhook memverifikasi signature.
- Tidak ada `console.error`, tidak ada `any`, tidak ada warna langsung di luar `src/theme`; `npx tsc --noEmit` aplikasi dan `npx tsc --noEmit -p server` lolos; `npx expo lint` tanpa error.
- Semua perubahan lewat PR; tidak ada push langsung ke `main`.
- `docs/SRS.md` (4.5), `docs/KONTRAK-SPRINT4.md`, `server/README.md`, dan `DESIGN.md` diperbarui. PM memberi sign-off setelah gladi.

## 14. Risiko dan Catatan

| Risiko | Mitigasi |
| --- | --- |
| Domain B paling sulit (backend, Midtrans, webhook, keamanan) | Dhimas memegang domain B; kerangka endpoint + TODO langkah demi langkah sudah ada; preview deployment per PR; PM memantau tiap tahap |
| Volume UI domain A besar (3 bulk insert + review + dashboard) | Satu komponen review generik untuk tiga jenis; urutan pemangkasan 4.1; dashboard dievaluasi di tengah sprint |
| Webhook tidak sampai saat demo | Uji webhook sehari sebelum demo; riwayat notifikasi di dashboard Midtrans; status juga dapat dicek ulang server lewat API status (Core API Read) |
| Midtrans Sandbox lambat/tidak tersedia | Uji sehari sebelum demo; alur denda (Alur 5) tetap dapat didemokan tanpa pembayaran |
| Merge conflict pada store dan root layout | Store terpisah per domain; root layout hanya Dhimas; titik belok routing Aslab disepakati |
| Transisi `kelas` → keanggotaan lab merusak alur Sprint 3 | Rules transisi; uji emulator; penghapusan cabang transisi hanya setelah klien dipindah |
| Satu-satunya pemegang EAS (Dhimas) tidak tersedia | Native dependency dipasang di Tahap 0; dev build sekali; APK preview dibuat lebih awal (Minggu) |
| Waktu sangat terbatas (± 3,5 hari) | Tahap 0 selesai sebelum programmer mulai; gerbang per tahap; pemangkasan terencana |

## 15. Utang Teknis dan Backlog

- Utang teknis v3.3 bagian 15 tetap berlaku kecuali yang diselesaikan dan dicatat di 4.5.
- Daftar `TRANSISI-SPRINT4` (kontrak §8): wajib dibereskan sebelum gladi.
- Backlog baru: verifikasi email akun (6.4), pemindahan project Expo ke Organization agar PM dapat melihat/membuat build, pensiun `kelasPraktikum` dan seed lama, uji otomatis endpoint server, ekspor laporan keuangan Aslab.

## 16. Riwayat Perubahan

| Versi | Perubahan |
| --- | --- |
| 1.0–1.3 | Sprint 1 (lihat SRS v1.3) |
| 2.0–2.2 | Sprint 2 (lihat SRS v2.2) |
| 3.0–3.3 | Sprint 3 (lihat SRS v3.3) |
| 4.0 | **Sprint 4.** PM Elang; developer Dhimas (domain denda, pembayaran, Asprak) dan Ibrahim (domain Aslab). Peran Aslab, lab sebagai rombongan per mata kuliah dengan keanggotaan email, bulk insert CSV dengan layar review generik, dashboard Aslab, perhitungan keterlambatan dengan grace period, tagihan denda dari server, pembayaran Midtrans Sandbox lewat Vercel Functions dengan verifikasi webhook, notifikasi N7–N9, riwayat pembayaran, finalisasi UI. Menambah FR-60 s.d. FR-78, NFR-19 s.d. NFR-24, Alur demo 4–7, rules baru dengan 56 kasus uji emulator, dan masa transisi `kelas` → keanggotaan lab. Tahap 0 (fondasi) dikerjakan PM sesuai izin asprak |
