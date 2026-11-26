// ===== Tipe Domain Rawuh - Sprint 2, 3, dan 4 =====

/**
 * Satu role per akun. 'asisten' adalah "Asprak" di UI/SRS (nilai di data tetap 'asisten' agar
 * dokumen lama tetap valid). 'aslab' tidak bisa mendaftar sendiri: dibuat lewat seed/Admin SDK (Sprint 4).
 */
export type Role = 'praktikan' | 'asisten' | 'aslab';
export type Kelas = string;
export type Praktikum = string;

/** Daftar status sesi praktikum. */
export const SESSION_STATUS_LIST = ['scheduled', 'open', 'closed'] as const;
export type SessionStatus = (typeof SESSION_STATUS_LIST)[number];

/** Daftar status izin. */
export const IZIN_STATUS_LIST = [
  'pending_ai',
  'pending_review',
  'approved',
  'rejected',
] as const;
export type IzinStatus = (typeof IZIN_STATUS_LIST)[number];

/** Daftar kategori analisis izin AI. */
export const IZIN_KATEGORI_LIST = [
  'sakit',
  'keluarga',
  'akademik',
  'lainnya',
  'tidak_jelas',
] as const;
export type IzinKategori = (typeof IZIN_KATEGORI_LIST)[number];

// ===== Entitas =====

export type User = {
  id: string; // Firebase Auth uid
  name: string;
  email: string;
  role: Role;
  /**
   * Hanya diisi untuk praktikan. DATA LAMA Sprint 2–3: sejak Sprint 4 keanggotaan ditentukan oleh
   * `Lab.praktikanEmails`, bukan `kelas`. Dipertahankan selama masa transisi (TRANSISI-SPRINT4).
   */
  kelas?: Kelas;
  /** Hanya diisi untuk aslab (Sprint 4): mata kuliah yang diampu. */
  mataKuliahIds?: string[];
};

/** Mata kuliah praktikum (Sprint 4). Dibuat lewat seed/Admin SDK; klien hanya membaca. */
export type MataKuliah = {
  id: string;
  kode: string;
  nama: string;
};

export type KelasPraktikum = {
  id: string;
  praktikum: string;
  kelas: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
};

export type LabId = string;

export type Lab = {
  id: LabId;
  nama: string;
  gedung?: string;
  lat: number;
  lng: number;
  radiusM: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  /**
   * Sprint 4: lab = rombongan praktikum per mata kuliah dengan lokasi sendiri. Keempat field di bawah
   * opsional di tipe karena lab lama (Sprint 3) belum memilikinya sampai skrip seed-sprint4 dijalankan.
   * Pembaca wajib memperlakukan nilai kosong sebagai: tanpa mata kuliah, tanpa anggota,
   * graceMinutes = DEFAULT_GRACE_MINUTES.
   */
  mataKuliahId?: string;
  /** Email praktikan anggota rombongan; selalu huruf kecil dan di-trim (normalizeEmail). */
  praktikanEmails?: string[];
  /** Email Asprak yang bertanggung jawab atas sesi lab ini; selalu huruf kecil dan di-trim. */
  asprakEmails?: string[];
  /** Toleransi keterlambatan (menit) sebelum presensi dihitung telat dan kena denda. 0..60. */
  graceMinutes?: number;
};

