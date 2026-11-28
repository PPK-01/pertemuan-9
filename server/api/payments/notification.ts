import { createHash, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import {
  mapMidtransStatus,
  type BillStatus,
  type MidtransNotification,
  type MidtransNotificationResponse,
  type PaymentStatus,
} from '../../lib/contract';
import { getDb } from '../../lib/firebaseAdmin';
import { ApiHttpError, allowMethod, isNonEmptyString, sendCaught } from '../../lib/http';
import { formatRupiah, sendUserNotifications } from '../../lib/push';

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
  return {
    order_id: b.order_id,
    status_code: b.status_code,
    gross_amount: b.gross_amount,
    signature_key: b.signature_key,
    transaction_status: b.transaction_status,
    ...(typeof b.fraud_status === 'string' ? { fraud_status: b.fraud_status } : {}),
    ...(typeof b.payment_type === 'string' ? { payment_type: b.payment_type } : {}),
    ...(typeof b.transaction_id === 'string' ? { transaction_id: b.transaction_id } : {}),
  };
}

function isSignatureValid(notification: MidtransNotification, secretKey: string): boolean {
  const payload = `${notification.order_id}${notification.status_code}${notification.gross_amount}${secretKey}`;
  const expectedHex = createHash('sha512').update(payload, 'utf8').digest('hex').toLowerCase();
  const providedHex = notification.signature_key.trim().toLowerCase();

  const expectedBuf = Buffer.from(expectedHex, 'utf8');
  const providedBuf = Buffer.from(providedHex, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

type PendingNotif = {
  kind: 'payment_success' | 'payment_failed';
  userId: string;
  billId: string;
  sessionId: string;
  mataKuliahId: string;
  amount: number;
};

/**
 * POST /api/payments/notification: webhook Midtrans (tanpa auth Firebase; keabsahan = signature_key).
 * Memperbarui payments/{order_id} dan bills/{billId} secara idempoten dalam transaksi Firestore,
 * mengabaikan order lama, lalu mengirim push N8/N9 bila status tagihan berubah.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!allowMethod(req, res, 'POST')) return;

  try {
    const body = parseBody(req.body);
    if (!body) {
      throw new ApiHttpError(
        'INVALID_INPUT',
        'Body harus memuat order_id, status_code, gross_amount, signature_key, transaction_status.',
      );
    }

    const signatureSecret = process.env.MIDTRANS_SIGNATURE_SECRET_KEY;
    if (!signatureSecret) {
      throw new ApiHttpError('INTERNAL', 'MIDTRANS_SIGNATURE_SECRET_KEY belum diisi.');
    }

    if (!isSignatureValid(body, signatureSecret)) {
      throw new ApiHttpError('FORBIDDEN', 'Signature notifikasi tidak valid.');
    }

    const mappedStatus = mapMidtransStatus(body.transaction_status, body.fraud_status);
    if (mappedStatus === null) {
      res.status(200).json({ ok: true } satisfies MidtransNotificationResponse);
      return;
    }

    const db = getDb();
    const paymentRef = db.collection('payments').doc(body.order_id);

    const pendingNotif = await db.runTransaction(async (tx): Promise<PendingNotif | null> => {
      const paymentSnap = await tx.get(paymentRef);
      if (!paymentSnap.exists) return null;

      const payment = paymentSnap.data()!;
      const billId = typeof payment.billId === 'string' ? payment.billId : '';
      if (!billId) return null;

      const billRef = db.collection('bills').doc(billId);
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) return null;

      const bill = billSnap.data()!;
      const prevPayStatus = payment.status as PaymentStatus;
      const nextPayStatus: PaymentStatus =
        prevPayStatus === 'success' ? 'success' : mappedStatus;

      const payChanged =
        nextPayStatus !== prevPayStatus ||
        payment.midtransStatus !== body.transaction_status ||
        (body.payment_type !== undefined && payment.paymentType !== body.payment_type);

      if (payChanged) {
        const paymentPatch: Record<string, unknown> = {
          status: nextPayStatus,
          midtransStatus: body.transaction_status,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (body.payment_type) {
          paymentPatch.paymentType = body.payment_type;
        }
        if (nextPayStatus === 'success' && !payment.settledAt) {
          paymentPatch.settledAt = FieldValue.serverTimestamp();
        }
        tx.update(paymentRef, paymentPatch);
      }

      const prevBillStatus = bill.status as BillStatus;
      const isLatestOrder = bill.lastOrderId === body.order_id;
      let nextBillStatus: BillStatus = prevBillStatus;

      if (prevBillStatus !== 'success') {
        if (mappedStatus === 'success') {
          nextBillStatus = 'success';
        } else if (mappedStatus === 'failed' && isLatestOrder) {
          nextBillStatus = 'failed';
        } else if (mappedStatus === 'pending' && isLatestOrder) {
          nextBillStatus = 'pending';
        }
      }

      if (nextBillStatus !== prevBillStatus) {
        const billPatch: Record<string, unknown> = {
          status: nextBillStatus,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (nextBillStatus === 'success') {
          billPatch.paidAt = FieldValue.serverTimestamp();
        }
        tx.update(billRef, billPatch);

        if (nextBillStatus === 'success' || nextBillStatus === 'failed') {
          const userId = typeof bill.userId === 'string' ? bill.userId : '';
          const amount = typeof bill.amount === 'number' ? bill.amount : 0;
          if (userId) {
            return {
              kind: nextBillStatus === 'success' ? 'payment_success' : 'payment_failed',
              userId,
              billId,
              sessionId: typeof bill.sessionId === 'string' ? bill.sessionId : '',
              mataKuliahId: typeof bill.mataKuliahId === 'string' ? bill.mataKuliahId : '',
              amount,
            };
          }
        }
      }

      return null;
    });

    if (pendingNotif) {
      let praktikumName = 'Praktikum';
      try {
        if (pendingNotif.sessionId) {
          const sesSnap = await db.collection('sessions').doc(pendingNotif.sessionId).get();
          const sesPraktikum = sesSnap.data()?.praktikum;
          if (typeof sesPraktikum === 'string' && sesPraktikum.trim()) {
            praktikumName = sesPraktikum.trim();
          }
        }
        if (praktikumName === 'Praktikum' && pendingNotif.mataKuliahId) {
          const mkSnap = await db.collection('mataKuliah').doc(pendingNotif.mataKuliahId).get();
          const mkNama = mkSnap.data()?.nama;
          if (typeof mkNama === 'string' && mkNama.trim()) {
            praktikumName = mkNama.trim();
          }
        }
      } catch {
        // Fallback ke nama bawaan bila lookup label praktikum gagal.
      }

      const nominalText = formatRupiah(pendingNotif.amount);
      if (pendingNotif.kind === 'payment_success') {
        await sendUserNotifications([
          {
            uid: pendingNotif.userId,
            title: 'Pembayaran berhasil',
            body: `Denda ${praktikumName} Rp${nominalText} sudah lunas.`,
            data: { type: 'payment_success', billId: pendingNotif.billId },
          },
        ]);
      } else {
        await sendUserNotifications([
          {
            uid: pendingNotif.userId,
            title: 'Pembayaran belum berhasil',
            body: `Pembayaran denda ${praktikumName} gagal atau kedaluwarsa. Coba bayar lagi.`,
            data: { type: 'payment_failed', billId: pendingNotif.billId },
          },
        ]);
      }
    }

    res.status(200).json({ ok: true } satisfies MidtransNotificationResponse);
  } catch (err) {
    sendCaught(res, err);
  }
}
