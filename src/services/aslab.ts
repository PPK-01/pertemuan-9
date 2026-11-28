/**
 * Service layer Domain A – Aslab (Ibrahim – Sprint 4).
 * Bertanggung jawab atas: MataKuliah, Lab (CRUD dengan field Sprint 4),
 * keanggotaan lab (praktikan & asprak), dan query yang dibutuhkan Aslab.
 *
 * Kepemilikan file: Ibrahim. Jangan edit dari PR Dhimas/Elang.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { DocumentData, Unsubscribe } from 'firebase/firestore';
import { db, isFirebaseReady } from './firebase';
import { devWarn } from './devLog';
import { mapFirebaseError } from './errors';
import { normalizeEmail, DEFAULT_GRACE_MINUTES, MIN_GRACE_MINUTES, MAX_GRACE_MINUTES } from '@/constants/denda';
import type { CreateLabInput, Lab, MataKuliah, Result, UpdateLabInput } from '@/types';
import { createId } from '@/utils/id';

// ── MataKuliah ────────────────────────────────────────────────────────────────

function toMataKuliah(id: string, data: DocumentData): MataKuliah {
  return {
    id,
    kode: data.kode ?? '',
    nama: data.nama ?? '',
  };
}

/**
 * Mendengarkan daftar mata kuliah berdasarkan IDs Aslab.
 * Menggunakan onSnapshot per dokumen agar lolos rules (klien hanya bisa baca per ID miliknya).
 */
export function listenMataKuliah(
  mataKuliahIds: string[],
  onData: (list: MataKuliah[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!isFirebaseReady || !db) {
    onData([]);
    return () => { /* noop */ };
  }

  if (mataKuliahIds.length === 0) {
    onData([]);
    return () => { /* noop */ };
  }

  const results = new Map<string, MataKuliah>();
  const unsubscribes: Unsubscribe[] = [];

  function emit() {
    // Pertahankan urutan sesuai mataKuliahIds
    const ordered: MataKuliah[] = mataKuliahIds
      .map((id) => results.get(id))
      .filter((mk): mk is MataKuliah => mk !== undefined);
    onData(ordered);
  }

  for (const id of mataKuliahIds) {
    const docRef = doc(db, 'mataKuliah', id);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          results.set(id, toMataKuliah(snap.id, snap.data()));
        } else {
          results.delete(id);
        }
        emit();
      },
      (err) => {
        devWarn('mataKuliah', err);
        onError?.(err);
      },
    );
    unsubscribes.push(unsub);
  }

  return () => {
    unsubscribes.forEach((u) => u());
  };
}

/** Ambil semua mata kuliah milik Aslab (satu kali, untuk seed check). */
export async function getMataKuliahByIds(ids: string[]): Promise<MataKuliah[]> {
  if (!isFirebaseReady || !db || ids.length === 0) return [];
  const { getDoc: firestoreGetDoc } = await import('firebase/firestore');
  const results: MataKuliah[] = [];
  for (const id of ids) {
    try {
      const snap = await firestoreGetDoc(doc(db, 'mataKuliah', id));
      if (snap.exists()) results.push(toMataKuliah(snap.id, snap.data()));
    } catch {
      // Abaikan error per item
    }
  }
  return results;
}

// ── Lab (Aslab) ───────────────────────────────────────────────────────────────

function toStringEmailList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map(normalizeEmail);
}

function toLab(id: string, data: DocumentData): Lab {
  const praktikanEmails = toStringEmailList(data.praktikanEmails);
  const asprakEmails = toStringEmailList(data.asprakEmails);
  return {
    id,
    nama: data.nama ?? '',
    ...(data.gedung !== undefined && data.gedung !== '' ? { gedung: data.gedung } : {}),
    lat: typeof data.lat === 'number' ? data.lat : 0,
    lng: typeof data.lng === 'number' ? data.lng : 0,
    radiusM: typeof data.radiusM === 'number' ? data.radiusM : 50,
    createdBy: data.createdBy ?? '',
    createdAt:
      typeof data.createdAt?.toDate === 'function'
        ? data.createdAt.toDate().toISOString()
        : (data.createdAt ?? new Date().toISOString()),
    updatedBy: data.updatedBy ?? '',
    updatedAt:
      typeof data.updatedAt?.toDate === 'function'
        ? data.updatedAt.toDate().toISOString()
        : (data.updatedAt ?? new Date().toISOString()),
    ...(typeof data.mataKuliahId === 'string' ? { mataKuliahId: data.mataKuliahId } : {}),
    praktikanEmails,
    asprakEmails,
    graceMinutes: typeof data.graceMinutes === 'number' ? data.graceMinutes : DEFAULT_GRACE_MINUTES,
  };
}

/**
 * Mendengarkan lab untuk mata kuliah tertentu (milik Aslab).
 * Query: `where('mataKuliahId', '==', mkId)`.
 */