export type Session = {
  id: string;
  praktikum: Praktikum;
  kelas: Kelas;
  topik: string;
  /** Ruang sesi (v2.2); pada sesi baru diisi nama lab atau string kosong, digantikan labId (v3). */
  ruang: string;
  /** Rujukan lab praktikum (Sprint 3). */
  labId?: LabId;
  /** ISO 8601 (UTC). */
  startAt: string;
  /** ISO 8601 (UTC). */
  endAt: string;
  status: SessionStatus;
  /** id User asisten pembuat. */
  createdBy: string;
  openedAt?: string;
  closedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type LokasiPresensi = {
  lat: number;
  lng: number;
  akurasiM: number;
  jarakM: number;
  mocked: boolean;
};

export type Attendance = {
  id: string; // ${sessionId}_${userId}
  sessionId: string;
  userId: string;
  kelas?: string;
  code?: string;
  timestamp: string; // ISO 8601 (UTC)
  /**
   * labId dan lokasi bersifat opsional karena data presensi lama (Sprint 2) tidak memiliki
   * field ini. Untuk presensi baru (Sprint 3), kedua field ini wajib diisi oleh klien dan
   * divalidasi oleh security rules.
   */
  labId?: LabId;
  lokasi?: LokasiPresensi;
};

export type DevicePosition = {
  lat: number;
  lng: number;
  akurasiM: number;
  mocked: boolean;
  at: string;
};

export type LocationStatus =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'permission_denied'
  | 'permission_blocked'
  | 'services_off'
  | 'low_accuracy'
  | 'mocked'
  | 'timeout'
  | 'unavailable';

export type NotificationPermission =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unsupported';

export type NotifPayload =
  | { type: 'session_opened'; sessionId: string }
  | { type: 'session_created'; sessionId: string }
  | { type: 'izin_decided'; izinId: string }
  | { type: 'location_changed'; sessionId: string }
  // Sprint 4, dikirim dari server (Expo Push API). Diketuk membuka detail tagihan.
  | { type: 'bill_created'; billId: string } // N7
  | { type: 'payment_success'; billId: string } // N8
  | { type: 'payment_failed'; billId: string }; // N9

// ===== Denda & Pembayaran (Sprint 4) =====
// Client hanya MEMBACA bills dan payments; semua tulis lewat Admin SDK di server/.

export const BILL_STATUS_LIST = ['unpaid', 'pending', 'success', 'failed'] as const;
export type BillStatus = (typeof BILL_STATUS_LIST)[number];

/** Tagihan denda telat. ID dokumen deterministik: `${sessionId}_${userId}` (satu telat = satu tagihan). */
export type Bill = {
  id: string;
  userId: string;
  userEmail: string;
  sessionId: string;
  labId: LabId;
  mataKuliahId: string;
  /** Rujukan ke attendances/{sessionId}_{userId}. */
  attendanceId: string;
  /** Rupiah, bilangan bulat. */
  amount: number;
  /** Menit keterlambatan dihitung sejak startAt sesi (lihat computeLateMinutes). */
  lateMinutes: number;
  status: BillStatus;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  /** orderId percobaan bayar terakhir (payments/{orderId}). */
  lastOrderId?: string;
};

export const PAYMENT_STATUS_LIST = ['pending', 'success', 'failed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS_LIST)[number];

/** Satu percobaan bayar. `id` = orderId Midtrans, unik per percobaan: `${billId}-${n}`. */
export type Payment = {
  id: string;
  billId: string;
  userId: string;
  amount: number;
  status: PaymentStatus;
  /** transaction_status mentah dari Midtrans (settlement, pending, expire, ...). */
  midtransStatus: string;
  paymentType?: string;
  redirectUrl?: string;
  createdAt: string;
  updatedAt: string;
  settledAt?: string;
};

// ===== Analisis AI & Review Izin =====

export type AiErrorCode = 'MODEL_ERROR';

export type AiResult =
  | {
      state: 'success';
      kategori: IzinKategori;
      saran: 'diterima' | 'ditolak' | 'perlu_cek';
      sentimen: 'positif' | 'netral' | 'negatif' | null;
      skor: Record<string, number> | null;
      penjelasan: string;
      eksperimental: true;
      at: string;
    }
  | {
      state: 'failed';
      errorCode: AiErrorCode;
      at: string;
    };

export type IzinReview = {
  keputusan: 'approved' | 'rejected';
  catatan?: string;
  reviewedBy: string;
  reviewedAt: string;
};

export type Izin = {
  id: string; // ${sessionId}_${userId}
  sessionId: string;
  userId: string;
  userName: string;
  kelas: string;
  alasan: string;
  status: IzinStatus;
  ai?: AiResult;
  review?: IzinReview;
  createdAt: string;
  updatedAt: string;
};

// ===== Rekap (FR-10, FR-28, FR-39) =====

export type RekapItemHadir = {
  user: User;
  timestamp: string;
  lokasi?: LokasiPresensi;
};

export type Rekap = {
  total: number;
  /** Urut timestamp kehadiran paling awal di atas. */
  hadir: RekapItemHadir[];
  /** Hanya izin berstatus approved, diurutkan menurut nama user. */
  izin: { user: User; izin: Izin }[];
  /** Diurutkan menurut nama; tidak memuat yang hadir atau izin disetujui. */
  belumHadir: User[];
};

// ===== Hasil Operasi & Error Handlers =====

export type ErrorCode =
  | 'NO_CONNECTION'
  | 'TIMEOUT'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'CONFLICT'
  /** Data dengan kunci unik yang sama sudah ada (mis. pasangan praktikum dan kelas, nama lab). */
  | 'DUPLICATE'
  /** Data masih dirujuk data lain sehingga belum boleh diubah atau dihapus (FR-20, FR-43). */
  | 'IN_USE'
  | 'UNKNOWN';

export type Result<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string };

export type AttendFailReason =
  | 'SESSION_NOT_OPEN'
  | 'ALREADY_ATTENDED'
  | 'INVALID_CODE'
  | 'NOT_IN_CLASS'
  | 'IZIN_APPROVED'
  | 'NO_CONNECTION'
  | 'TIMEOUT'
  | 'UNKNOWN'
  | 'NO_LAB'
  | 'OUTSIDE_RADIUS'
  | 'LOW_ACCURACY'
  | 'MOCKED_LOCATION'
  | 'LOCATION_PERMISSION'
  | 'LOCATION_SERVICES_OFF'
  | 'LOCATION_TIMEOUT';

export type AttendResult =
  | { ok: true; attendance: Attendance }
  | { ok: false; reason: AttendFailReason };

// ===== Input Forms =====

export type CreateLabInput = {
  nama: string;
  gedung?: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** Sprint 4; wajib diisi form aslab, opsional di tipe agar kode Sprint 3 tetap valid. */
  mataKuliahId?: string;
  praktikanEmails?: string[];
  asprakEmails?: string[];
  graceMinutes?: number;
};

export type UpdateLabInput = Partial<CreateLabInput>;

export type CreateSessionInput = {
  praktikum: string;
  kelas: string;
  topik: string;
  ruang?: string;
  labId?: LabId;
  startAt: string;
  endAt: string;
  createdBy: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role: Role;
  kelas?: string;
  inviteCode?: string;
};
