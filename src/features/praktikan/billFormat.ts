import { formatSessionTime } from '@/components/session/sessionTime';
import type { Bill, BillStatus, Lab, MataKuliah, Session } from '@/types';
import { formatDateTime } from '@/utils/time';

/** Label status tagihan sesuai SRS v4 §3.5. */
export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  unpaid: 'Belum dibayar',
  pending: 'Menunggu pembayaran',
  success: 'Lunas',
  failed: 'Gagal, bayar ulang',
};

/** Simbol geometris/teks pendamping warna agar status tidak hanya mengandalkan warna (NFR-19). */
export const BILL_STATUS_SYMBOL: Record<BillStatus, string> = {
  unpaid: '!',
  pending: '…',
  success: '✓',
  failed: '✕',
};

export function formatRupiah(amount: number): string {
  return `Rp${new Intl.NumberFormat('id-ID').format(amount)}`;
}

export type BillDisplayInfo = {
  praktikumName: string;
  sessionTopic: string;
  labName: string;
  sessionDateText: string;
  createdDateText: string;
};

export function resolveBillDisplay(
  bill: Bill,
  session: Session | undefined,
  lab: Lab | undefined,
  mataKuliah: MataKuliah | undefined,
): BillDisplayInfo {
  const praktikumName = session?.praktikum || mataKuliah?.nama || 'Praktikum';
  const sessionTopic = session?.topik || 'Sesi praktikum';
  const labName = lab?.nama || session?.ruang || 'Lab';
  const sessionDateText = session
    ? formatSessionTime(session)
    : formatDateTime(bill.createdAt);
  const createdDateText = formatDateTime(bill.createdAt);

  return {
    praktikumName,
    sessionTopic,
    labName,
    sessionDateText,
    createdDateText,
  };
}