export function listenLabsByMataKuliah(
  mataKuliahId: string,
  onData: (labs: Lab[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!isFirebaseReady || !db) {
    onData([]);
    return () => { /* noop */ };
  }

  const q = query(collection(db, 'labs'), where('mataKuliahId', '==', mataKuliahId));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => toLab(d.id, d.data())));
    },
    (err) => {
      devWarn('labs/aslab', err);
      onError?.(err);
    },
  );
}

/** Ambil semua lab untuk daftar mataKuliahId Aslab (satu kali). */
export function listenAslabLabs(
  mataKuliahIds: string[],
  onData: (labs: Lab[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!isFirebaseReady || !db || mataKuliahIds.length === 0) {
    onData([]);
    return () => { /* noop */ };
  }

  const labsByMk = new Map<string, Lab[]>();
  const unsubscribes: Unsubscribe[] = [];

  function emit() {
    const all: Lab[] = [];
    for (const mkId of mataKuliahIds) {
      const list = labsByMk.get(mkId) ?? [];
      all.push(...list);
    }
    onData(all);
  }

  for (const mkId of mataKuliahIds) {
    const q = query(collection(db, 'labs'), where('mataKuliahId', '==', mkId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        labsByMk.set(mkId, snap.docs.map((d) => toLab(d.id, d.data())));
        emit();
      },
      (err) => {
        devWarn('labs/aslab', err);
        onError?.(err);
      },
    );
    unsubscribes.push(unsub);
  }

  return () => unsubscribes.forEach((u) => u());
}

// ── Validasi input lab (Aslab) ────────────────────────────────────────────────

function validateAslabLabInput(
  input: CreateLabInput,
  existingLabs: Lab[],
  excludeId?: string,
): Result | null {
  const trimmedNama = (input.nama ?? '').trim();
  if (trimmedNama.length < 2 || trimmedNama.length > 50) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Nama lab harus terdiri dari 2 hingga 50 karakter.',
    };
  }

  const isDuplicate = existingLabs.some(
    (l) => l.id !== excludeId && l.nama.trim().toLowerCase() === trimmedNama.toLowerCase(),
  );
  if (isDuplicate) {
    return { ok: false, code: 'DUPLICATE', message: 'Nama lab sudah digunakan.' };
  }

  if (input.gedung !== undefined && input.gedung !== null) {
    if ((input.gedung ?? '').trim().length > 60) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Nama gedung maksimal 60 karakter.' };
    }
  }

  if (typeof input.lat !== 'number' || !Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Latitude harus berupa angka antara -90 dan 90.' };
  }

  if (typeof input.lng !== 'number' || !Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Longitude harus berupa angka antara -180 dan 180.' };
  }

  if (typeof input.radiusM !== 'number' || input.radiusM < 10 || input.radiusM > 200) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Radius harus antara 10 dan 200 meter.' };
  }

  if (!input.mataKuliahId) {
    return { ok: false, code: 'INVALID_INPUT', message: 'Mata kuliah wajib dipilih.' };
  }

  if (input.graceMinutes !== undefined) {
    const gm = input.graceMinutes;
    if (!Number.isInteger(gm) || gm < MIN_GRACE_MINUTES || gm > MAX_GRACE_MINUTES) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: `Toleransi keterlambatan harus bilangan bulat antara ${MIN_GRACE_MINUTES} dan ${MAX_GRACE_MINUTES} menit.`,
      };
    }
  }

  return null; // valid
}

/** Membuat lab baru oleh Aslab. Wajib menyertakan mataKuliahId. */
export async function addAslabLab(
  input: CreateLabInput,
  userId: string,
  existingLabs: Lab[],
): Promise<Result<Lab>> {
  const err = validateAslabLabInput(input, existingLabs);
  if (err) return err as Result<Lab>;

  if (!isFirebaseReady || !db) {
    return { ok: false, code: 'NO_CONNECTION', message: 'Firebase belum siap.' };
  }

  try {
    const labId = createId('lab');    const now = serverTimestamp();
    const data = {
      nama: input.nama.trim(),
      gedung: input.gedung?.trim() ?? '',
      lat: input.lat,
      lng: input.lng,
      radiusM: input.radiusM,
      mataKuliahId: input.mataKuliahId,
      praktikanEmails: (input.praktikanEmails ?? []).map(normalizeEmail),
      asprakEmails: (input.asprakEmails ?? []).map(normalizeEmail),
      graceMinutes: input.graceMinutes ?? DEFAULT_GRACE_MINUTES,
      createdBy: userId,
      createdAt: now,
      updatedBy: userId,
      updatedAt: now,
    };

    await setDoc(doc(db, 'labs', labId), data);

    const created: Lab = {
      id: labId,
      nama: data.nama,
      ...(data.gedung ? { gedung: data.gedung } : {}),
      lat: data.lat,
      lng: data.lng,
      radiusM: data.radiusM,
      mataKuliahId: data.mataKuliahId,
      praktikanEmails: data.praktikanEmails,
      asprakEmails: data.asprakEmails,
      graceMinutes: data.graceMinutes,
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
      updatedBy: data.updatedBy,
      updatedAt: new Date().toISOString(),
    };
    return { ok: true, data: created };
  } catch (error) {
    const mapped = mapFirebaseError(error);
    return { ok: false, code: mapped.code, message: mapped.message };
  }
}

