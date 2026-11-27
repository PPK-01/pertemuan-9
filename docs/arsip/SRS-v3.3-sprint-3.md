# SRS & Rencana Kerja Sprint 3: Aplikasi Presensi Praktikum "Rawuh" (Lokasi, Peta, dan Notifikasi)

PM: Elang · Tim: Dhimas, Ibrahim · Sprint: 3 · Versi 3.3 (lanjutan SRS v2.2) · Repo: `PPK-01/pertemuan-8` · Batas pengerjaan: Senin 23 Nov 2026

> **Versi sebelumnya:** SRS v1.3 (Sprint 1) di `docs/arsip/SRS-v1.3-sprint-1.md`, SRS v2.2 (Sprint 2) di `docs/arsip/SRS-v2.2-sprint-2.md`. Komentar kode dan `DESIGN.md` yang ditulis sebelum Sprint 3 dengan rujukan "SRS §x" atau "SRS v2.2 §x" mengacu ke **v2.2**. Rujukan baru sejak Sprint 3 ditulis "SRS v3 §x".

> **Patokan v3.3:** dokumen ini menggambarkan kondisi `main` terakhir (PR #1–#25). Perubahan setelah batas pengerjaan Senin 23 Nov 2026 (PR #22–#25, di-merge 25 Nov 2026) ditandai **pasca-batas**. Status akhir tiap kebutuhan ada di 4.5 dan utang teknis di bagian 15.

## 1. Pendahuluan

### 1.1 Tujuan

Dokumen ini mendefinisikan kebutuhan perangkat lunak Sprint 3 dan melanjutkan SRS v2.2 (Sprint 2). Pada Sprint 2 aplikasi sudah memiliki akun Firebase, data Firestore yang tersinkron realtime, presensi berkode, izin, dan pemeriksaan izin berbantuan AI. Sprint 3 menambahkan tiga kemampuan perangkat, yaitu **lokasi**, **peta**, dan **push notification**, agar presensi hanya berhasil di sekitar lab, pengguna dapat melihat sebaran dan aktivitas lab Informatika, dan pengguna terkait menerima pemberitahuan saat ada peristiwa penting. Dokumen ini juga membagi file dan tugas Dhimas dan Ibrahim serta menetapkan urutan tahap pengerjaan agar tidak terjadi merge conflict.

### 1.2 Ruang Lingkup

**Berubah dari Sprint 2:**

- Presensi dipindah ke **halaman presensi khusus** yang terpisah dari detail sesi.
- Presensi wajib lolos **validasi lokasi**: sesi Dibuka **dan** perangkat berada di dalam radius lab sesi.
- Data **lab** (nama, koordinat, radius) dikelola asisten dan disimpan di Firestore. Sesi kini merujuk lab (`labId`) sebagai pengganti teks `ruang`.
- **Peta lab interaktif** dengan marker lab, posisi perangkat sendiri, dan panel **informasi aktivitas lab** (sesi yang berlangsung dan berikutnya) yang realtime.
- **Push notification** lewat Expo Push Service (diteruskan ke Firebase Cloud Messaging di Android), dikirim aplikasi asisten segera setelah peristiwa terjadi, hanya ke pengguna terkait.
- Penanganan **izin dan kondisi perangkat**: izin lokasi ditolak, layanan lokasi mati, lokasi palsu, akurasi buruk, dan koneksi bermasalah.
- **Rebuild** development build dengan identitas aplikasi baru dan modul native baru.

**Di luar lingkup Sprint 3 (backlog):** posisi realtime pengguna lain di peta, lokasi di latar belakang, rute/arah ke lab, presensi QR code (Could, FR-45), aplikasi iOS resmi, pencarian alamat (geocoding), riwayat notifikasi di dalam aplikasi, serta backlog Sprint 2 yang belum tersentuh (pengajuan ulang izin, reset kata sandi, cache offline persisten). Demo dan kriteria penerimaan **hanya di Android**.

**Eksperimental, di luar kriteria penerimaan (pasca-batas, PR #24 dan #25):** dukungan iOS lewat LiveContainer dengan notifikasi lewat relay Bark. Ini tambahan opsional agar tim yang memakai iPhone dapat mencoba aplikasi; kegagalannya tidak memengaruhi jalur Android dan tidak termasuk Definition of Done. Panduan ada di `IOS_LIVECONTAINER_GUIDE.md`; risikonya dicatat di 6.4.

### 1.3 Yang Dipertahankan dari Sprint 2

- Stack: Expo SDK 57, TypeScript strict, Expo Router (`src/app/`), Zustand 5, Firebase **JS SDK modular** untuk Auth dan Firestore, light mode, development build Android.
- Firestore sebagai sumber kebenaran; Zustand sebagai cache yang diisi listener; aksi tulis async mengembalikan `Result` dengan pra-cek offline dan timeout 10 detik (FR-29).
- Presensi tetap memakai **kode sesi 4 digit** di `private/code`, ID dokumen `{sessionId}_{uid}`, `serverTimestamp()`, dan satu kali per sesi (FR-07 s.d. FR-09). Validasi lokasi **ditambahkan**, bukan menggantikan kode.
- Izin, AI EDOM lokal, rekap dengan kelompok Izin, CRUD kelas praktikum, security rules deny-by-default, sistem desain `DESIGN.md`, dan aturan kepemilikan file.
- Perbaikan pasca-audit Sprint 2: `createSession` dengan id yang aman dikirim ulang, `useSessionCode` berstatus, kode error kelas dibedakan (duplikat vs masih dipakai), logout mengosongkan seluruh cache, warna dari token tema.

### 1.4 Keputusan Teknis Baru

| Aspek | Keputusan | Alasan |
| --- | --- | --- |
| Biaya | **Seluruh layanan gratis tanpa kartu dan tanpa langganan.** Firebase **tetap paket Spark**; tidak ada layanan yang mewajibkan akun billing | Ketentuan PM. Karena itu Cloud Functions (wajib Blaze) dan Google Maps (wajib billing) tidak dipakai |
| Pengirim notifikasi | **Expo Push Service**, dipanggil dari aplikasi asisten (`services/push.ts`) segera setelah aksi yang menjadi peristiwa berhasil (buat sesi, buka sesi, putuskan izin, pindah lab, ubah jadwal) | Gratis tanpa kartu; di Android diteruskan lewat FCM. Semua peristiwa (N1–N4 dan N6) wajib dipicu aksi asisten di aplikasi, jadi tidak perlu server. Ditolak: Cloud Functions (wajib Blaze), server terpisah gratis seperti Cloudflare Workers (lebih aman, tetapi menambah platform dan beban kerja; cadangan di bagian 14), OneSignal (tetap butuh server), notifikasi lokal (bukan push) |
| Penerima notifikasi | **`expo-notifications`**: izin notifikasi, **Expo push token** (`getExpoPushTokenAsync`), handler notifikasi masuk dan diketuk | Pustaka resmi Expo untuk development build; token yang sama dipakai Expo Push Service |
| Kredensial FCM | `google-services.json` ditambahkan di aplikasi (tidak memuat rahasia). **Kunci akun layanan FCM V1** diunggah ke kredensial EAS oleh Dhimas dan **tidak pernah masuk repo**. Auth dan Firestore **tetap** memakai Firebase JS SDK | Syarat Expo Push Service untuk mengirim lewat FCM di Android; gratis |
| Peta | **`@maplibre/maplibre-react-native`** dengan style vektor **OpenFreeMap** (tanpa API key, tanpa registrasi, tanpa batas tampilan), atribusi OpenStreetMap ditampilkan di peta | Satu-satunya opsi native yang gratis tanpa kartu dan tanpa pendaftaran. Ditolak: Google Maps / `react-native-maps` / `expo-maps` (wajib billing), tile server OpenStreetMap langsung (melarang pemakaian berat oleh aplikasi), MapTiler/Mapbox (butuh akun dan kunci). Cadangan: WebView + MapLibre GL JS + OpenFreeMap (bagian 14) |
| Lokasi | **`expo-location`**, hanya **foreground** | Cukup untuk presensi, peta, dan form lab; privasi terjaga |
| Marker pengguna | Posisi **perangkat sendiri**, diperbarui realtime di perangkat (`watchPositionAsync`) selama layar peta terbuka, tidak dikirim ke server | Privasi, kuota tulis Firestore, dan baterai |
| Validasi radius | Jarak dihitung di klien (rumus haversine); bukti lokasi disimpan di dokumen presensi; rules memeriksa konsistensi bukti dengan radius lab | Rules Firestore tidak dapat membaca GPS (risiko sisa di 6.4) |
| Identitas aplikasi | `package` Android baru **`com.ppk01.rawuh`**, `userInterfaceStyle: "light"`, pembaruan patch Expo, dalam **satu rebuild** di Tahap 1. Akun EAS (rebuild, kredensial FCM) dipegang Dhimas | Pendaftaran FCM terikat ke `package`; satu rebuild untuk semua perubahan native |
| iOS (eksperimental, pasca-batas) | Build iOS gratis untuk LiveContainer (`IOS_LIVECONTAINER_GUIDE.md`); token berformat `bark:<key>` dikirim lewat relay Bark (`https://api.day.app/push`) bersama pengiriman Expo secara paralel; key Bark diisi manual di tab Profil | Build iOS tanpa akun developer berbayar tidak memiliki entitlement APNs sehingga Expo Push tidak dapat dipakai; di luar kriteria penerimaan dan demo tetap Android |
| Web | Tetap didukung untuk uji tampilan; **peta diganti daftar lab** di web (MapLibre native tidak berjalan di web); lokasi di web memakai geolocation browser; notifikasi tidak aktif di web. Demo hanya di Android | NFR-06 dipertahankan sejauh mungkin |

Dependency baru dipasang sekali di Tahap 1 (D-01) oleh Dhimas: `expo-location`, `@maplibre/maplibre-react-native`, `expo-notifications`, `expo-device` (bila dibutuhkan `expo-notifications`), lewat `npx expo install`. Tidak ada folder `functions/` dan tidak ada server tambahan.

### 1.5 Asumsi dan Hal yang Masih Terbuka

1. Elang (developer pada Sprint 1–2) menjadi Project Manager Sprint 3 dan tidak menulis kode fitur; pengembangnya Dhimas dan Ibrahim. File yang pada v2.2 dimiliki Elang (UI kit, tema, sisi asisten, `DESIGN.md`) berpindah ke Ibrahim.
2. **Semua layanan gratis tanpa kartu** (Firebase Spark, Expo Push Service, OpenFreeMap). OpenFreeMap disediakan apa adanya; bila tidak tersedia saat demo, rencana cadangan di bagian 14 berlaku.
3. Studi kasus sengaja dipaparkan umum oleh asisten praktikum dan implementasinya dibebaskan ke tiap kelompok. Penafsiran tim: "marker pengguna realtime" = posisi perangkat sendiri; notifikasi dikirim dari aplikasi asisten; QR code sebagai Could.
4. Lab Informatika awal diisi dari daftar nama lab (P-03); koordinatnya diatur asisten lewat aplikasi. Untuk demo, lab demo diatur di ruang demo.
5. Akurasi GPS di dalam gedung dapat buruk; radius bawaan 50 m dan batas akurasi 50 m dipilih untuk keperluan demo dan dapat disesuaikan.

## 2. Aktor dan Hak Akses

Tambahan terhadap tabel v2.2 (baris lain tetap):

| Kemampuan | Belum login | Praktikan | Asisten |
| --- | --- | --- | --- |
| Presensi | Tidak | Ya (kelasnya, sesi Dibuka, **di dalam radius lab**, sekali per sesi) | Tidak |
| Melihat daftar lab dan peta | Tidak | Ya | Ya |
| Tambah, ubah, hapus lab (koordinat, radius) | Tidak | Tidak | Ya |
| Melihat aktivitas lab | Tidak | Sesi kelasnya | Semua sesi |
| Menerima notifikasi | Tidak | Sesi dibuka, jadwal baru, keputusan izin, perubahan lokasi praktikum (kelasnya / miliknya) | Izin baru (Could, FR-55) |
| Melihat bukti lokasi presensi | Tidak | Milik sendiri | Semua (di rekap) |

## 3. Arsitektur dan Model Data

### 3.1 Struktur Firestore (tambahan dan perubahan)

```
labs/{labId}                   { nama, gedung?, lat, lng, radiusM,
                                 createdBy, createdAt, updatedBy, updatedAt }          // BARU
sessions/{sessionId}           { ...v2.2, labId }                                     // labId BARU; `ruang` lihat 3.2
attendances/{sessionId}_{uid}  { ...v2.2, labId,
                                 lokasi: { lat, lng, akurasiM, jarakM, mocked } }       // DIUBAH
users/{uid}/devices/{deviceId} { token, platform, updatedAt }                          // BARU; token = Expo push token
                                                                                          // (iOS eksperimental: `bark:<key>`, platform `ios`)
```

Keputusan struktur:

- **Sesi merujuk lab lewat `labId`.** Nama, koordinat, dan radius selalu dibaca dari `labs`, sehingga perubahan lab langsung tercermin di semua sesi dan peta.
- **Bukti lokasi disimpan di dokumen presensi** (koordinat, akurasi, jarak, status `mocked`) agar asisten dapat memeriksa dan rules dapat memvalidasi konsistensinya.
- **Token perangkat di subkoleksi `devices`** milik pengguna. Satu pengguna dapat memiliki beberapa perangkat. `deviceId` diturunkan dari token (mis. hash) agar penulisan ulang token yang sama tidak menggandakan dokumen. Asisten dapat **membaca** token praktikan untuk mengirim notifikasi, tetapi tidak dapat mengubahnya. Pada iOS eksperimental token berformat `bark:<key>` (key Bark milik pengguna, panjang ≤ 200 sesuai rules) dengan `platform: 'ios'`; token ini dihapus saat logout.

### 3.2 Model Domain (perubahan pada `src/types/index.ts`)

```ts
export type LabId = string;

Lab {
  id, nama, gedung?: string,
  lat: number, lng: number,       // titik presensi
  radiusM: number,                // MIN_RADIUS_M..MAX_RADIUS_M
  createdBy, createdAt, updatedBy, updatedAt
}

CreateLabInput { nama, gedung?, lat, lng, radiusM }   // masukan form lab
UpdateLabInput = Partial<CreateLabInput>

Session { ...v2.2, labId?: LabId }
// labId wajib untuk sesi baru (validasi form + rules create).
// Sesi baru menulis `ruang: ''`; field `ruang` hanya berisi teks pada sesi lama (Sprint 2).
// Tampilan (helper `components/session/labText.ts`): nama lab bila labId ada dan lab ditemukan;
// selain itu `ruang` bila tidak kosong; selain itu "Lab belum diatur". Selama data lab belum
// tersinkron (sesi punya labId tetapi `labs` masih dimuat) tampil "Memuat lab…", bukan "Lab belum diatur".

LokasiPresensi { lat: number, lng: number, akurasiM: number, jarakM: number, mocked: boolean }
Attendance { ...v2.2, labId?: LabId, lokasi?: LokasiPresensi }
// Pada tipe, labId dan lokasi opsional karena presensi Sprint 2 tidak memilikinya.
// Presensi baru selalu menulis keduanya, dan rules mewajibkannya saat create.

RekapItemHadir { user: User, timestamp: string, lokasi?: LokasiPresensi }   // butir `hadir` pada Rekap

DevicePosition { lat: number, lng: number, akurasiM: number, mocked: boolean, at: string }

LocationStatus =
  | 'idle'                 // belum diminta
  | 'checking'             // sedang mengambil posisi
  | 'ready'                // posisi tersedia dan layak dipakai
  | 'permission_denied'    // ditolak, masih bisa diminta lagi
  | 'permission_blocked'   // ditolak permanen (harus lewat Pengaturan)
  | 'services_off'         // layanan lokasi perangkat mati
  | 'low_accuracy'         // akurasi > MAX_ACCURACY_M
  | 'mocked'               // lokasi palsu terdeteksi
  | 'timeout'              // posisi tidak didapat dalam LOCATION_TIMEOUT_MS
  | 'unavailable'          // web/perangkat tanpa layanan lokasi

AttendFailReason = ...v2.2
  | 'NO_LAB'                // sesi belum punya lab
  | 'OUTSIDE_RADIUS'        // jarak > radius lab
  | 'LOW_ACCURACY' | 'MOCKED_LOCATION'
  | 'LOCATION_PERMISSION' | 'LOCATION_SERVICES_OFF' | 'LOCATION_TIMEOUT'

NotificationPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported'

NotifPayload =                                 // `data` pada pesan FCM
  | { type: 'session_opened', sessionId }      // N1
  | { type: 'session_created', sessionId }     // N2
  | { type: 'izin_decided', izinId }           // N3
  | { type: 'location_changed', sessionId }    // N4
// N6 "Jadwal berubah" memakai { type: 'session_created', sessionId } agar diketuk membuka detail sesi;
// tidak ada tipe payload baru.
```

Kode error `Result` untuk lab mengikuti pola kelas pasca-audit: kode "masih dipakai" untuk hapus lab yang dipakai sesi yang belum Ditutup, kode "duplikat" untuk nama lab yang sama.

Konstanta di `src/constants/location.ts`:

| Nama | Nilai | Arti |
| --- | --- | --- |
| `DEFAULT_RADIUS_M` | 50 | Radius bawaan lab baru |
| `MIN_RADIUS_M` / `MAX_RADIUS_M` | 10 / 200 | Batas radius yang boleh diatur asisten |
| `MAX_ACCURACY_M` | 50 | Akurasi GPS terburuk yang diterima untuk presensi |
| `LOCATION_TIMEOUT_MS` | 15000 | Batas waktu mengambil posisi |
| `DEV_FAKE_POSITION` | `null` | Posisi tiruan khusus `__DEV__` untuk uji web; bernilai `null` secara bawaan (lihat bagian 15) |

### 3.3 Alur Presensi Berbasis Lokasi

```
[halaman presensi] -> minta izin lokasi -> ambil posisi -> hitung jarak ke lab sesi
   -> tampilkan info lokasi (lab, jarak, radius, akurasi, status)
   -> praktikan isi kode -> konfirmasi
   -> store: pra-cek (offline, sesi Dibuka, kelas, sudah hadir, izin disetujui, lab ada,
             posisi segar ≤ 30 detik, mocked, akurasi, radius)
   -> tulis attendances/{sessionId}_{uid} dengan labId + lokasi
   -> rules memvalidasi ulang (status sesi, kode, bukti lokasi vs radius lab)
```

Posisi diambil ulang tepat sebelum menulis bila posisi terakhir lebih tua dari 30 detik.

### 3.4 Alur Notifikasi

```
[aplikasi asisten] aksi berhasil ditulis ke Firestore (buat sesi, buka sesi, putuskan izin, ubah lab sesi/lab, ubah jadwal sesi)
   -> store menentukan penerima (praktikan kelas sesi, atau pengaju izin) dari cache `users`
   -> membaca users/{uid}/devices penerima -> services/push.ts mengirim ke Expo Push API
      (POST https://exp.host/--/api/v2/push/send, maksimal 100 pesan per permintaan, timeout 10 detik)
      dan, untuk token `bark:<key>` (iOS eksperimental), ke relay Bark (https://api.day.app/push)
      -- keduanya dikirim paralel; kegagalan atau kelambatan Bark tidak menunda pengiriman Expo
   -> Expo Push Service meneruskan lewat FCM ke perangkat Android
   -> token yang ditolak (`DeviceNotRegistered`) dikembalikan `sendPush`; penghapusannya (FR-54) belum dijalankan (4.5, bagian 15)
[perangkat] -> notifikasi tampil -> diketuk -> root layout membaca `data` -> navigasi ke layar terkait
```

Pengiriman notifikasi dilakukan **setelah** penulisan berhasil dan **tidak menggagalkan** aksi: bila pengiriman gagal, aksi tetap sukses dan kegagalan hanya dicatat (tanpa `console.error`). Perubahan langsung dari Firebase Console tidak memicu notifikasi. **Satu aksi ubah sesi menghasilkan maksimal satu notifikasi:** bila lab berubah hanya N4 yang dikirim; bila hanya jam mulai atau jam selesai berubah dikirim N6; perubahan topik saja tidak mengirim apa pun (4.4).

### 3.5 Kontrak Layer Data (tambahan)

```
services/labs.ts          listenLabs, addLab, updateLab, deleteLab (cek dipakai sesi yang belum Ditutup)
services/location.ts      getPermission, requestPermission, openSettings, isServicesEnabled,
                          requestEnableServices (Android), getPosition(timeout), watchPosition,
                          distanceM(a, b) /* haversine, fungsi murni */
services/attendance.ts    submitAttendance(sessionId, code, position) /* + labId, lokasi */
services/notifications.ts getNotifPermission, requestNotifPermission, getDeviceToken,
                          saveDeviceToken, removeDeviceToken, addNotificationListeners
services/push.ts          sendPush(messages) /* token Expo: Expo Push API, batch ≤ 100;
                                              token `bark:`: relay Bark; keduanya paralel (allSettled);
                                              kembalikan token yang ditolak */
services/bark.ts          (iOS eksperimental) parseBarkKey, toBarkDeviceToken, isBarkDeviceToken,
                          getSavedBarkKey, saveBarkKeyLocally, clearBarkKeyLocally, sendBarkNotification
```

**Kontrak store (tambahan pada `src/store/appStore.ts`)**

```
State : labs, location: { status: LocationStatus, position: DevicePosition | null },
        notifPermission: NotificationPermission,
        sync: + 'labs'
Aksi  : addLab(input) / updateLab(id, patch) / deleteLab(id)  -> Promise<Result>
        requestLocation()            -> Promise<LocationStatus>   // minta izin bila perlu, lalu ambil posisi
        refreshLocation()            -> Promise<LocationStatus>
        openLocationSettings()       -> Promise<void>
        enableLocationServices()     -> Promise<LocationStatus>   // dialog sistem Android
        submitAttendance(sessionId, code) -> Promise<AttendResult> // posisi diambil dari state, divalidasi ulang
        registerDevice()             -> Promise<void>              // dipanggil setiap currentUser.id berganti (login, daftar, ganti akun), satu titik panggil di initAuth
        // createSession, openSession, updateSession (labId berubah), updateLab (koordinat/nama berubah),
        // reviewIzin memanggil notify(peristiwa) setelah berhasil; hasil aksi tidak bergantung pada notifikasi
        // logout() kini juga menghapus token perangkat ini (di iOS juga token Bark dan key lokalnya)
        //   dan menghentikan watch lokasi; logout tidak menggantung saat offline (timeout 10 detik)
Catatan perilaku:
        // `location.position` diisi untuk status ready, low_accuracy, dan mocked, tetapi hanya status `ready`
        //   yang dipakai untuk marker posisi dan presensi.
        // Pesan dinamis ({x}, {lab}, {radius}) diisi halaman/komponen presensi dari data store,
        //   bukan oleh store; store hanya mengembalikan `AttendFailReason`.
        // submitAttendance memetakan status lokasi `unavailable`, `idle`, dan `checking` ke `UNKNOWN`.
        // Tap notifikasi oleh asisten diarahkan ke /asisten/sesi/{id} dan /asisten/izin/{id}.
Hook baca (* baru):
        useLabs()*, useLabById(id)*, useLabForSession(sessionId)*,
        useLabActivity(labId)*        // { berlangsung: Session[], berikutnya: Session[] } sudah difilter per peran
        useLocation()*                // { status, position }
        useDistanceToLab(labId)*      // { jarakM, didalamRadius } | null
        useWatchPosition(enabled)*    // menyalakan watch selama layar peta terbuka
        useTodaySessionsForAttendance()*  // sesi kelas praktikan hari ini + status presensinya
        useNotifPermission()*
```

`services/location.ts`, `services/notifications.ts`, dan `services/push.ts` hanya diimpor oleh `store/` (aturan v2.2). Komponen peta MapLibre dipakai di `features/lab/**`, bukan di `components/**`.

**Mode pengembangan tanpa Firebase.** Mode in-memory ditambah data dummy lab (minimal 3 lab, satu di antaranya tanpa sesi). Lokasi di mode ini memakai posisi perangkat sungguhan bila tersedia; konstanta pengembangan `DEV_FAKE_POSITION` (hanya `__DEV__`) boleh dipakai untuk menguji "di dalam radius" dan "di luar radius" di web.

## 4. Kebutuhan Fungsional

Kolom **Status** membandingkan dengan SRS v2.2: *Tetap*, *Diubah*, atau *Baru*.

### 4.1 Daftar Kebutuhan

**Halaman presensi**

| ID | Kebutuhan | Peran | Status | Prioritas |
| --- | --- | --- | --- | --- |
| FR-32 | **Halaman presensi khusus**, dibuka dari tombol aksi bulat di `PraktikanTabBar` (dan dari notifikasi N1). Menampilkan sesi kelas praktikan **hari ini**: praktikum, waktu, lab, status sesi (Dijadwalkan/Dibuka/Ditutup), dan status presensinya (Belum, Sudah hadir pukul …, Izin disetujui). | Praktikan | Baru | Must |
| FR-33 | Sesi Dibuka yang belum dipresensi tampil paling atas dengan tombol "Presensi". Sesi Dijadwalkan menampilkan jam mulai; sesi Ditutup dan yang sudah dipresensi tanpa tombol. Empty state bila tidak ada sesi hari ini. | Praktikan | Baru | Must |
| FR-07 | Presensi hanya saat sesi Dibuka, **kini lewat halaman presensi** (form kode, info lokasi, bottom sheet konfirmasi). | Praktikan | Diubah | Must |
| FR-34 | Form presensi di **detail sesi** praktikan dihapus. Bila sesi Dibuka dan belum presensi, detail sesi menampilkan tombol "Buka halaman presensi". | Praktikan | Baru | Must |

**Presensi berbasis lokasi**

| ID | Kebutuhan | Peran | Status | Prioritas |
| --- | --- | --- | --- | --- |
| FR-35 | Presensi berhasil hanya bila **semua** terpenuhi: sesi Dibuka; belum presensi; tidak ada izin disetujui; kode benar; sesi punya lab; posisi **di dalam radius** lab; akurasi ≤ `MAX_ACCURACY_M`; lokasi bukan palsu (`mocked` = false). | Praktikan | Baru | Must |
| FR-36 | Saat presensi, layar menampilkan **info lokasi**: nama lab, jarak ke lab (meter), radius, akurasi, dan status ("Di dalam radius" / "Di luar radius"), dalam teks, tidak hanya warna. Tombol "Perbarui lokasi". | Praktikan | Baru | Must |
| FR-37 | Di luar radius: tombol presensi nonaktif dengan pesan "Kamu berada {x} m dari {lab}. Mendekatlah hingga {radius} m." | Praktikan | Baru | Must |
| FR-38 | Dokumen presensi menyimpan `labId` dan `lokasi` (lat, lng, akurasi, jarak, mocked). Aturan satu kali per sesi tetap (FR-09). | Praktikan | Baru | Must |
| FR-39 | Rekap asisten menampilkan jarak presensi tiap praktikan (mis. "09.03 · 12 m"). | Asisten | Baru | Should |
| FR-45 | Presensi dengan memindai **QR code** sebagai pengganti mengetik kode sesi. | Praktikan | Baru | Could |

**Pengelolaan lokasi lab**

| ID | Kebutuhan | Peran | Status | Prioritas |
| --- | --- | --- | --- | --- |
| FR-40 | Asisten dapat **menambah, mengubah, dan menghapus lab**: nama, gedung (opsional), koordinat, radius. Tersimpan di `labs` dan langsung terlihat semua pengguna. | Asisten | Baru | Must |
| FR-41 | Koordinat diisi dengan **"Pakai lokasi saya sekarang"** atau **menggeser marker di peta**. Radius diatur dalam `MIN_RADIUS_M`–`MAX_RADIUS_M`; lingkaran radius tampil di peta form. | Asisten | Baru | Must |
| FR-04 | Form buat sesi memakai **pilihan lab** (menggantikan input teks ruang). Sesi baru wajib punya lab. | Asisten | Diubah | Must |
| FR-18 | Ubah sesi: saat Dijadwalkan semua field termasuk lab; saat Dibuka hanya topik, **lab**, dan jam selesai; saat Ditutup tidak dapat diubah. | Asisten | Diubah | Must |
| FR-43 | Lab tidak dapat dihapus bila masih dipakai sesi yang belum Ditutup; nama lab unik. | Asisten | Baru | Must |

**Peta dan informasi aktivitas lab**

| ID | Kebutuhan | Peran | Status | Prioritas |
| --- | --- | --- | --- | --- |
| FR-44 | **Peta lab** (tab Peta praktikan; pintasan Peta di beranda asisten): marker semua lab dan **posisi perangkat sendiri** yang diperbarui realtime selama layar terbuka. Tombol "Ke posisiku" dan "Lihat semua lab". Di web: daftar lab + jarak sebagai pengganti peta. | Keduanya | Baru | Must |
| FR-46 | Mengetuk marker membuka **panel info lab**: nama, gedung, jarak dari pengguna, **sesi yang sedang berlangsung** (Dibuka, atau Dijadwalkan dalam rentang waktunya), dan **sesi berikutnya** (praktikum, kelas, waktu, status). Perubahan sesi tercermin realtime. | Keduanya | Baru | Must |
| FR-47 | Praktikan hanya melihat sesi kelasnya di panel info lab; asisten melihat semua. Dari panel, sesi dapat dibuka ke detail sesi. | Keduanya | Baru | Must |
| FR-48 | Marker lab yang sedang memiliki sesi Dibuka dibedakan dengan ikon dan label, bukan hanya warna. | Keduanya | Baru | Should |
| FR-49 | Peta kecil di rekap sesi asisten menampilkan titik lokasi presensi praktikan dan lingkaran radius lab. | Asisten | Baru | Could |

**Push notification**

| ID | Kebutuhan | Peran | Status | Prioritas |
| --- | --- | --- | --- | --- |
| FR-50 | Setelah login, aplikasi meminta izin notifikasi (dengan penjelasan singkat) lalu menyimpan token FCM perangkat di `users/{uid}/devices`. Saat logout, token perangkat itu dihapus. | Keduanya | Baru | Must |
| FR-51 | Aplikasi asisten mengirim notifikasi lewat Expo Push Service (FCM) segera setelah peristiwa berhasil, **hanya ke pengguna terkait** (tabel 4.4). Kegagalan pengiriman tidak menggagalkan aksi. | Asisten → Praktikan | Baru | Must |
| FR-52 | Mengetuk notifikasi membuka layar terkait: N1 → halaman presensi, N2/N4 → detail sesi, N3 → detail izin. Bila belum login, layar dibuka setelah login. | Praktikan | Baru | Must |
| FR-53 | Notifikasi yang masuk saat aplikasi terbuka tetap tampil sebagai banner sistem. | Praktikan | Baru | Must |
| FR-54 | Token yang ditolak Expo Push Service (`DeviceNotRegistered`) dihapus oleh aplikasi pengirim; token perangkat diperbarui setiap login. | n/a | Baru | Should |
| FR-55 | Asisten pembuat sesi menerima notifikasi saat ada **izin baru** untuk sesinya (dikirim aplikasi praktikan; butuh izin baca token asisten pembuat sesi di rules). | Asisten | Baru | Could |

**Izin dan kondisi perangkat**

| ID | Kebutuhan | Peran | Status | Prioritas |
| --- | --- | --- | --- | --- |
| FR-56 | Sebelum meminta izin lokasi, tampil penjelasan kenapa lokasi dibutuhkan, lalu tombol "Izinkan lokasi". | Keduanya | Baru | Must |
| FR-57 | Setiap kondisi lokasi punya pesan dan aksi yang jelas (tabel 4.3): ditolak, ditolak permanen, layanan mati, akurasi buruk, lokasi palsu, waktu habis. | Keduanya | Baru | Must |
| FR-58 | Offline: pola FR-29 (banner, tombol tulis nonaktif). Peta tetap tampil dengan data lab terakhir; panel info lab memberi tanda data mungkin belum terbaru. | Keduanya | Baru | Must |
| FR-59 | Izin notifikasi ditolak: aplikasi tetap berfungsi; di profil tampil "Notifikasi nonaktif" + "Buka Pengaturan". | Keduanya | Baru | Should |

**Lintas fitur**

| ID | Kebutuhan | Peran | Status | Prioritas |
| --- | --- | --- | --- | --- |
| FR-03 | Detail sesi menampilkan **nama lab** (dari `labs`) sebagai pengganti ruang, ikut ter-update realtime. | Keduanya | Diubah | Must |
| FR-31 | Security rules diperluas untuk `labs`, `devices`, dan bukti lokasi presensi (bagian 6). | Keduanya | Diubah | Must |
| FR-12 | Tiga alur demo end-to-end (bagian 9) berjalan konsisten. | Keduanya | Diubah | Must |

### 4.2 Aturan Validasi (tambahan)

| Input | Aturan |
| --- | --- |
| Nama lab | Dipangkas spasi, 2–50 karakter, unik (tanpa membedakan huruf besar/kecil) |
| Gedung | Opsional, maksimal 60 karakter |
| Koordinat | `lat` −90..90, `lng` −180..180, angka berhingga |
| Radius | Bilangan bulat `MIN_RADIUS_M`..`MAX_RADIUS_M` |
| Sesi | `labId` wajib dan merujuk lab yang ada (menggantikan aturan ruang 1–30 karakter untuk sesi baru) |
| Posisi presensi | Umur ≤ 30 detik, akurasi ≤ `MAX_ACCURACY_M`, `mocked` = false |

Fungsi validasi berupa fungsi murni: `features/lab/labValidation.ts` (milik Ibrahim) dan `services/location.ts#distanceM` (milik Dhimas).

### 4.3 Pesan Error dan Kondisi Lokasi

| Kondisi | Pesan | Aksi |
| --- | --- | --- |
| Izin lokasi belum diminta | "Rawuh membutuhkan lokasimu untuk memastikan kamu berada di lab saat presensi." | "Izinkan lokasi" |
| `permission_denied` | "Akses lokasi ditolak. Presensi membutuhkan lokasimu." | "Coba lagi" |
| `permission_blocked` | "Akses lokasi diblokir. Aktifkan di Pengaturan aplikasi." | "Buka Pengaturan" |
| `services_off` | "Layanan lokasi di HP-mu tidak aktif." | "Aktifkan lokasi" |
| `low_accuracy` | "Lokasi belum akurat (±{x} m). Pindah ke dekat jendela atau tempat terbuka, lalu perbarui." | "Perbarui lokasi" |
| `mocked` | "Lokasi palsu terdeteksi. Matikan aplikasi pengubah lokasi." | n/a |
| `timeout` | "Lokasi belum didapat. Pastikan GPS aktif lalu coba lagi." | "Perbarui lokasi" |
| `unavailable` | "Lokasi tidak tersedia di perangkat ini." | n/a |
| Presensi `OUTSIDE_RADIUS` | "Kamu berada {x} m dari {lab}. Mendekatlah hingga {radius} m." | "Perbarui lokasi" |
| Presensi `NO_LAB` | "Lab sesi ini belum diatur asisten." | n/a |
| Hapus lab dipakai sesi | "Lab ini masih dipakai sesi yang belum ditutup." | n/a |
| Izin notifikasi ditolak | "Notifikasi nonaktif. Kamu tidak akan menerima pemberitahuan sesi dan izin." | "Buka Pengaturan" |

Pesan pada kartu status dipecah menjadi judul dan isi (mis. "Akses lokasi diblokir" / "Aktifkan di Pengaturan aplikasi."); tekstualnya mengikuti tabel di atas. Pesan error v2.2 tetap berlaku. Urutan pra-cek presensi v2.2 diperluas: offline → sesi tidak Dibuka → kelas berbeda → sudah hadir → izin disetujui → **lab tidak ada → status lokasi bukan `ready` → di luar radius**. Bila penulisan tetap ditolak rules, penentuan alasan mengikuti v2.2.

### 4.4 Peristiwa Notifikasi

| ID | Peristiwa (pemicu) | Penerima | Judul / isi | Tujuan saat diketuk |
| --- | --- | --- | --- | --- |
| N1 | Status sesi `scheduled → open` | Praktikan kelas sesi | "Sesi dibuka" / "{Praktikum} kelas {X} dibuka. Presensi sekarang di {Lab}." | Halaman presensi |
| N2 | Dokumen sesi dibuat | Praktikan kelas sesi | "Jadwal baru" / "{Praktikum}: {hari, tanggal, jam} di {Lab}." | Detail sesi |
| N3 | Status izin `→ approved / rejected` | Praktikan pengaju | "Izin disetujui" / "Izin ditolak" + "untuk {Praktikum} {tanggal}." | Detail izin |
| N4 | `labId` sesi yang belum Ditutup berubah, **atau** koordinat/nama lab yang dipakai sesi yang belum Ditutup berubah | Praktikan kelas sesi tersebut | "Lokasi praktikum berubah" / "{Praktikum} kini di {Lab}." | Detail sesi |
| N6 (pasca-batas) | Jam mulai (`startAt`) atau jam selesai (`endAt`) sesi yang belum Ditutup benar-benar berubah (dibandingkan sebagai waktu, bukan teks) **dan** `labId` tidak berubah | Praktikan kelas sesi | "Jadwal berubah" / "{Praktikum}: {hari, tanggal, jam} di {Lab}." | Detail sesi |
| N5 (Could) | Izin baru dibuat | Asisten pembuat sesi | "Izin baru" / "{Nama} mengajukan izin untuk {Praktikum}." | Detail izin asisten |

N1–N4 dan N6 dikirim **aplikasi asisten**; N5 (belum diimplementasikan) akan dikirim aplikasi praktikan. N6 memakai payload `session_created` sehingga diketuk membuka detail sesi.

**Aturan satu aksi satu notifikasi:** satu aksi ubah sesi menghasilkan **maksimal satu** notifikasi. Lab berubah → hanya N4 (walaupun jam ikut berubah); jam mulai atau jam selesai berubah tanpa perubahan lab → hanya N6; topik saja, simpan tanpa perubahan, atau sesi Ditutup → tidak ada notifikasi. N2 tidak terkirim lagi saat sesi diubah. N4 dari perubahan lab dikirim satu kali per sesi terdampak.

### 4.5 Status Akhir Kebutuhan

Status per **23 Nov 2026** diambil dari audit `main` sebelum gladi (PR #1–#21); status akhir mengikuti `main` terakhir (PR #1–#25). Nilai: **Selesai**, **Sebagian**, **Ditunda**. Butir yang hanya dapat dibuktikan di HP ditandai pada kolom catatan dan dikonfirmasi pada gladi 25 Nov 2026 (11.7).

| ID | Prioritas | Status per 23 Nov | Status akhir | Catatan / PR |
| --- | --- | --- | --- | --- |
| FR-03 | Must | Sebagian | Selesai | Detail sesi benar sejak awal; daftar Jadwal dan halaman izin praktikan meneruskan `labName` serta kedipan "Lab belum diatur" diperbaiki di #22 dan #23 (pasca-batas); #21 |
| FR-04 | Must | Selesai | Selesai | #9 |
| FR-07 | Must | Selesai | Selesai | #15 |
| FR-12 | Must | Sebagian | Selesai | Bukti: gladi 25 Nov 2026, Alur 1, 2, dan 3 serta skenario tepi lolos (11.7) |
| FR-18 | Must | Selesai | Selesai | #9 |
| FR-31 | Must | Selesai | Selesai | #7, #12, #14; hasil uji 14 kasus di `docs/README.md` (#19) |
| FR-32 | Must | Selesai | Selesai | #15, #17; filter "hari ini" memakai tanggal UTC (bagian 15) |
| FR-33 | Must | Selesai | Selesai | #15; tombol "Presensi" ada pada form sesi terpilih |
| FR-34 | Must | Selesai | Selesai | #12, #15 |
| FR-35 | Must | Selesai | Selesai | #12 |
| FR-36 | Must | Selesai | Selesai | #15 |
| FR-37 | Must | Selesai | Selesai | #15 |
| FR-38 | Must | Selesai | Selesai | #12 |
| FR-39 | Should | Ditunda | Ditunda | Rekap asisten belum menampilkan jarak presensi (data `lokasi` sudah tersedia di `RekapItemHadir`) |
| FR-40 | Must | Selesai | Selesai | #7, #8 |
| FR-41 | Must | Selesai | Selesai | #8; koordinat diatur dengan "Pakai lokasi saya" atau **mengetuk** peta (bukan menggeser marker); web memakai input manual |
| FR-43 | Must | Selesai | Selesai | #7, #10 |
| FR-44 | Must | Selesai | Selesai | #20, #21; web memakai daftar lab |
| FR-45 | Could | Ditunda | Ditunda | Presensi QR tidak dikerjakan |
| FR-46 | Must | Selesai | Selesai | #20 |
| FR-47 | Must | Selesai | Selesai | #20 |
| FR-48 | Should | Sebagian | Sebagian | Penanda awalan "•" dan `aria-label` ada; label teks "Dibuka" yang terlihat belum |
| FR-49 | Could | Ditunda | Ditunda | Peta kecil di rekap tidak dikerjakan |
| FR-50 | Must | Sebagian | Selesai | Per 23 Nov token tidak terdaftar setelah daftar akun atau ganti akun tanpa restart; diperbaiki di #22 (pasca-batas): `registerDevice` dipanggil setiap `currentUser.id` berganti |
| FR-51 | Must | Selesai | Selesai | #16; N6 ditambah di #25 |
| FR-52 | Must | Selesai | Selesai | #14; ketuk dari kondisi cold start dikonfirmasi di HP |
| FR-53 | Must | Selesai | Selesai | #14 |
| FR-54 | Should | Ditunda | Ditunda | `sendPush` mengembalikan token yang ditolak, tetapi belum ada yang menghapusnya dari `devices` |
| FR-55 (N5) | Could | Ditunda | Ditunda | Notifikasi izin baru ke asisten tidak dikerjakan |
| FR-56 | Must | Selesai | Selesai | #11, #15 |
| FR-57 | Must | Selesai | Selesai | #11, #15 |
| FR-58 | Must | Selesai | Selesai | #15, #20; tampilnya peta saat offline dikonfirmasi di HP |
| FR-59 | Should | Ditunda | Ditunda | Status izin notifikasi di profil tidak dikerjakan; aplikasi tetap berjalan bila izin ditolak |
| N6 | Tambahan (pasca-batas) | Belum ada | Selesai | #25; peristiwa baru "Jadwal berubah" (4.4) |
| NFR-13 | NFR | Selesai | Selesai | Watch posisi hanya selama layar presensi, peta, atau form lab terbuka dan dihentikan saat aplikasi ke latar belakang; posisi hanya ditulis ke server saat presensi berhasil |
| NFR-14 | NFR | Dibuktikan saat gladi | Selesai | Dibuktikan saat gladi 25 Nov 2026 (11.7) |
| NFR-15 | NFR | Dibuktikan saat gladi | Selesai | Peta dan panel memakai listener realtime; dibuktikan saat gladi 25 Nov 2026 (11.7) |
| NFR-16 | NFR | Selesai | Selesai | Status lokasi berupa teks, tombol peta ber-`aria-label` dan ≥ 44dp, marker lab berawalan "•" |
| NFR-17 | NFR | Selesai | Selesai | Firebase Spark, Expo Push Service, OpenFreeMap; atribusi tampil satu kali; tanpa polling |
| NFR-18 | NFR | Selesai | Selesai | Watch memakai akurasi seimbang, interval 5 detik / 5 meter, berhenti di latar belakang |

Ringkasan: seluruh kebutuhan **Must** terpenuhi dan terbukti pada gladi 25 Nov 2026; kebutuhan **Should** FR-39, FR-54, FR-59 ditunda dan FR-48 sebagian; kebutuhan **Could** FR-45, FR-49, FR-55 ditunda. Penundaan dicatat sebagai backlog di bagian 15.

## 5. Integrasi AI

Tidak berubah dari v2.2 bagian 5.

## 6. Keamanan dan Firebase Security Rules

### 6.1 Prinsip (tambahan)

- Lokasi diperlakukan sebagai data pribadi: hanya dikirim saat presensi berhasil, hanya terbaca pemilik dan asisten.
- Token perangkat terbaca pemiliknya dan asisten (untuk mengirim notifikasi); hanya pemilik yang dapat membuat atau mengubahnya.
- Kunci akun layanan FCM hanya disimpan di kredensial EAS; tidak ada kunci peta. `google-services.json` boleh di-commit (tidak memuat rahasia). `.env` tetap tidak di-commit.

### 6.2 Ringkasan Akses per Koleksi (tambahan dan perubahan)

| Koleksi | Baca | Tulis |
| --- | --- | --- |
| `labs` | Semua pengguna login | Asisten, dengan validasi field (4.2) |
| `sessions` | Tetap | Tambahan: `labId` wajib saat create dan merujuk lab yang ada; saat Dibuka, `changedOnly` kini `['topik', 'labId', 'endAt', 'updatedAt']` |
| `attendances` | Tetap | Tambahan saat create: `labId` = `labId` sesi; `lokasi` berupa map dengan tepat lima kunci (`hasOnly` dan `hasAll`: `lat`, `lng`, `akurasiM`, `jarakM`, `mocked`), `lat` −90..90, `lng` −180..180, `akurasiM` 0..50, `jarakM` 0..`radiusM` lab, `mocked` bertipe boolean dan bernilai `false`. Sesi lama tanpa `labId` ditolak |
| `users/{uid}/devices` | Pemilik; asisten | Buat/ubah: pemilik, dengan tepat tiga kunci (`token`, `platform`, `updatedAt`), `token` string 1–200 karakter, `platform in ['android', 'ios']`, `updatedAt` bertipe timestamp. Hapus: pemilik; asisten (token ditolak, FR-54) |

### 6.3 Sketsa Rules (tambahan pada sketsa v2.2)

```
function labOf(id) { return get(/databases/$(db)/documents/labs/$(id)).data; }

match /labs/{labId} {
  allow read: if signedIn();
  allow create, update: if isAsisten()
    && request.resource.data.keys().hasOnly(['nama','gedung','lat','lng','radiusM',
                                             'createdBy','createdAt','updatedBy','updatedAt'])
    && request.resource.data.nama is string
    && request.resource.data.nama.size() >= 2 && request.resource.data.nama.size() <= 50
    && request.resource.data.lat is number && request.resource.data.lat >= -90 && request.resource.data.lat <= 90
    && request.resource.data.lng is number && request.resource.data.lng >= -180 && request.resource.data.lng <= 180
    && request.resource.data.radiusM is int
    && request.resource.data.radiusM >= 10 && request.resource.data.radiusM <= 200;
  allow delete: if isAsisten();     // cek "masih dipakai" di service
}

// sessions: create menambah
//   && exists(/databases/$(db)/documents/labs/$(request.resource.data.labId))
// sessions: cabang update saat Dibuka memakai changedOnly(['topik','labId','endAt','updatedAt'])

// attendances: create mengganti hasOnly dan menambah
//   request.resource.data.keys().hasOnly(['sessionId','userId','kelas','code','timestamp','labId','lokasi'])
//   && request.resource.data.labId == sessionOf(request.resource.data.sessionId).labId
//   && request.resource.data.lokasi.mocked == false
// (rules final menambah: lokasi is map, hasOnly + hasAll 5 kunci, rentang lat/lng, akurasiM dan jarakM ≥ 0,
//  mocked is bool; lihat firestore.rules)
//   && request.resource.data.lokasi.akurasiM <= 50
//   && request.resource.data.lokasi.jarakM <= labOf(request.resource.data.labId).radiusM

match /users/{uid}/devices/{deviceId} {
  allow read: if signedIn() && (request.auth.uid == uid || isAsisten());
  allow create, update: if signedIn() && request.auth.uid == uid
    && request.resource.data.keys().hasOnly(['token','platform','updatedAt'])
    && request.resource.data.token is string
    && request.resource.data.token.size() > 0 && request.resource.data.token.size() <= 200
    && request.resource.data.platform in ['android', 'ios']
    && request.resource.data.updatedAt is timestamp;
  allow delete: if signedIn() && (request.auth.uid == uid || isAsisten());
}
```

Sketsa ini acuan logika; `firestore.rules` di repo lebih ketat pada `attendances.lokasi` dan `devices` (6.2). Rules final diuji sebelum di-deploy (6.5) dan hanya di-deploy oleh Dhimas.

### 6.4 Risiko Sisa yang Diterima (tambahan)

- **Bukti lokasi berasal dari perangkat.** Klien yang dimodifikasi atau perangkat yang di-root dapat mengirim koordinat palsu yang tidak terdeteksi sebagai `mocked`. Mitigasi: deteksi `mocked`, kode sesi, bukti lokasi tersimpan dan terlihat di rekap, serta pemeriksaan asisten. Validasi lokasi di server (mis. Play Integrity) masuk backlog.
- **Jarak dihitung klien.** Rules hanya memeriksa konsistensi `jarakM` dengan radius, bukan menghitung ulang dari koordinat (rules tidak mendukung fungsi trigonometri).
- **Notifikasi tidak dijamin terkirim** (perangkat mati, mode hemat baterai, aplikasi asisten tertutup tepat setelah menulis). Notifikasi bersifat pemberitahuan; sumber kebenaran tetap data di aplikasi.
- **Token praktikan terbaca asisten.** Asisten yang memodifikasi aplikasinya dapat mengirim notifikasi sembarang ke praktikan. Diterima karena asisten adalah pihak tepercaya; pengirim di server terpisah (mis. Cloudflare Workers) masuk backlog.
- **Perubahan lewat Firebase Console tidak memicu notifikasi**, karena pengirim berada di aplikasi asisten.
- **OpenFreeMap disediakan apa adanya** dan dapat berubah atau berhenti; cadangan di bagian 14.
- **iOS eksperimental: isi notifikasi melewati server pihak ketiga.** Untuk token `bark:<key>`, judul dan isi notifikasi (nama praktikum, jadwal, nama lab; tanpa nama orang) dikirim ke `api.day.app` dan diteruskan lewat APNs. Key Bark berfungsi sebagai kredensial pengiriman: siapa pun yang mengetahuinya dapat mengirim notifikasi ke perangkat itu. Mitigasi: key diisi manual oleh pengguna di tab Profil (tidak ada key bawaan di build), disimpan lokal di perangkat, dihapus bersama token `bark:<key>` di `devices` saat logout, dan jalur ini di luar kriteria penerimaan. Token `bark:<key>` terbaca asisten seperti token lain.
- **Rules `sessions` tidak memeriksa keberadaan `labId` saat update** pada cabang Dijadwalkan dan Dijadwalkan → Dibuka (hanya `create` yang memeriksa); klien yang dimodifikasi dapat menulis `labId` yatim. Dampaknya tampil "Lab belum diatur" dan presensi ditolak `NO_LAB`.
- **Rules `labs` longgar pada `gedung` (tipe dan panjang) serta `createdBy`, `updatedBy`, `createdAt`**, yang tidak diikat ke identitas pengguna; sesuai sketsa 6.3 tetapi tidak ketat.
- **Uji rules dicatat manual.** Tidak ada skrip uji rules di repo; 14 kasus dijalankan lewat Rules Playground dan verifikasi live, sehingga tidak dapat diulang otomatis.

### 6.5 Pengujian Rules

Sembilan kasus v2.2 tetap, ditambah:

10. Asisten dapat membuat dan mengubah lab dengan data valid; praktikan tidak dapat menulis lab.
11. Lab dengan radius di luar 10–200 atau koordinat tidak valid ditolak.
12. Sesi baru tanpa `labId` atau dengan `labId` yang tidak ada ditolak.
13. Presensi dengan `jarakM` > radius, `akurasiM` > 50, `mocked` = true, atau `labId` berbeda dari sesi ditolak; presensi dengan bukti valid berhasil.
14. Praktikan tidak dapat membaca `devices` pengguna lain; asisten dapat membaca tetapi tidak dapat membuat atau mengubah `devices` milik pengguna lain.

Hasil 14 kasus (semua lulus) dicatat di `docs/README.md` bagian 8.2 (PR #19). Pengujian dilakukan lewat Rules Playground di Firebase Console dan verifikasi pada rules yang ter-deploy; belum ada skrip uji otomatis (bagian 15).

## 7. Kebutuhan Non-Fungsional

NFR-01 s.d. NFR-12 dari v2.2 tetap berlaku, dengan catatan NFR-06 (web) mengikuti keputusan 1.4.

| ID | Kebutuhan |
| --- | --- |
| NFR-13 Privasi lokasi | Lokasi hanya diambil saat layar presensi, peta, atau form lab terbuka (foreground). Watch posisi berhenti saat layar ditinggalkan. Posisi hanya dikirim ke server saat presensi berhasil. Tidak ada background location. |
| NFR-14 Notifikasi | Notifikasi tiba ≤ 1 menit setelah aksi asisten berhasil, pada perangkat yang online dan mengizinkan notifikasi. |
| NFR-15 Realtime lab | Perubahan sesi dan lab tercermin di peta dan panel info lab ≤ 3 detik (selaras NFR-08). |
| NFR-16 Aksesibilitas peta | Status lokasi dan marker tidak dibedakan hanya dengan warna; tombol peta punya `aria-label`; info lab dan jarak juga tersedia sebagai teks di panel, sehingga peta tidak menjadi satu-satunya sumber informasi. |
| NFR-17 Biaya | Tidak ada layanan berbayar, langganan, atau kartu: Firebase Spark, Expo Push Service, OpenFreeMap. Atribusi OpenStreetMap tampil di peta. Tidak ada polling. |
| NFR-18 Baterai | Watch posisi memakai akurasi seimbang dan interval wajar (mis. 5 detik / 5 meter) dan berhenti saat aplikasi ke latar belakang. |

## 8. Navigasi dan Interaksi

```
/praktikan  (Stack)
  (tabs)/jadwal         Jadwal kelasnya                                                      [Dhimas]
  (tabs)/peta           Peta lab + panel info lab (BARU)                                     [Ibrahim]
  (tabs)/izin           Daftar izin sendiri                                                  [Dhimas]
  (tabs)/riwayat        Riwayat presensi                                                     [Dhimas]
  presensi              Halaman presensi: sesi hari ini + info lokasi + form kode (BARU)     [Ibrahim]
  sesi/[id]             Detail sesi: nama lab; form presensi diganti tombol ke halaman presensi [Dhimas]
/asisten  (Stack)
  index                 Daftar sesi; pintasan Izin, Kelas, Lab, Peta                         [Ibrahim]
  buat                  Form buat/ubah sesi dengan pilihan lab                               [Ibrahim]
  sesi/[id]             Detail + rekap dengan jarak presensi                                 [Ibrahim]
  lab/index             Daftar lab (BARU)                                                    [Ibrahim]
  lab/form              Tambah/ubah lab: peta, "Pakai lokasi saya", radius (BARU)            [Ibrahim]
  peta                  Peta lab + panel info lab (BARU)                                     [Ibrahim]
  izin/**, kelas/**     Tetap                                                                [Ibrahim]
```

- **Tab praktikan** saat ini Jadwal · Izin · Riwayat · Profil. Sprint 3 menjadikannya Jadwal · Peta · Izin · Riwayat, dengan **tombol aksi bulat** di tengah `PraktikanTabBar` membuka halaman presensi (diberi penanda bila ada sesi Dibuka yang belum dipresensi). **Profil pindah** dari tab ke tombol avatar di header Jadwal agar jumlah tab tetap empat; dikerjakan Dhimas (pemilik tab bar) di D-09.
- Peta asisten dan praktikan memakai komponen yang sama dari `features/lab/LabMap`; perbedaan peran hanya pada isi panel (FR-47).
- Notifikasi diketuk → root layout menavigasi sesuai `NotifPayload` (FR-52).

## 9. Skenario Demo (kriteria penerimaan utama)

Dijalankan di dua HP Android (development build baru). Prasyarat: akun asisten (mis. Dina) dan praktikan kelas A (mis. Bagas, Citra); notifikasi diizinkan di HP praktikan; **lab demo dibuat asisten dengan "Pakai lokasi saya sekarang" di ruang demo**, radius 50 m; satu lab lain berjarak jauh (mis. gedung lain).

### Alur 1: Presensi berbasis lokasi

1. **Asisten** membuat sesi Basis Data kelas A di lab demo → HP Bagas menerima **notifikasi N2**.
2. Asisten membuka sesi → **notifikasi N1**. Bagas mengetuk notifikasi → halaman presensi terbuka.
3. Halaman presensi menampilkan lab, jarak, radius, akurasi, dan status "Di dalam radius".
4. Bagas mengisi kode, konfirmasi → sukses dengan waktu server. Dokumen presensi memuat `labId` dan `lokasi`.
5. Bagas mencoba lagi → ditolak "Kamu sudah presensi pada sesi ini".
6. Di HP asisten, rekap menampilkan Bagas, jamnya, dan jaraknya dalam ≤ 3 detik.
7. (Tepi) Asisten membuat dan membuka sesi kedua di **lab jauh**. Citra membuka halaman presensi: status "Di luar radius", tombol nonaktif, pesan jarak tampil.

### Alur 2: Peta dan informasi lab

1. Bagas membuka tab **Peta** → marker semua lab dan posisinya tampil.
2. "Ke posisiku" lalu "Lihat semua lab" bekerja.
3. Bagas mengetuk lab demo → panel info menampilkan sesi yang sedang berlangsung dan sesi berikutnya.
4. Di HP asisten, sesi itu ditutup → panel di HP Bagas berubah tanpa membuka ulang aplikasi.

### Alur 3: Notifikasi kegiatan dan perubahan lokasi

1. Asisten memindahkan sesi yang belum ditutup ke lab lain → HP Bagas menerima **notifikasi N4**; peta dan detail sesi ikut berubah.
2. Citra mengajukan izin; asisten menolak → Citra menerima **notifikasi N3**; diketuk → detail izin.

### Skenario Tepi (wajib lolos di Tahap 7)

| Kasus | Hasil yang diharapkan |
| --- | --- |
| Izin lokasi ditolak | Pesan + "Coba lagi"; tombol presensi nonaktif |
| Izin lokasi ditolak permanen | Pesan + "Buka Pengaturan" membuka pengaturan aplikasi |
| GPS (layanan lokasi) mati | Pesan + "Aktifkan lokasi" memunculkan dialog sistem |
| Aplikasi pengubah lokasi aktif | Status `mocked`; presensi ditolak |
| Mode pesawat di halaman presensi | Banner offline; tombol presensi nonaktif; peta tetap tampil |
| Izin notifikasi ditolak | Aplikasi tetap jalan; profil menampilkan status notifikasi nonaktif |
| Logout lalu login akun lain di HP yang sama | Notifikasi untuk akun lama tidak lagi diterima |
| Hapus lab yang dipakai sesi Dibuka | Ditolak dengan pesan jelas |
| Sesi lama tanpa lab | Tampil "Lab belum diatur"; presensi ditolak `NO_LAB` |

## 10. Struktur File dan Kepemilikan (anti merge conflict)

Elang (PM) tidak memiliki file kode fitur. **Ibrahim mengambil alih file yang pada v2.2 dimiliki Elang** (UI kit, tema, sisi asisten, `DESIGN.md`). Dhimas tetap pada fondasi data, auth, sisi praktikan yang sudah ada, dan kini juga konfigurasi native serta pengirim notifikasi.

```
app.json, eas.json, package.json, lockfile    DHIMAS   + plugin location/maplibre/notifications, package com.ppk01.rawuh
google-services.json                          DHIMAS   baru (FCM, tanpa rahasia); kunci akun layanan FCM hanya di EAS
firestore.rules, firestore.indexes.json       DHIMAS   + labs, devices, bukti lokasi
src/
  app/
    _layout.tsx                    DHIMAS   + handler notifikasi, navigasi saat diketuk, registerDevice
    praktikan/(tabs)/_layout.tsx   DHIMAS   tab: Jadwal, Peta, Izin, Riwayat
    praktikan/(tabs)/peta.tsx      IBRAHIM  baru (rute tipis, isi dari features/lab)
    praktikan/presensi.tsx         IBRAHIM  baru
    praktikan/sesi/[id].tsx        DHIMAS   hapus form presensi, tombol ke halaman presensi, nama lab
    praktikan/** lainnya           DHIMAS   tetap
    asisten/**                     IBRAHIM  dari Elang; + lab/index, lab/form, peta
  constants/location.ts            DHIMAS   baru
  services/                        DHIMAS   + labs, location, notifications, push; attendance diubah
  types/index.ts, store/**         DHIMAS   + lab, lokasi, notifikasi
  theme/**                         IBRAHIM  dari Elang
  components/**                    IBRAHIM  dari Elang; + LocationStatusCard, PermissionPrompt,
                                            LabInfoSheet, RadiusField (hanya props, tanpa store/peta)
  features/asisten/**              IBRAHIM  dari Elang; RekapList + jarak, SessionForm + pilihan lab
  features/lab/**                  IBRAHIM  baru: LabMap, LabMarker, LabForm, labValidation.ts
  features/presensi/**             IBRAHIM  baru: daftar sesi hari ini, PresensiLokasiForm
  features/praktikan/**            DHIMAS   tetap; PraktikanTabBar + tombol aksi presensi
docs/SRS.md, docs/arsip/**         ELANG (PM)
docs/adr/**                        pembuat keputusan teknis (Dhimas untuk notifikasi dan peta)
docs/README.md                     DHIMAS   + setup FCM di EAS, MapLibre/OpenFreeMap, emulator
DESIGN.md                          IBRAHIM  dari Elang; + pola lokasi, peta, izin perangkat
```

### Aturan Kepemilikan

Aturan 1–8 v2.2 tetap berlaku, dengan pemilik baru di atas. Tambahan:

9. **MapLibre hanya di `features/lab/**`**, `expo-location`, `expo-notifications`, dan Expo Push API hanya di `services/`. Komponen `components/**` menerima data lokasi lewat props.
10. **Kredensial EAS dan kunci FCM dipegang Dhimas**; rules hanya di-deploy oleh Dhimas.
11. Perubahan `types` dan kontrak store untuk lab, lokasi, dan notifikasi diumumkan sebelum merge dan disetujui PM (P-02).

### Dampak pada Kode Sprint 2

| Kode Sprint 2 | Perubahan |
| --- | --- |
| `Session.ruang` (teks) | Sesi baru memakai `labId`; tampilan memakai nama lab; `ruang` hanya untuk sesi lama |
| `SessionForm` / `sessionFormValidation.ts` | Input ruang diganti pilihan lab dari `useLabs()` |
| `submitAttendance(sessionId, code)` | Tanda tangan tetap; store menyertakan posisi dan bukti lokasi; `AttendFailReason` bertambah |
| Form presensi di `praktikan/sesi/[id]` | Dipindah ke halaman presensi |
| `PraktikanTabBar` | Tombol aksi bulat membuka halaman presensi; tab Peta ditambah |
| `firestore.rules` | `attendances` `hasOnly` diperluas; `changedOnly` sesi Dibuka memakai `labId`; koleksi baru |
| `logout()` | Juga menghapus token perangkat dan menghentikan watch posisi |

## 11. Pembagian Tugas dan Tahapan Pengerjaan

Elang adalah Project Manager Sprint 3 dan tidak menulis kode fitur. Pengembangnya dua orang: **Dhimas** (fondasi native, data, lokasi, notifikasi) dan **Ibrahim** (UI kit, halaman presensi, sisi asisten, peta).

**Batas pengerjaan: Senin.** Pengerjaan dilakukan **berurutan per tahap** (11.5), bukan paralel. Satu tahap dimulai setelah tahap sebelumnya selesai dan PR-nya di-merge. Di dalam tahap, tugas dikerjakan sesuai urutan nomornya; menunggu tugas rekan di tahap yang sama adalah bagian dari rencana.

### 11.1 Peran

| Orang | Peran | Bertanggung jawab atas | Tidak mengerjakan |
| --- | --- | --- | --- |
| Elang | Project Manager | Lingkup dan prioritas, SRS, issue, keputusan identitas aplikasi, persetujuan PR kontrak, pemantauan urutan tahap, uji integrasi, sign-off demo, form awal dan akhir | Menulis kode fitur, mengedit file developer |
| Dhimas | Developer: native + data + notifikasi | Konfigurasi dan rebuild (akun EAS), `types`, store, `services/` (termasuk pengirim notifikasi), rules, sisi praktikan yang sudah ada, README | `components/**`, `theme/`, `features/lab|presensi|asisten`, `asisten/**` |
| Ibrahim | Developer: UI + presensi + asisten + peta | Komponen dan tema, halaman presensi, peta MapLibre dan panel info lab, kelola lab, form sesi dengan lab, rekap, `DESIGN.md` | `services/`, `store/`, `types/`, rules, konfigurasi native |

### 11.2 Tugas Elang (PM)

| ID | Tugas | Tahap | Hasil |
| --- | --- | --- | --- |
| P-01 | Menetapkan identitas aplikasi: `package` **`com.ppk01.rawuh`** dan pemegang akun EAS (Dhimas) | 0 | Keputusan diumumkan ke tim |
| P-02 | Menyetujui PR kontrak: D-02 dan setiap perubahan `types`, tanda tangan store/hook, struktur Firestore, atau rules | 2 dan seterusnya | PR kontrak disetujui |
| P-03 | Menyusun daftar nama lab Informatika untuk data awal | 0 | Data awal lab |
| P-04 | Membuat issue per tugas, memantau urutan tahap, memutuskan penundaan Should/Could | Sepanjang sprint | Papan tugas, catatan di SRS |
| P-05 | Memantau PR dan menjaga aturan proses (bagian 12) | Sepanjang sprint | Riwayat PR rapi |
| P-06 | Checklist uji dari bagian 9 dan 6.5; memimpin gladi; sign-off | 7–8 | Checklist, daftar bug, sign-off |
| P-07 | Memperbarui `docs/SRS.md`, form awal dan form akhir | 0 dan 8 | SRS final, form terisi |

### 11.3 Tugas Dhimas

| ID | Tugas | FR / NFR | File utama | Bergantung pada | Selesai bila |
| --- | --- | --- | --- | --- | --- |
| D-01 | **Konfigurasi native + rebuild**: `package` `com.ppk01.rawuh`, `userInterfaceStyle: "light"`, patch Expo, `expo-location`, `@maplibre/maplibre-react-native`, `expo-notifications` + config plugin; daftarkan app Android di Firebase (`google-services.json`); unggah kunci akun layanan FCM V1 ke kredensial EAS; rebuild dev build, bagikan APK | 1.4, NFR-17 | `app.json`, `eas.json`, `package.json`, `google-services.json` | P-01 | APK baru terpasang di HP semua anggota; peta OpenFreeMap tampil; izin lokasi dan notifikasi bisa diminta; notifikasi uji dari Expo push tool diterima |
| D-02 | Kontrak `types`, konstanta lokasi, tanda tangan store/hook (3.5) dengan implementasi sementara (data dummy lab, posisi dummy) | Bagian 3 | `types/`, `constants/location.ts`, `store/**` | D-01 | PR disetujui PM |
| D-03 | Service dan store **lab** (listen, CRUD, cek dipakai, nama unik), `labId` di sesi, data awal lab, **rules `labs` dan perubahan rules `sessions`** (deploy) | FR-40, FR-43, FR-04, FR-18 (data), 6.3 | `services/labs.ts`, `services/sessions.ts`, `store/**`, `scripts/`, `firestore.rules` | D-02 | Lab tersinkron realtime; hapus lab dipakai ditolak; tulis lab diterima Firestore |
| D-04 | Service dan store **lokasi**: izin, layanan mati, timeout, akurasi, `mocked`, buka pengaturan, aktifkan layanan, watch, `distanceM` | FR-35, FR-56–58, NFR-13, NFR-18 | `services/location.ts`, `store/**` | D-01, D-02 | Semua `LocationStatus` dapat dipicu dan teruji di HP |
| D-05 | **Presensi berbasis lokasi** di store/service: pra-cek diperluas, bukti lokasi, pesan alasan; detail sesi praktikan diubah (tombol ke halaman presensi, nama lab); **rules `attendances` diperluas** (deploy) | FR-07, FR-34, FR-35, FR-38, FR-03, 6.3 | `services/attendance.ts`, `store/**`, `praktikan/sesi/[id]`, `features/praktikan/**`, `firestore.rules` | D-03, D-04 | Presensi berhasil di dalam radius, ditolak di luar radius |
| D-06 | **Registrasi perangkat**: izin notifikasi, token, simpan/hapus di `devices`, handler notifikasi masuk dan diketuk di root layout; **rules `devices`** (deploy) | FR-50, FR-52, FR-53, FR-59, 6.3 | `services/notifications.ts`, `store/**`, `app/_layout.tsx`, `firestore.rules` | D-01 | Token tersimpan; notifikasi uji dari Console tampil dan navigasi benar |
| D-07 | **Pengirim notifikasi** N1–N4 (+ N5 Could): `services/push.ts` (Expo Push API), pemanggilan `notify` di aksi store setelah berhasil, penentuan penerima, penghapusan token yang ditolak | FR-51, FR-54, FR-55, NFR-14 | `services/push.ts`, `store/**` | D-06, D-03 | Peristiwa demo memicu notifikasi ke penerima yang benar dan hanya ke mereka |
| D-08 | **Uji rules** 14 kasus (6.5) di emulator atau Rules Playground, catat hasil, perbaiki rules bila ada yang gagal | FR-31, 6.5 | `firestore.rules`, `docs/README.md` | D-03, D-05, D-06 | 14 kasus lulus dan tercatat |
| D-09 | `PraktikanTabBar`: tab Peta + tombol aksi bulat ke halaman presensi dengan penanda sesi Dibuka; Profil pindah ke header Jadwal | 8 | `praktikan/(tabs)/_layout.tsx`, `features/praktikan/PraktikanTabBar`, `praktikan/(tabs)/jadwal` | I-03 | Navigasi praktikan sesuai bagian 8 |
| D-10 | README: `docs/README.md` diubah dari panduan per orang menjadi panduan setup proyek (FCM di EAS, MapLibre/OpenFreeMap, emulator, hasil uji rules, akun seed); bagian basi dibersihkan (`KeluarButton`, env AI, Expo Go, switch peran di README root) | n/a | `docs/README.md`, `README.md` | D-08 | Anggota baru dapat menjalankan proyek dari nol |

Rules ditulis **bersama fitur yang membutuhkannya** (D-03, D-05, D-06) karena Firestore menolak semua tulis ke koleksi yang belum diatur (deny by default). D-08 menguji rules secara menyeluruh di akhir.

### 11.4 Tugas Ibrahim

| ID | Tugas | FR / NFR | File utama | Bergantung pada | Selesai bila |
| --- | --- | --- | --- | --- | --- |
| I-01 | Stub komponen baru dengan **props final**: `LocationStatusCard` (status, jarak, radius, akurasi, aksi), `PermissionPrompt` (judul, penjelasan, aksi utama/sekunder), `LabInfoSheet` (lab, sesi berlangsung, sesi berikutnya, onPilihSesi), `RadiusField` | NFR-02, NFR-16 | `components/**` | D-02 | Props final di-merge dan dapat dipakai |
| I-02 | Finalisasi komponen: semua `LocationStatus`, aksesibilitas, responsif | FR-36, FR-56–58, NFR-16 | `components/**`, `theme/**` | I-01, D-04 | Benar di 360dp, tablet, landscape |
| I-03 | **Halaman presensi**: daftar sesi hari ini, info lokasi, form kode, sheet konfirmasi, pesan alasan | FR-32, FR-33, FR-36, FR-37 | `praktikan/presensi.tsx`, `features/presensi/**` | I-02, D-05 | Alur 1 langkah 3–7 lolos |
| I-04 | **Kelola lab** (asisten): daftar, form dengan peta, "Pakai lokasi saya", geser marker, lingkaran radius, hapus dengan konfirmasi | FR-40, FR-41, FR-43 | `asisten/lab/**`, `features/lab/LabForm`, `labValidation.ts` | I-01, D-03 | Lab tersimpan dan tampil di peta |
| I-05 | **Form sesi dengan pilihan lab** dan ubah lab saat Dibuka | FR-04, FR-18 | `asisten/buat`, `features/asisten/SessionForm`, `sessionFormValidation.ts` | I-04 | Sesi baru wajib lab; lab sesi bisa diubah |
| I-06 | **Peta lab** (asisten dan praktikan) dengan MapLibre + OpenFreeMap dan atribusi OpenStreetMap: marker, posisi sendiri, "Ke posisiku", "Lihat semua lab", panel info lab realtime, pengganti web | FR-44, FR-46–48 | `features/lab/LabMap`, `LabMarker`, `praktikan/(tabs)/peta`, `asisten/peta` | D-09 | Alur 2 lolos |
| I-07 | Beranda asisten: pintasan Lab dan Peta; `labName` pada sesi di sisi asisten (FR-03). Rekap dengan jarak presensi dan peta kecil (FR-39, FR-49) **dipangkas** dan ditunda (4.5) | FR-03 | `asisten/index`, `asisten/sesi/[id]` | I-06 | Pintasan Lab dan Peta tampil; nama lab tampil di daftar dan detail sesi asisten |
| I-08 | Memperbarui `DESIGN.md`: pola status lokasi, permission prompt, peta, panel info lab; merapikan sisa token | n/a | `DESIGN.md` | Tahap 7 | Panduan terdokumentasi |

### 11.5 Tahapan Pengerjaan

Urutan wajib. Kolom **Urutan** dibaca dari kiri ke kanan; panah berarti tugas di kanan dimulai setelah tugas di kiri di-merge.

| Tahap | Urutan | Selesai bila (gerbang ke tahap berikutnya) |
| --- | --- | --- |
| **0. Persiapan** | P-01 → P-03 → P-07 (form awal) | `package` dan pemegang EAS diumumkan, daftar lab tersedia |
| **1. Fondasi native** | D-01 | APK baru terpasang di HP semua anggota |
| **2. Kontrak** | D-02 → I-01 | Kontrak data dan props komponen di-merge |
| **3. Lab** | D-03 → I-04 → I-05 | Asisten dapat membuat lab dan sesi yang memakai lab |
| **4. Lokasi dan presensi** | D-04 → D-05 → I-02 → I-03 → D-09 | Alur 1 lolos tanpa notifikasi (presensi di dalam radius berhasil, di luar radius ditolak) |
| **5. Peta dan info lab** | I-06 → I-07 | Alur 2 lolos |
| **6. Notifikasi** | D-06 → D-07 | Alur 3 lolos; Alur 1 lolos lengkap dengan notifikasi |
| **7. Pengujian** | D-08 → gladi tiga alur di dua HP → skenario tepi → perbaikan bug oleh pemilik file | Semua Must lolos; daftar bug kosong atau tercatat sebagai Should/Could |
| **8. Dokumen dan penutupan** | I-08 → D-10 → P-06 (sign-off) → P-07 (SRS final, form akhir) | **Senin** |

Catatan urutan:

- **Jalur kritis** adalah Tahap 0 → Tahap 1. Tanpa APK baru, lokasi, peta, dan notifikasi tidak dapat diuji di HP.
- Dhimas lebih banyak bekerja di tahap awal (1–4), Ibrahim di tahap tengah (3–5). Selama menunggu, tiap orang boleh menyiapkan pekerjaan di branch-nya sendiri, tetapi **PR dibuka dan di-merge sesuai urutan**.
- Bila satu tahap tersendat, PM memutuskan apakah tugas Should/Could di tahap itu ditunda (bagian 14), bukan melompati tahap.
- **Realisasi (v3.3):** urutan tahap dilonggarkan untuk tugas yang tidak berbagi file: I-02 dikerjakan paralel dengan D-05, D-06 paralel dengan I-03, D-07 tidak menunggu I-03, I-06 dan I-07 tidak menunggu D-09, dan I-07 berjalan paralel dengan revisi I-06. I-07 dipangkas menjadi `labName` pada sesi asisten ditambah pintasan Lab dan Peta; rekap dengan jarak dan peta kecil ditunda. PR #22–#25 dikerjakan setelah batas Senin 23 Nov 2026 sebagai perbaikan pasca-audit dan tambahan eksperimental.

### 11.6 Pengujian dan Penutupan (Tahap 7–8)

| Kegiatan | Pemimpin | Peserta |
| --- | --- | --- |
| Gladi Alur 1 dan 3 (HP asisten dan HP praktikan) | Elang | Dhimas, Ibrahim |
| Gladi Alur 2, peran HP ditukar | Elang | Dhimas, Ibrahim |
| Skenario tepi lokasi dan notifikasi | Dhimas | Ibrahim menguji, Elang mencatat |
| Uji rules 14 kasus | Dhimas | Ibrahim mereview |
| Cek responsif, landscape, aksesibilitas peta | Ibrahim | Dhimas |
| Cross code review (tinjauan pasca-merge bila PR sudah masuk) | Dhimas meninjau PR Ibrahim, Ibrahim meninjau PR Dhimas | Elang mencatat temuan sebagai tugas perbaikan |
| Perbaikan bug | Pemilik file | Elang memantau |
| Sign-off, rekaman demo, SRS final, README | Elang | Ibrahim menyiapkan tangkapan layar, Dhimas melengkapi README |

### 11.7 Hasil Gladi dan Sign-off

**Tanggal:** Rabu, 25 November 2026. **Perangkat:** HP Android dengan build dari `main` terbaru (setelah PR #25), Firebase sungguhan.

| Cakupan | Hasil |
| --- | --- |
| Alur 1: presensi berbasis lokasi | Lolos |
| Alur 2: peta dan informasi lab | Lolos |
| Alur 3: notifikasi kegiatan dan perubahan lokasi | Lolos |
| Skenario tepi (bagian 9) | Lolos |
| Bug baru | Tidak ditemukan |

**Catatan:** sebuah iPhone ikut dipakai sebagai perangkat tambahan untuk iOS eksperimental (LiveContainer dan relay Bark, di luar kriteria penerimaan). Aplikasi berjalan lancar di perangkat tersebut, termasuk penerimaan notifikasi. Hasil ini tidak menjadi dasar kriteria penerimaan.

**Sign-off (P-06):** berdasarkan hasil di atas, PM (Elang) menyatakan kriteria penerimaan Sprint 3 terpenuhi. Kebutuhan yang ditunda (4.5) dan utang teknis (bagian 15) tetap dicatat sebagai backlog.

## 12. Alur Git dan Konfigurasi

- `main` diproteksi: semua perubahan **wajib lewat PR**, berlaku juga untuk admin, tanpa push langsung dan tanpa force push. **Merge ke `main` dilakukan PM setelah PR direview.** PR kontrak (`types`, tanda tangan store/hook, struktur Firestore, rules) **menunggu persetujuan PM** sebelum di-merge. Secara teknis proteksi tidak mewajibkan approval (0 approval); aturan di atas adalah aturan proses. Versi 3.1 sempat mengizinkan pemilik PR me-merge sendiri; ketentuan itu diganti di v3.3. Proteksi tidak boleh dimatikan.
- Branch otomatis dihapus setelah PR di-merge. PR bertumpuk tetap **draft** dan base-nya dipindah ke `main` sebelum di-merge.
- Branch: `feat/dhimas-<topik>`, `feat/ibrahim-<topik>`, `chore/...`, `fix/...`. Satu tugas (D-xx/I-xx) = satu PR.
- Commit **head-body**: `feat: ...` / `fix: ...` / `chore: ...` / `docs: ...` huruf kecil, **tanpa scope dalam kurung**, tanpa titik, body menjelaskan kenapa. Tanpa trailer `Co-Authored-By`.
- Aturan AI agent v2.2 tetap (boleh commit dan push ke branch fitur sampai PR draft, atribusi dimatikan, tidak boleh push ke `main` atau merge).
- **Rahasia:** `.env` tidak di-commit; kunci akun layanan FCM hanya di EAS dan tidak pernah masuk repo atau chat grup; `npm audit fix` tidak dijalankan tanpa PR khusus.
- **Development build:** Sprint 3 menambah native module dan mengganti `package`. Rebuild dilakukan Dhimas di D-01 dan APK dibagikan ke semua anggota; build lama tidak dipakai lagi.

## 13. Definition of Done

- Alur 1, 2, dan 3 berjalan penuh di dua HP Android dengan Firebase sungguhan.
- Seluruh kebutuhan **Must** (FR-32 s.d. FR-59 dan FR v2.2 yang diubah) terpenuhi; status Should/Could dicatat; NFR-13 s.d. NFR-18 terpenuhi.
- Rules baru di-deploy; 14 kasus uji tercatat.
- Skenario tepi bagian 9 tertangani.
- Tidak ada `console.error`, tidak ada `any`, tidak ada warna langsung di luar `src/theme`, `npx tsc --noEmit` lolos.
- Tidak ada rahasia di repo; tidak ada layanan berbayar atau kartu; atribusi peta tampil.
- Semua perubahan lewat PR; PR kontrak disetujui PM; tidak ada push langsung ke `main`.
- `docs/SRS.md`, `docs/README.md`, dan `DESIGN.md` diperbarui. PM memberi sign-off setelah gladi bersama (11.7).
- Status akhir kebutuhan (4.5) dan utang teknis (bagian 15) dicatat; kebutuhan yang ditunda dinyatakan di sana.

## 14. Risiko dan Catatan

| Risiko | Mitigasi |
| --- | --- |
| OpenFreeMap tidak tersedia saat demo | Uji peta sehari sebelum demo; bila mati, style sementara diganti tile raster OpenStreetMap dengan atribusi (pemakaian demo sangat kecil); fitur presensi dan info lab tetap berjalan karena tidak bergantung pada peta |
| Rebuild (D-01) terlambat atau gagal | Tahap 1 adalah jalur kritis dan prioritas pertama Dhimas; selama menunggu, Ibrahim menyiapkan komponen di branch-nya dan mengecek tampilan lewat web |
| GPS dalam ruangan tidak akurat | Radius 50 m, batas akurasi 50 m, lab demo diatur di ruang demo, tombol "Perbarui lokasi" |
| Lokasi dipalsukan | Deteksi `mocked`, kode sesi, bukti lokasi di rekap, rules memvalidasi bukti; risiko sisa dicatat (6.4) |
| Notifikasi lambat atau tidak muncul saat demo | Uji sehari sebelum demo dengan Expo push tool; kunci FCM sudah ada di EAS; izin notifikasi dan pengecualian hemat baterai diperiksa; sumber kebenaran tetap data di aplikasi |
| Token praktikan terbaca asisten | Diterima (asisten tepercaya); rules melarang asisten mengubah token; server pengirim terpisah masuk backlog (6.4) |
| MapLibre gagal dipasang atau di-build | Cadangan: WebView + MapLibre GL JS + OpenFreeMap (tanpa modul peta native, juga berjalan di web); keputusan PM di Tahap 1 |
| Beban Dhimas terlalu berat (native + data + notifikasi) | Tugas UI dipusatkan ke Ibrahim; uji emulator di D-08 boleh diganti Rules Playground dan FR-54/55 boleh digeser; PM memantau tiap tahap |
| Peralihan kepemilikan file Elang ke Ibrahim | Elang menjelaskan struktur UI kit dan sisi asisten di Tahap 0; `DESIGN.md` menjadi acuan |
| Konflik merge pada `types`, `store`, rules | Pemilik tunggal Dhimas; perubahan kontrak diumumkan dan disetujui PM |
| Sesi lama tanpa `labId` | Tampil "Lab belum diatur"; presensi ditolak `NO_LAB`; asisten dapat memilih lab lewat ubah sesi |
| Notifikasi iOS lewat Bark tidak tiba atau `api.day.app` berubah | Di luar kriteria penerimaan; pengiriman Bark dan Expo berjalan paralel dan terpisah sehingga jalur Android tidak terpengaruh (6.4) |

## 15. Utang Teknis dan Backlog

Butir berikut diketahui pada `main` terakhir dan tidak menghalangi alur demo Android. Kolom **Usulan** adalah arah perbaikan, bukan keputusan. Butir bertanda *(HP)* hanya dapat dibuktikan di perangkat. Backlog Sprint 2 dan di luar lingkup (1.2) tetap berlaku.

### 15.1 Notifikasi

| Butir | Dampak | Usulan |
| --- | --- | --- |
| Token yang ditolak tidak dihapus (FR-54): `sendPush` mengembalikan daftar token, tetapi tidak ada pemanggil yang menghapusnya dari `devices` | Token basi menumpuk; pengiriman sia-sia | Hapus token yang dikembalikan setelah pengiriman |
| Pembacaan token N+1: `getDeviceTokensForUser` dipanggil per penerima | Kuota baca Firestore (Spark) naik sebanding jumlah praktikan | Gabungkan pembacaan atau batasi jumlah penerima per aksi |
| N2 mungkin ganda saat kirim ulang `createSession` dengan id sama bila dokumen sudah tersimpan tetapi belum masuk cache | Praktikan menerima "Jadwal baru" dua kali | Kirim N2 hanya bila dokumen benar-benar baru dibuat |
| N4 setelah `kelas` ikut berubah hanya menuju kelas baru (penerima dihitung dari sesi hasil perubahan) | Kelas lama tidak diberi tahu bahwa lab berubah | Hitung penerima dari kelas lama dan baru, atau larang ubah kelas pada sesi yang sudah dijadwalkan |
| Mengganti `kelas` sesi tidak memicu notifikasi apa pun | Praktikan kelas lama dan baru tidak diberi tahu | Tetapkan kebijakan notifikasi untuk perubahan kelas |
| Token akun lama tertinggal bila logout dilakukan offline (penghapusan 10 detik kedaluwarsa) | HP masih dapat menerima notifikasi akun lama | Catat penghapusan tertunda dan ulangi saat online atau saat login berikutnya |
| Pengguna iOS dengan token Bark **dan** token Expo sekaligus dapat menerima notifikasi ganda di perangkat yang sama | Notifikasi ganda (di luar demo Android) | Pilih satu jalur per perangkat iOS |
| Normalisasi kelas pada penerima (`trim` + huruf kecil) lebih longgar daripada pemeriksaan presensi (`===`) | Praktikan dengan penulisan kelas berbeda dapat menerima notifikasi tetapi ditolak `NOT_IN_CLASS` | Samakan aturan pencocokan kelas di notifikasi dan presensi |
| `handleRemoveBarkKey` di Profil tidak memeriksa hasil `removeDeviceToken` | Key lokal terhapus walau token di server gagal dihapus | Periksa hasil dan tampilkan kesalahan |

### 15.2 Lokasi

| Butir | Dampak | Usulan |
| --- | --- | --- |
| GPS yang dinyalakan dari quick settings tidak memicu pengambilan ulang; baru terdeteksi lewat "Coba lagi" *(HP)* | Status `services_off` bertahan sampai pengguna menekan tombol | Dengarkan perubahan layanan lokasi atau ambil ulang saat aplikasi kembali aktif |
| `enableLocationServices` memanggil `restartWatchIfActive` padahal `refreshLocation` sudah memanggilnya | Restart watch berlebih | Hapus pemanggilan redundan |
| Kemungkinan race antara start/unmount watch dan `getPosition` yang basi menimpa posisi dari watch *(HP)* | Posisi sesaat mundur | Beri penanda urutan pada pembaruan posisi |
| `useDistanceToLab` tidak mensyaratkan status `ready`; posisi `low_accuracy` atau `mocked` ikut menghasilkan jarak di panel peta | Jarak tampil walau lokasi belum layak (tombol presensi tetap aman karena memeriksa `ready`) | Kembalikan `null` selain status `ready`, atau beri penanda |
| `DEV_FAKE_POSITION` di `constants/location.ts` tidak dirancang di SRS v3.2 | Konstanta pengembangan (bernilai `null`) di kode produksi | Pertahankan hanya untuk `__DEV__` atau hapus |

### 15.3 Peta

| Butir | Dampak | Usulan |
| --- | --- | --- |
| `LabMap.tsx` dan `LabMap.web.tsx` menduplikasi logika pemilihan lab, status lokasi, dan panel | Perbaikan harus dilakukan dua kali | Ekstrak hook atau komponen bersama |
| Hook per item pada daftar lab di web (`useDistanceToLab` di komponen baris) | Biaya render naik sebanding jumlah lab | Hitung jarak di tingkat daftar |
| `isFocused` memakai `useState` di `LabMap`, `LabMap.web`, dan `PresensiScreen` | Pola tidak seragam dengan `useFocusEffect` | Satukan ke hook fokus bersama |
| `useLabActivity` menghitung `now` sekali per render tanpa pembaruan berkala | Panel "sedang berlangsung" tidak berganti sampai ada render lain | Perbarui `now` dengan interval atau saat sesi berubah |
| Marker lab tidak menampilkan teks "Dibuka" yang terlihat dan posisi sendiri tidak berlabel teks "Kamu" (hanya `aria-label`) | FR-48 sebagian; NFR-16 hanya terpenuhi lewat `aria-label` dan awalan "•" | Tambahkan label teks pada marker |

### 15.4 Presensi dan jadwal

| Butir | Dampak | Usulan |
| --- | --- | --- |
| `useTodaySessionsForAttendance` memfilter "hari ini" dengan tanggal UTC | Sesi bertanggal lokal antara 00.00 dan 07.00 WIB tidak tampil di hari yang benar | Bandingkan dengan tanggal lokal perangkat |
| Halaman presensi tidak memakai `sessionId` dari N1 dan memilih sesi pertama yang dapat dipresensi | Bila ada dua sesi Dibuka hari itu, sesi yang dibuka dari notifikasi bisa tidak terpilih | Teruskan `sessionId` sebagai parameter rute |

### 15.5 Arsitektur dan kualitas

| Butir | Dampak | Usulan |
| --- | --- | --- |
| `praktikan/(tabs)/profil.tsx` mengimpor `services/bark` dan `services/notifications` langsung | Melanggar aturan "halaman tidak mengimpor `services/`" | Pindahkan ke aksi store atau hook |
| `features/praktikan/PresensiForm.tsx` dan `PresensiSheet.tsx` tidak diimpor siapa pun | Kode mati dari alur Sprint 2 | Hapus |
| `Alert.alert` dipanggil di `services/notifications.ts` | Layer data mengandung UI | Pindahkan dialog penjelasan ke lapisan UI |
| 11 warning lint (0 error), mis. variabel tak terpakai dan `set-state-in-effect` | Kebersihan kode | Bereskan satu per satu |
| `tsc` tidak memeriksa typed routes bila `.expo/types` tidak ada (folder `.expo` tidak di-commit) | Salah rute tidak tertangkap di CI/clone baru | Dokumentasikan langkah menghasilkan tipe rute (mis. menjalankan server Expo sekali) sebelum `tsc` |
| Skrip seed menanam kredensial akun seed, dan `seed-izin.js` menanam konfigurasi Firebase | Tidak konsisten dengan prinsip konfigurasi lewat `.env` | Baca dari `.env` seperti `seed-firebase.js` |
| Profil `development` di `eas.json` tidak memiliki blok `env` Firebase | Build development tanpa variabel di lingkungan EAS jatuh diam-diam ke mode in-memory | Samakan dengan profil `preview` atau dokumentasikan variabel EAS yang wajib (lihat `docs/README.md`) |
| Tidak ada ADR untuk keputusan Expo Push Service tanpa server dan MapLibre + OpenFreeMap | Alasan keputusan hanya ada di SRS | Tulis ADR (kepemilikan di 10) |

### 15.6 Data dan rules

| Butir | Dampak | Usulan |
| --- | --- | --- |
| Rules `sessions` tidak memeriksa `exists(lab)` saat update pada cabang Dijadwalkan dan Dijadwalkan → Dibuka | `labId` yatim lewat klien termodifikasi | Tambahkan pemeriksaan pada cabang update |
| Rules `labs` tidak membatasi `gedung` (tipe, panjang) dan tidak mengikat `createdBy`, `updatedBy`, `createdAt` | Data lab bisa tidak konsisten | Ketatkan field tersebut |
| Uji 14 kasus rules dicatat manual tanpa skrip | Tidak dapat diulang otomatis | Tambahkan uji emulator Firestore |
| Sesi menulis `ruang: ''` dan sesi lama masih berisi teks `ruang` | Dua sumber nama lokasi | Migrasi sesi lama ke `labId` bila perlu |

### 15.7 Dokumen

| Butir | Dampak | Usulan |
| --- | --- | --- |
| Backlog 1.2 (QR code, pengajuan ulang izin, reset kata sandi, cache offline persisten, Play Integrity, server pengirim terpisah) | Fitur di luar sprint | Rencanakan di sprint berikutnya |

## 16. Riwayat Perubahan

| Versi | Perubahan |
| --- | --- |
| 1.0–1.3 | Sprint 1 (lihat SRS v1.3) |
| 2.0–2.2 | Sprint 2 (lihat SRS v2.2) |
| 3.0 | **Sprint 3.** PM Elang; developer Dhimas dan Ibrahim; file milik Elang berpindah ke Ibrahim. Paket Blaze, Cloud Functions + FCM untuk notifikasi berbasis peristiwa (N1–N5), `expo-notifications`, `react-native-maps` (Google), `expo-location` foreground. Halaman presensi khusus, presensi berbasis lokasi dengan bukti lokasi, koleksi `labs` dan pengelolaannya, sesi merujuk `labId`, peta lab dengan posisi perangkat sendiri dan panel aktivitas lab, penanganan izin dan kondisi perangkat. Menambah FR-32 s.d. FR-59, NFR-13 s.d. NFR-18, 5 kasus uji rules, tiga alur demo, struktur file dan tugas P-/D-/I- baru, rencana cadangan bila billing gagal |
| 3.1 | Pengerjaan diubah dari fase paralel bertanggal menjadi **tahapan berurutan** (11.5) dengan batas Senin; rules ditulis bersama fiturnya (D-03, D-05, D-06) dan D-08 menjadi uji rules menyeluruh; ketergantungan tugas disesuaikan dengan urutan tahap; approval PR tidak diwajibkan kecuali PR kontrak (bagian 12) |
| 3.2 | Ketentuan biaya: seluruh layanan gratis tanpa kartu. Firebase tetap Spark; notifikasi lewat Expo Push Service dari aplikasi asisten (menggantikan Cloud Functions); peta MapLibre + OpenFreeMap (menggantikan Google Maps); kunci FCM hanya di EAS; rules `devices` dapat dibaca asisten. Keputusan final: `package` `com.ppk01.rawuh`, akun EAS dipegang Dhimas, kode sesi tetap, halaman presensi menampilkan sesi hari ini, Profil pindah ke header Jadwal, konfirmasi asprak dihapus (implementasi dibebaskan). Tugas PM dinomori ulang P-01 s.d. P-07 |
| 3.3 | **Sinkronisasi dengan implementasi akhir** (`main` terakhir, PR #1–#25). Tabel status akhir kebutuhan (4.5) dengan kebutuhan yang ditunda (FR-39, FR-45, FR-49, FR-54, FR-55, FR-59; FR-48 sebagian). Urutan tahap dilonggarkan untuk tugas yang tidak berbagi file dan I-07 dipangkas (11.5). Kebijakan merge: merge ke `main` oleh PM setelah review, PR kontrak menunggu persetujuan PM; ketentuan v3.1 yang mengizinkan pemilik PR me-merge sendiri diganti (bagian 12). Sinkronisasi isi: tipe `Lab`/`Attendance`/`RekapItemHadir`, `CreateLabInput`, tampilan nama lab dan "Memuat lab…", perilaku store, rules `lokasi` dan `devices`, hasil uji 14 kasus. **Pasca-batas (setelah 23 Nov 2026):** #22 registrasi perangkat saat ganti akun dan nama lab di sisi praktikan; #23 tampilan nama lab, atribusi peta, dan layout peta asisten; #24 iOS eksperimental lewat LiveContainer dan relay Bark, serta perbaikan kamera peta; #25 satu aksi ubah sesi satu notifikasi, peristiwa N6 "Jadwal berubah", dan perbaikan relay Bark. Menambah bagian 15 (utang teknis dan backlog), serta hasil gladi dan sign-off (11.7) |
