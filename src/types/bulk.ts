// Kontrak bulk insert Sprint 4 (CSV + papaparse). Hanya tipe: komponen review generik
// dibuat Ibrahim di src/features/bulk/**. Satu komponen untuk 3 jenis; yang beda hanya
// definisi kolom + validasi.

export const BULK_KIND_LIST = ['lab', 'praktikan', 'asprak'] as const;
export type BulkKind = (typeof BULK_KIND_LIST)[number];

export const BULK_ROW_STATUS_LIST = ['pending', 'accepted', 'rejected'] as const;
export type BulkRowStatus = (typeof BULK_ROW_STATUS_LIST)[number];

/** Nilai mentah satu baris CSV per jenis. Semua string: konversi tipe terjadi setelah validasi. */
export type BulkLabValues = {
  nama: string;
  gedung: string;
  lat: string;
  lng: string;
  radiusM: string;
  graceMinutes: string;
};
export type BulkPraktikanValues = { email: string };
export type BulkAsprakValues = { email: string };

export type BulkValuesByKind = {
  lab: BulkLabValues;
  praktikan: BulkPraktikanValues;
  asprak: BulkAsprakValues;
};

/** Definisi satu kolom CSV. `key` juga menjadi header CSV pada template. */
export type BulkColumn<T> = {
  key: keyof T & string;
  label: string;
  required: boolean;
  /** Contoh nilai untuk baris contoh pada template CSV. */
  example: string;
  /** Mengembalikan pesan error (bahasa Indonesia) atau null bila valid. `row` = nilai seluruh baris. */
  validate: (value: string, row: T) => string | null;
};

export type BulkRow<T> = {
  /** Nomor baris data pada berkas CSV (1 = baris data pertama, setelah header). */
  rowNumber: number;
  values: T;
  /** Pesan error per kolom; baris dengan error tidak bisa diterima. */
  errors: Partial<Record<keyof T & string, string>>;
  /** Peringatan yang tidak memblokir, mis. "Akun belum terdaftar". */
  warnings: string[];
  status: BulkRowStatus;
};

export type BulkReviewProps<T> = {
  kind: BulkKind;
  rows: BulkRow<T>[];
  columns: BulkColumn<T>[];
  /** Edit satu sel; pemanggil memvalidasi ulang baris. */
  onChangeRow: (rowNumber: number, key: keyof T & string, value: string) => void;
  onAccept: (rowNumber: number) => void;
  onReject: (rowNumber: number) => void;
  /** Menerima semua baris pending yang tidak punya error. */
  onAcceptAllValid: () => void;
  /** Mengirim baris berstatus accepted. */
  onSubmit: () => void;
  submitting?: boolean;
};
