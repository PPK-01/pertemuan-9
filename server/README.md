# Rawuh Server (Sprint 4)

Backend denda & pembayaran: **Vercel Functions** (TypeScript, Node 20+) + **Firebase Admin SDK** + **Midtrans Sandbox (Snap)**.
Folder ini berdiri sendiri (Vercel Root Directory = `server`); kode aplikasi Expo di `src/` tidak bisa diimpor ke sini,
sehingga kontrak disalin di `lib/contract.ts` (**wajib sinkron** dengan `src/types/api.ts`, `src/types/index.ts`, `src/constants/denda.ts`).
Rujukan lengkap: [`docs/KONTRAK-SPRINT4.md`](../docs/KONTRAK-SPRINT4.md).

## Struktur

```
api/health.ts                    GET  /api/health                   -> { ok: true } (jalan)
api/fines/generate.ts            POST /api/fines/generate           kerangka (501)
api/payments/create.ts           POST /api/payments/create          kerangka (501)
api/payments/notification.ts     POST /api/payments/notification    kerangka (501), webhook Midtrans
lib/firebaseAdmin.ts             init Admin SDK sekali dari env
lib/auth.ts                      requireUser(req): verifikasi ID token Firebase + role dari users/{uid}
lib/contract.ts                  salinan tipe API/Bill/Payment + fungsi murni
lib/http.ts                      helper method/error (ApiError)
scripts/seed-sprint4.ts          seed & migrasi data (milik PM, default dry-run)
```

## Instalasi dan menjalankan lokal

```bash
cd server
npm install
npx tsc --noEmit -p .          # typecheck
npx vercel dev                 # butuh Vercel CLI dan `vercel login`; membaca server/.env.local
curl http://localhost:3000/api/health   # { "ok": true }
```

Salin `.env.example` menjadi `.env.local` (di-ignore git) dan isi nilainya. **Jangan pernah meng-commit nilai rahasia.**

## Variabel environment

| Nama | Isi |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Isi file JSON service account Firebase yang di-base64 (lihat di bawah) |
| `MIDTRANS_SERVER_KEY` | Server key Midtrans Sandbox (Basic auth ke Snap API) |
| `MIDTRANS_CLIENT_KEY` | Client key Midtrans Sandbox |
| `MIDTRANS_SIGNATURE_SECRET_KEY` | Kunci verifikasi `signature_key` webhook (aturan sejak 28 Okt 2026). **Bukan** server key |
| `MIDTRANS_IS_PRODUCTION` | `false` untuk Sandbox |
| `DENDA_NOMINAL` | Nominal denda per keterlambatan, rupiah bulat (bawaan 5000) |

Aplikasi Expo hanya memerlukan `EXPO_PUBLIC_API_BASE_URL` (URL deploy Vercel, tanpa slash di akhir); tidak ada rahasia di sisi aplikasi.

## Membuat `FIREBASE_SERVICE_ACCOUNT_BASE64`

1. Firebase Console → Project settings → Service accounts → **Generate new private key**. Simpan file JSON **di luar repo**
   (pola `*firebase-adminsdk*.json` sudah di-ignore, tetapi tetap simpan di luar folder proyek).
2. Ubah ke base64 satu baris:
   - macOS/Linux/Git Bash: `base64 -w 0 nama-file.json` (macOS: `base64 -i nama-file.json | tr -d '\n'`)
   - PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("nama-file.json"))`
3. Tempel hasilnya sebagai nilai `FIREBASE_SERVICE_ACCOUNT_BASE64` di environment Vercel (bukan di chat atau commit).

## Setting Vercel

1. Vercel → **Add New → Project** → import repo `PPK-01/pertemuan-9`.
2. **Root Directory = `server`**, **Framework Preset = Other**. Kosongkan Build Command dan Output Directory
   (tidak ada build aplikasi Expo; Vercel mengompilasi `api/**/*.ts` sendiri).
3. Isi semua variabel environment di atas (Production dan Preview).
4. Deploy, lalu cek `https://<domain>/api/health` → `{ "ok": true }`.

## Webhook Midtrans

Di Midtrans Dashboard (Sandbox) → Settings → Payment → **Payment Notification URL**, isi:

```
https://<domain>/api/payments/notification
```

Keabsahan notifikasi diverifikasi dengan `signature_key = SHA512(order_id + status_code + gross_amount + SIGNATURE_SECRET_KEY)`.

## Seed Sprint 4

```bash
cd server
export GOOGLE_APPLICATION_CREDENTIALS=/jalur/di/luar/repo/service-account.json
npx tsx scripts/seed-sprint4.ts            # DRY-RUN: hanya mencetak rencana (membaca Firestore)
SEED_ASLAB_EMAIL=... SEED_ASLAB_PASSWORD=... npx tsx scripts/seed-sprint4.ts --apply
```

Jalankan `--apply` **sebelum** men-deploy `firestore.rules` Sprint 4. Aman diulang (hanya mengisi yang belum ada).
