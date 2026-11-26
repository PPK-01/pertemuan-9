import type { PaymentStatus } from '@/types';

/**
 * Konstanta denda & pembayaran Sprint 4. Rujukan: docs/KONTRAK-SPRINT4.md.
 * Fungsi murni di berkas ini ditiru di server/lib/contract.ts (server tidak bisa mengimpor dari src/);
 * keduanya WAJIB sinkron.
 */

/** Toleransi keterlambatan bawaan (menit) bila lab belum mengaturnya. */
export const DEFAULT_GRACE_MINUTES = 15;
export const MIN_GRACE_MINUTES = 0;
export const MAX_GRACE_MINUTES = 60;

/** Nominal denda per keterlambatan (rupiah, bilangan bulat). Server membaca env DENDA_NOMINAL; bawaannya sama. */
export const DENDA_NOMINAL = 5000;

/** Normalisasi identitas email: trim + huruf kecil. Wajib dipakai di semua tempat yang membandingkan email. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Menit keterlambatan dihitung sejak `startAt` (dibulatkan ke atas), atau 0 bila TIDAK telat.
 * Telat = waktu presensi > startAt + graceMinutes. Tepat di batas toleransi belum telat.
 */
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

/**
 * Pemetaan transaction_status Midtrans -> PaymentStatus.
 *  - settlement                        -> success
 *  - capture + fraud_status accept     -> success (kartu; fraud_status kosong dianggap accept)
 *  - capture + fraud_status challenge  -> pending (menunggu tinjauan manual di Midtrans)
 *  - pending, authorize                -> pending
 *  - deny, cancel, expire, failure     -> failed
 *  - lainnya (refund, chargeback, ...) -> null: abaikan, JANGAN mengubah status tersimpan
 * Pembayaran tidak pernah mengubah data kehadiran.
 */
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
