import type { AttendFailReason } from '@/types';

/**
 * Pesan kegagalan presensi baku sesuai SRS v3.2 §4.3.
 * Template dapat memuat penanda {x}, {lab}, dan {radius} yang diinterpolasi
 * melalui fungsi getAttendFailMessage.
 */
export const ATTEND_FAIL_MESSAGE: Record<AttendFailReason, string> = {
  SESSION_NOT_OPEN: 'Sesi tidak sedang dibuka',
  ALREADY_ATTENDED: 'Kamu sudah presensi pada sesi ini',
  INVALID_CODE: 'Kode sesi tidak sesuai',
  NOT_IN_CLASS: 'Kamu tidak terdaftar di lab untuk sesi ini',
  IZIN_APPROVED: 'Izinmu untuk sesi ini sudah disetujui',
  NO_CONNECTION: 'Tidak ada koneksi. Presensi memerlukan internet',
  TIMEOUT: 'Presensi belum dapat dipastikan. Cek tab Riwayat sebelum mencoba lagi',
  UNKNOWN: 'Terjadi kesalahan sistem saat presensi. Coba lagi nanti',
  NO_LAB: 'Lab sesi ini belum diatur asisten.',
  OUTSIDE_RADIUS: 'Kamu berada {x} m dari {lab}. Mendekatlah hingga {radius} m.',
  LOW_ACCURACY: 'Lokasi belum akurat (±{x} m). Pindah ke dekat jendela atau tempat terbuka, lalu perbarui.',
  MOCKED_LOCATION: 'Lokasi palsu terdeteksi. Matikan aplikasi pengubah lokasi.',
  LOCATION_PERMISSION: 'Akses lokasi ditolak. Presensi membutuhkan lokasimu.',
  LOCATION_SERVICES_OFF: 'Layanan lokasi di HP-mu tidak aktif.',
  LOCATION_TIMEOUT: 'Lokasi belum didapat. Pastikan GPS aktif lalu coba lagi.',
};

export type AttendFailParams = {
  x?: number | string;
  lab?: string;
  radius?: number | string;
};

/**
 * Mengembalikan pesan kegagalan presensi dengan interpolasi parameter dinamis ({x}, {lab}, {radius})
 * sesuai tabel SRS v3.2 §4.3.
 */
export function getAttendFailMessage(
  reason: AttendFailReason,
  params?: AttendFailParams,
): string {
  let template = ATTEND_FAIL_MESSAGE[reason] ?? ATTEND_FAIL_MESSAGE.UNKNOWN;
  if (!params) return template;

  if (params.x !== undefined) {
    template = template.replaceAll('{x}', String(params.x));
  }
  if (params.lab !== undefined) {
    template = template.replaceAll('{lab}', params.lab);
  }
  if (params.radius !== undefined) {
    template = template.replaceAll('{radius}', String(params.radius));
  }
  return template;
}
