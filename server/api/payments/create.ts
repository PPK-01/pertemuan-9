import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { requireUser } from '../../lib/auth';
import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
  PaymentDoc,
} from '../../lib/contract';
import { getDb } from '../../lib/firebaseAdmin';
import { ApiHttpError, allowMethod, isNonEmptyString, sendCaught } from '../../lib/http';

const SNAP_TIMEOUT_MS = 8000;

function parseBody(body: unknown): CreatePaymentRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const { billId } = body as Record<string, unknown>;
  return isNonEmptyString(billId) ? { billId: billId.trim() } : null;
}

function getSnapUrl(): string {
  return process.env.MIDTRANS_IS_PRODUCTION === 'true'
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
}

function nextOrderId(billId: string, existingIds: string[]): string {
  const prefix = `${billId}-`;
  let maxAttempt = existingIds.length;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const suffix = Number(id.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > maxAttempt) {
      maxAttempt = suffix;
    }
  }
  return `${billId}-${maxAttempt + 1}`;
}

/**
 * POST /api/payments/create  body { billId }  ->  { orderId, snapToken, redirectUrl }
 * Membuat transaksi Midtrans Snap Sandbox untuk tagihan milik pengguna berstatus 'unpaid'/'failed',
 * menyimpan payments/{orderId}, dan memperbarui status tagihan menjadi 'pending'.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!allowMethod(req, res, 'POST')) return;

  try {
    const user = await requireUser(req);
    const body = parseBody(req.body);
    if (!body) {
      throw new ApiHttpError('INVALID_INPUT', 'Body harus berupa JSON { billId: string }.');
    }

    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) {
      throw new ApiHttpError('INTERNAL', 'Konfigurasi Midtrans server belum lengkap.');
    }

    const db = getDb();
    const billRef = db.collection('bills').doc(body.billId);
    const billSnap = await billRef.get();
    if (!billSnap.exists) {
      throw new ApiHttpError('NOT_FOUND', 'Tagihan tidak ditemukan.');
    }

    const bill = billSnap.data()!;
    if (bill.userId !== user.uid) {
      throw new ApiHttpError('FORBIDDEN', 'Tagihan ini bukan milikmu.');
    }
    if (bill.status !== 'unpaid' && bill.status !== 'failed') {
      throw new ApiHttpError('CONFLICT', 'Tagihan sedang diproses atau sudah lunas.');
    }

    const amount = typeof bill.amount === 'number' ? Math.round(bill.amount) : 0;
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new ApiHttpError('INTERNAL', 'Nominal tagihan tidak valid.');
    }

    const existingSnap = await db
      .collection('payments')
      .where('billId', '==', body.billId)
      .get();
    const orderId = nextOrderId(
      body.billId,
      existingSnap.docs.map((d) => d.id),
    );

    const customerEmail =
      typeof bill.userEmail === 'string' && bill.userEmail ? bill.userEmail : user.email;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SNAP_TIMEOUT_MS);

    let snapToken = '';
    let redirectUrl = '';
    try {
      const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
      const snapRes = await fetch(getSnapUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          transaction_details: {
            order_id: orderId,
            gross_amount: amount,
          },
          customer_details: {
            email: customerEmail,
          },
        }),
        signal: controller.signal,
      });

      const snapJson = (await snapRes.json().catch(() => null)) as {
        token?: unknown;
        redirect_url?: unknown;
      } | null;

      if (
        !snapRes.ok ||
        typeof snapJson?.token !== 'string' ||
        !snapJson.token ||
        typeof snapJson?.redirect_url !== 'string' ||
        !snapJson.redirect_url
      ) {
        throw new ApiHttpError('UPSTREAM_ERROR', 'Gagal membuat transaksi di Midtrans.');
      }

      snapToken = snapJson.token;
      redirectUrl = snapJson.redirect_url;
    } catch (err) {
      if (err instanceof ApiHttpError) throw err;
      throw new ApiHttpError('UPSTREAM_ERROR', 'Gagal menghubungi Midtrans.');
    } finally {
      clearTimeout(timer);
    }

    const paymentRef = db.collection('payments').doc(orderId);
    await db.runTransaction(async (tx) => {
      const freshBill = await tx.get(billRef);
      if (!freshBill.exists) {
        throw new ApiHttpError('NOT_FOUND', 'Tagihan tidak ditemukan.');
      }
      const freshStatus = freshBill.data()?.status;
      if (freshStatus !== 'unpaid' && freshStatus !== 'failed') {
        throw new ApiHttpError('CONFLICT', 'Tagihan sedang diproses atau sudah lunas.');
      }

      const paymentDoc: PaymentDoc = {
        billId: body.billId,
        userId: user.uid,
        amount,
        status: 'pending',
        midtransStatus: 'pending',
        redirectUrl,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      tx.create(paymentRef, paymentDoc);
      tx.update(billRef, {
        status: 'pending',
        lastOrderId: orderId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    res.status(200).json({
      orderId,
      snapToken,
      redirectUrl,
    } satisfies CreatePaymentResponse);
  } catch (err) {
    sendCaught(res, err);
  }
}
