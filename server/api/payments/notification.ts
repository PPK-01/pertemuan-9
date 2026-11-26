import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { MidtransNotification } from '../../lib/contract';
import { allowMethod, isNonEmptyString, sendError } from '../../lib/http';

function parseBody(body: unknown): MidtransNotification | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (
    !isNonEmptyString(b.order_id) ||
    !isNonEmptyString(b.status_code) ||
    !isNonEmptyString(b.gross_amount) ||
    !isNonEmptyString(b.signature_key) ||
    !isNonEmptyString(b.transaction_status)
  ) {
    return null;
  }
  return b as unknown as MidtransNotification;
}

/**
 * POST /api/payments/notification: webhook Midtrans (TANPA auth Firebase; keabsahan = signature_key).
 * KERANGKA (Sprint 4 T0): belum ada logika bisnis.
 *
 * TODO (Dhimas, T2):
 *  1. Verifikasi signature_key (aturan sejak 28 Okt 2026):
 *       expected = SHA512(order_id + status_code + gross_amount + MIDTRANS_SIGNATURE_SECRET_KEY)  // hex
 *     BUKAN server key. gross_amount dipakai persis seperti di body (string, mis. "5000.00").
 *     Bandingkan dengan crypto.timingSafeEqual (samakan panjang buffer dulu). Tidak cocok -> 403 (jangan
 *     mengubah data apa pun).
 *  2. Opsional: cek ulang status lewat API status Midtrans
 *     (GET https://api.sandbox.midtrans.com/v2/{order_id}/status, Basic auth server key) dan pakai
 *     hasilnya sebagai sumber kebenaran.
 *  3. Petakan: mapMidtransStatus(transaction_status, fraud_status) di lib/contract.ts. null = abaikan.
 *  4. Idempoten, dalam transaksi Firestore: update payments/{order_id} (status, midtransStatus,
 *     paymentType, settledAt bila success) dan bills/{payment.billId}:
 *       success -> bill 'success' + paidAt (terminal; tidak diturunkan lagi oleh notifikasi order lama);
 *       failed  -> bill 'failed' hanya bila payment itu adalah bill.lastOrderId dan bill belum 'success';
 *       pending -> bill 'pending' hanya bila bill belum 'success'.
 *     Notifikasi duplikat tidak boleh mengirim push dua kali (kirim hanya bila status berubah).
 *  5. Kirim push N8 (payment_success) atau N9 (payment_failed) ke token users/{payment.userId}/devices.
 *  6. Selalu balas 200 { ok: true } untuk notifikasi yang signature-nya valid (agar Midtrans tidak retry).
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (!allowMethod(req, res, 'POST')) return;
  if (!parseBody(req.body)) {
    sendError(
      res,
      'INVALID_INPUT',
      'Body harus memuat order_id, status_code, gross_amount, signature_key, transaction_status.',
    );
    return;
  }
  sendError(res, 'NOT_IMPLEMENTED', 'POST /api/payments/notification belum diimplementasikan.');
}
