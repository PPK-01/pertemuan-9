import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { CreatePaymentRequest } from '../../lib/contract';
import { allowMethod, isNonEmptyString, sendError } from '../../lib/http';

function parseBody(body: unknown): CreatePaymentRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const { billId } = body as Record<string, unknown>;
  return isNonEmptyString(billId) ? { billId } : null;
}

/**
 * POST /api/payments/create  body { billId }  ->  { orderId, snapToken, redirectUrl }
 * KERANGKA (Sprint 4 T0): belum ada logika bisnis.
 *
 * TODO (Dhimas, T2):
 *  1. requireUser(req) (lib/auth.ts).
 *  2. Tagihan bills/{billId} harus ada dan milik pengguna (bill.userId == uid); selain itu 403/404.
 *  3. Status tagihan harus 'unpaid' atau 'failed'; 'pending'/'success' -> 409 CONFLICT.
 *  4. orderId baru unik per percobaan: `${billId}-${n}` (n = percobaan berikutnya, mis. dari counter di
 *     transaksi Firestore atau jumlah payments where billId == X, + 1).
 *  5. Snap API Sandbox: POST https://app.sandbox.midtrans.com/snap/v1/transactions
 *     (Production: https://app.midtrans.com/snap/v1/transactions bila MIDTRANS_IS_PRODUCTION=true),
 *     header Authorization: Basic base64(MIDTRANS_SERVER_KEY + ':'), body
 *     { transaction_details: { order_id, gross_amount: bill.amount }, customer_details: { email } }.
 *     Respons { token, redirect_url }. Gagal -> 502 UPSTREAM_ERROR.
 *  6. Simpan payments/{orderId} (status 'pending', midtransStatus 'pending', redirectUrl) dan, dalam
 *     transaksi yang sama, update bills/{billId}: lastOrderId = orderId, status = 'pending'.
 *  7. Balas 200 { orderId, snapToken, redirectUrl }.
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (!allowMethod(req, res, 'POST')) return;
  if (!parseBody(req.body)) {
    sendError(res, 'INVALID_INPUT', 'Body harus berupa JSON { billId: string }.');
    return;
  }
  sendError(res, 'NOT_IMPLEMENTED', 'POST /api/payments/create belum diimplementasikan.');
}
