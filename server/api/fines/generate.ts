import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { GenerateFinesRequest } from '../../lib/contract';
import { allowMethod, isNonEmptyString, sendError } from '../../lib/http';

function parseBody(body: unknown): GenerateFinesRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const { sessionId } = body as Record<string, unknown>;
  return isNonEmptyString(sessionId) ? { sessionId } : null;
}

/**
 * POST /api/fines/generate  body { sessionId }  ->  { created, skipped }
 * KERANGKA (Sprint 4 T0): belum ada logika bisnis.
 *
 * TODO (Dhimas, T1):
 *  1. requireUser(req) (lib/auth.ts).
 *  2. Pengguna harus role 'asisten' DAN emailnya ada di labs/{session.labId}.asprakEmails; selain itu 403.
 *  3. Sesi harus berstatus 'closed'; selain itu 409 CONFLICT.
 *  4. Hitung telat: baca attendances where sessionId == X; telat bila waktu presensi >
 *     session.startAt + (lab.graceMinutes ?? DEFAULT_GRACE_MINUTES) (computeLateMinutes di lib/contract.ts).
 *     Izin disetujui = tidak ada presensi = tanpa tagihan. Pembayaran tidak mengubah kehadiran.
 *  5. Untuk tiap yang telat: set bills/{sessionId}_{userId} dengan create() (lewati bila sudah ada;
 *     hitung `skipped`) berisi Bill (amount = getDendaNominal(), status 'unpaid', lateMinutes,
 *     userEmail, labId, mataKuliahId dari lab, attendanceId).
 *  6. Kirim push N7 (bill_created) ke token users/{uid}/devices lewat Expo Push API.
 *  7. Balas 200 { created, skipped }.
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (!allowMethod(req, res, 'POST')) return;
  if (!parseBody(req.body)) {
    sendError(res, 'INVALID_INPUT', 'Body harus berupa JSON { sessionId: string }.');
    return;
  }
  sendError(res, 'NOT_IMPLEMENTED', 'POST /api/fines/generate belum diimplementasikan.');
}