/** Memperbarui lab (Aslab). Mendukung update sebagian. */
export async function updateAslabLab(
  labId: string,
  patch: UpdateLabInput,
  userId: string,
  existingLabs: Lab[],
): Promise<Result> {
  if (!isFirebaseReady || !db) {
    return { ok: false, code: 'NO_CONNECTION', message: 'Firebase belum siap.' };
  }

  // Validasi patch (hanya field yang dikirim)
  if (patch.graceMinutes !== undefined) {
    const gm = patch.graceMinutes;
    if (!Number.isInteger(gm) || gm < MIN_GRACE_MINUTES || gm > MAX_GRACE_MINUTES) {
      return {
        ok: false,
        code: 'INVALID_INPUT',
        message: `Toleransi keterlambatan harus bilangan bulat antara ${MIN_GRACE_MINUTES} dan ${MAX_GRACE_MINUTES} menit.`,
      };
    }
  }

  if (patch.nama !== undefined) {
    const trimmed = patch.nama.trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Nama lab harus terdiri dari 2 hingga 50 karakter.' };
    }
    const isDuplicate = existingLabs.some(
      (l) => l.id !== labId && l.nama.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (isDuplicate) {
      return { ok: false, code: 'DUPLICATE', message: 'Nama lab sudah digunakan.' };
    }
  }

  if (patch.gedung !== undefined && patch.gedung !== null) {
    if (patch.gedung.trim().length > 60) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Nama gedung maksimal 60 karakter.' };
    }
  }

  if (patch.lat !== undefined) {
    if (typeof patch.lat !== 'number' || !Number.isFinite(patch.lat) || patch.lat < -90 || patch.lat > 90) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Latitude harus berupa angka antara -90 dan 90.' };
    }
  }

  if (patch.lng !== undefined) {
    if (typeof patch.lng !== 'number' || !Number.isFinite(patch.lng) || patch.lng < -180 || patch.lng > 180) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Longitude harus berupa angka antara -180 dan 180.' };
    }
  }

  if (patch.radiusM !== undefined) {
    if (typeof patch.radiusM !== 'number' || !Number.isInteger(patch.radiusM) || patch.radiusM < 10 || patch.radiusM > 200) {
      return { ok: false, code: 'INVALID_INPUT', message: 'Radius harus berupa bilangan bulat antara 10 dan 200 meter.' };
    }
  }

  try {
    const updateData: Record<string, unknown> = {
      updatedBy: userId,
      updatedAt: serverTimestamp(),
    };

    if (patch.nama !== undefined) updateData.nama = patch.nama.trim();
    if (patch.gedung !== undefined) updateData.gedung = patch.gedung.trim();
    if (patch.lat !== undefined) updateData.lat = patch.lat;
    if (patch.lng !== undefined) updateData.lng = patch.lng;
    if (patch.radiusM !== undefined) updateData.radiusM = patch.radiusM;
    if (patch.graceMinutes !== undefined) updateData.graceMinutes = patch.graceMinutes;
    if (patch.praktikanEmails !== undefined)
      updateData.praktikanEmails = patch.praktikanEmails.map(normalizeEmail);
    if (patch.asprakEmails !== undefined)
      updateData.asprakEmails = patch.asprakEmails.map(normalizeEmail);

    await updateDoc(doc(db, 'labs', labId), updateData);
    return { ok: true, data: undefined };
  } catch (error) {
    const mapped = mapFirebaseError(error);
    return { ok: false, code: mapped.code, message: mapped.message };
  }
}

/** Menghapus lab (Aslab). Lab yang masih dipakai sesi aktif tidak bisa dihapus. */
export async function deleteAslabLab(labId: string): Promise<Result> {
  if (!isFirebaseReady || !db) {
    return { ok: false, code: 'NO_CONNECTION', message: 'Firebase belum siap.' };
  }

  try {
    // Cek apakah masih ada sesi aktif (bukan closed)
    const q = query(collection(db, 'sessions'), where('labId', '==', labId));
    const snap = await getDocs(q);
    const inUse = snap.docs.some((d) => d.data().status !== 'closed');

    if (inUse) {
      return {
        ok: false,
        code: 'IN_USE',
        message: 'Lab ini masih dipakai sesi yang belum ditutup.',
      };
    }

    await deleteDoc(doc(db, 'labs', labId));
    return { ok: true, data: undefined };
  } catch (error) {
    const mapped = mapFirebaseError(error);
    return { ok: false, code: mapped.code, message: mapped.message };
  }
}
