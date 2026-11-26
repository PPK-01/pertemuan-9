// Salinan kontrak yang dibutuhkan server. Server (Vercel Root Directory = server) tidak bisa
// mengimpor dari ../src, jadi tipe dan fungsi murni disalin ke sini.
//
// WAJIB sinkron dengan:
//   - src/types/api.ts           (tipe API)
//   - src/types/index.ts         (Bill, Payment, BillStatus, PaymentStatus, Role)
//   - src/constants/denda.ts     (konstanta + fungsi murni)
// Ubah semuanya dalam satu PR yang disetujui PM.

// ===== Tipe API (src/types/api.ts) =====

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'UPSTREAM_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL';

export type ApiError = { code: ApiErrorCode; message: string };

export type HealthResponse = { ok: true };

export type GenerateFinesRequest = { sessionId: string };
export type GenerateFinesResponse = { created: number; skipped: number };

export type CreatePaymentRequest = { billId: string };
export type CreatePaymentResponse = { orderId: string; snapToken: string; redirectUrl: string };

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

// ===== Tipe data (src/types/index.ts) =====
// Di server, waktu (createdAt dst.) ditulis sebagai Firestore Timestamp lewat Admin SDK;
// klien membacanya sebagai Timestamp lalu mengonversinya ke ISO string.

export type Role = 'praktikan' | 'asisten' | 'aslab';

export type BillStatus = 'unpaid' | 'pending' | 'success' | 'failed';
export type PaymentStatus = 'pending' | 'success' | 'failed';

export type BillDoc = {
  userId: string;
  userEmail: string;
  sessionId: string;
  labId: string;
  mataKuliahId: string;
  attendanceId: string;
  amount: number;
  lateMinutes: number;
  status: BillStatus;
  createdAt: unknown; // FieldValue.serverTimestamp() / Timestamp
  updatedAt: unknown;
  paidAt?: unknown;
  lastOrderId?: string;
};

export type PaymentDoc = {
  billId: string;
  userId: string;
  amount: number;
  status: PaymentStatus;
  midtransStatus: string;
  paymentType?: string;
  redirectUrl?: string;
  createdAt: unknown;
  updatedAt: unknown;
  settledAt?: unknown;
};

// ===== Konstanta & fungsi murni (src/constants/denda.ts) =====

export const DEFAULT_GRACE_MINUTES = 15;
export const MIN_GRACE_MINUTES = 0;
export const MAX_GRACE_MINUTES = 60;
export const DEFAULT_DENDA_NOMINAL = 5000;

/** Nominal denda dari env DENDA_NOMINAL; nilai tidak valid jatuh ke bawaan. */
export function getDendaNominal(): number {
  const n = Number(process.env.DENDA_NOMINAL);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DENDA_NOMINAL;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Menit telat sejak startAt (dibulatkan ke atas), atau 0 bila tidak telat. Telat = waktu presensi > startAt + grace. */
export function computeLateMinutes(
  attendedAtIso: string,
  startAtIso: string,
  graceMinutes: number = DEFAULT_GRACE_MINUTES,
): number {
  const attended = new Date(attendedAtIso).getTime();
  const start = new Date(startAtIso).getTime();
  if (Number.isNaN(attended) || Number.isNaN(start)) return 0;
  if (attended <= start + graceMinutes * 60_000) return 0;
  return Math.ceil((attended - start) / 60_000);
}

/** transaction_status Midtrans -> PaymentStatus; null = abaikan (jangan ubah status tersimpan). */
export function mapMidtransStatus(
  transactionStatus: string,
  fraudStatus?: string,
): PaymentStatus | null {
  switch (transactionStatus) {
    case 'settlement':
      return 'success';
    case 'capture':
      return fraudStatus === 'challenge' ? 'pending' : 'success';
    case 'pending':
    case 'authorize':
      return 'pending';
    case 'deny':
    case 'cancel':
    case 'expire':
    case 'failure':
      return 'failed';
    default:
      return null;
  }
}
