// Kontrak API server (Vercel Functions). WAJIB sinkron dengan server/lib/contract.ts:
// server tidak bisa mengimpor dari src/, jadi tipe ini disalin ke sana. Ubah keduanya dalam satu PR.

/** Kode error API. Semua respons error berbentuk ApiError langsung (tidak dibungkus). */
export type ApiErrorCode =
  | 'UNAUTHENTICATED' // 401: token Firebase hilang/tidak valid
  | 'FORBIDDEN' // 403: bukan pemilik / bukan Asprak lab terkait
  | 'INVALID_INPUT' // 400: body tidak sesuai bentuk
  | 'NOT_FOUND' // 404
  | 'METHOD_NOT_ALLOWED' // 405
  | 'CONFLICT' // 409: status tagihan/sesi tidak cocok
  | 'UPSTREAM_ERROR' // 502: Midtrans/Expo gagal
  | 'NOT_IMPLEMENTED' // 501: kerangka Sprint 4 T0
  | 'INTERNAL'; // 500

export type ApiError = { code: ApiErrorCode; message: string };

/** GET /api/health */
export type HealthResponse = { ok: true };

/** POST /api/fines/generate (auth: Firebase ID token Asprak lab sesi) */
export type GenerateFinesRequest = { sessionId: string };
export type GenerateFinesResponse = { created: number; skipped: number };

/** POST /api/payments/create (auth: Firebase ID token pemilik tagihan) */
export type CreatePaymentRequest = { billId: string };
export type CreatePaymentResponse = { orderId: string; snapToken: string; redirectUrl: string };

/**
 * POST /api/payments/notification (webhook Midtrans, tanpa auth Firebase).
 * Hanya field yang dipakai. `gross_amount` dikirim Midtrans sebagai string (mis. "5000.00") dan
 * harus dipakai apa adanya saat menghitung signature_key.
 */
export type MidtransNotification = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
  transaction_id?: string;
};
export type MidtransNotificationResponse = { ok: true };
