import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { requireUser } from '../../lib/auth';
import {
  DEFAULT_GRACE_MINUTES,
  computeLateMinutes,
  getDendaNominal,
  normalizeEmail,
  type BillDoc,
  type GenerateFinesRequest,
  type GenerateFinesResponse,
} from '../../lib/contract';
import { getDb } from '../../lib/firebaseAdmin';
import { ApiHttpError, allowMethod, isNonEmptyString, sendCaught } from '../../lib/http';
import { formatRupiah, sendUserNotifications } from '../../lib/push';

function parseBody(body: unknown): GenerateFinesRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const { sessionId } = body as Record<string, unknown>;
  return isNonEmptyString(sessionId) ? { sessionId: sessionId.trim() } : null;
}

function toIsoString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function isAlreadyExistsError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 6 || code === '6' || code === 'already-exists';
}

/**
 * POST /api/fines/generate  body { sessionId }  ->  { created, skipped }
 * Membuat tagihan denda Rp5.000 (DENDA_NOMINAL) secara idempoten untuk setiap presensi yang
 * melewati batas toleransi (startAt + graceMinutes lab) setelah sesi ditutup.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!allowMethod(req, res, 'POST')) return;

  try {
    const user = await requireUser(req);
    const body = parseBody(req.body);
    if (!body) {
      throw new ApiHttpError('INVALID_INPUT', 'Body harus berupa JSON { sessionId: string }.');
    }

    if (user.role !== 'asisten') {
      throw new ApiHttpError('FORBIDDEN', 'Hanya Asprak yang dapat membuat tagihan denda.');
    }

    const db = getDb();
    const sessionSnap = await db.collection('sessions').doc(body.sessionId).get();
    if (!sessionSnap.exists) {
      throw new ApiHttpError('NOT_FOUND', 'Sesi tidak ditemukan.');
    }
    const session = sessionSnap.data()!;
    const labId = typeof session.labId === 'string' ? session.labId : '';
    if (!labId) {
      throw new ApiHttpError('NOT_FOUND', 'Lab sesi tidak ditemukan.');
    }

    const labSnap = await db.collection('labs').doc(labId).get();
    if (!labSnap.exists) {
      throw new ApiHttpError('NOT_FOUND', 'Lab sesi tidak ditemukan.');
    }
    const lab = labSnap.data()!;
    const asprakEmails = Array.isArray(lab.asprakEmails) ? lab.asprakEmails : [];
    const isLabAsprak = asprakEmails.some(
      (email) => typeof email === 'string' && normalizeEmail(email) === user.email,
    );
    if (!isLabAsprak) {
      throw new ApiHttpError('FORBIDDEN', 'Kamu bukan Asprak yang terdaftar pada lab sesi ini.');
    }

    if (session.status !== 'closed') {
      throw new ApiHttpError('CONFLICT', 'Sesi harus berstatus ditutup sebelum membuat denda.');
    }

    const startAtIso = toIsoString(session.startAt);
    if (!startAtIso) {
      throw new ApiHttpError('INTERNAL', 'Data waktu mulai sesi tidak valid.');
    }

    const graceMinutes =
      typeof lab.graceMinutes === 'number' && Number.isInteger(lab.graceMinutes)
        ? lab.graceMinutes
        : DEFAULT_GRACE_MINUTES;
    const mataKuliahId = typeof lab.mataKuliahId === 'string' ? lab.mataKuliahId : '';
    const amount = getDendaNominal();

    const attSnap = await db
      .collection('attendances')
      .where('sessionId', '==', body.sessionId)
      .get();

    const lateAttendances: { userId: string; attendanceId: string; lateMinutes: number }[] = [];
    for (const attDoc of attSnap.docs) {
      const att = attDoc.data();
      const attUserId = typeof att.userId === 'string' ? att.userId : '';
      const attendedAtIso = toIsoString(att.timestamp);
      if (!attUserId || !attendedAtIso) continue;

      const lateMinutes = computeLateMinutes(attendedAtIso, startAtIso, graceMinutes);
      if (lateMinutes > 0) {
        lateAttendances.push({
          userId: attUserId,
          attendanceId: attDoc.id,
          lateMinutes,
        });
      }
    }

    if (lateAttendances.length === 0) {
      res.status(200).json({ created: 0, skipped: 0 } satisfies GenerateFinesResponse);
      return;
    }

    const uniqueUserIds = [...new Set(lateAttendances.map((item) => item.userId))];
    const userSnaps = await db.getAll(...uniqueUserIds.map((uid) => db.collection('users').doc(uid)));
    const emailByUid = new Map<string, string>();
    for (const uSnap of userSnaps) {
      const rawEmail = uSnap.data()?.email;
      if (typeof rawEmail === 'string') {
        emailByUid.set(uSnap.id, normalizeEmail(rawEmail));
      }
    }

    const outcomes = await Promise.all(
      lateAttendances.map(async (item) => {
        const billId = `${body.sessionId}_${item.userId}`;
        const billDoc: BillDoc = {
          userId: item.userId,
          userEmail: emailByUid.get(item.userId) ?? '',
          sessionId: body.sessionId,
          labId,
          mataKuliahId,
          attendanceId: item.attendanceId,
          amount,
          lateMinutes: item.lateMinutes,
          status: 'unpaid',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        try {
          await db.collection('bills').doc(billId).create(billDoc);
          return {
            created: true as const,
            userId: item.userId,
            billId,
            lateMinutes: item.lateMinutes,
          };
        } catch (err) {
          if (isAlreadyExistsError(err)) {
            return { created: false as const };
          }
          throw err;
        }
      }),
    );

    const newlyCreated = outcomes.filter(
      (o): o is { created: true; userId: string; billId: string; lateMinutes: number } => o.created,
    );
    const created = newlyCreated.length;
    const skipped = outcomes.length - created;

    if (newlyCreated.length > 0) {
      const praktikumName =
        typeof session.praktikum === 'string' && session.praktikum.trim()
          ? session.praktikum.trim()
          : 'Praktikum';
      const nominalText = formatRupiah(amount);
      await sendUserNotifications(
        newlyCreated.map((item) => ({
          uid: item.userId,
          title: 'Denda keterlambatan',
          body: `Kamu terlambat ${item.lateMinutes} menit di ${praktikumName}. Denda Rp${nominalText}.`,
          data: { type: 'bill_created', billId: item.billId },
        })),
      );
    }

    res.status(200).json({ created, skipped } satisfies GenerateFinesResponse);
  } catch (err) {
    sendCaught(res, err);
  }
}
