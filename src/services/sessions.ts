import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { normalizeEmail } from '@/constants/denda';
import { db, isFirebaseReady } from './firebase';
import { devWarn } from './devLog';
import { mapFirebaseError } from './errors';
import { isPraktikanOfLab } from './labs';
import type { CreateSessionInput, Result, Session, User } from '@/types';
import { createId, createSessionCode } from '@/utils/id';
import { inMemory, getInMemoryLabs, getInMemorySessions } from './inMemoryStore';

export { getInMemorySessions };

const fallbackSessionListeners = new Set<() => void>();

function notifyFallbackSessionListeners() {
  fallbackSessionListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Abaikan error di callback
    }
  });
}

function toSession(id: string, data: DocumentData): Session {
  return {
    id,
    praktikum: data.praktikum,
    kelas: data.kelas,
    topik: data.topik,
    ruang: data.ruang ?? '',
    labId: data.labId,
    startAt: typeof data.startAt?.toDate === 'function' ? data.startAt.toDate().toISOString() : data.startAt,
    endAt: typeof data.endAt?.toDate === 'function' ? data.endAt.toDate().toISOString() : data.endAt,
    status: data.status,
    createdBy: data.createdBy,
    openedAt: typeof data.openedAt?.toDate === 'function' ? data.openedAt.toDate().toISOString() : data.openedAt,
    closedAt: typeof data.closedAt?.toDate === 'function' ? data.closedAt.toDate().toISOString() : data.closedAt,
  };
}

/**
 * Id sesi baru tanpa menulis apa pun. Dipakai layar buat sesi agar kirim ulang setelah gagal
 * atau TIMEOUT memakai id yang sama, sehingga tidak ada sesi ganda.
 */
export function newSessionId(): string {
  if (!isFirebaseReady || !db) {
    return createId('ses');
  }
  return doc(collection(db, 'sessions')).id;
}

export function listenSessions(
  user: User,
  onData: (sessions: Session[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!isFirebaseReady || !db) {
    const notify = () => {
      if (user.role === 'asisten' || user.role === 'aslab') {
        onData(inMemory.sessions);
        return;
      }
      const allowedLabIds = new Set(
        inMemory.labs
          .filter((lab) => isPraktikanOfLab(lab, user.email))
          .map((lab) => lab.id),
      );
      onData(inMemory.sessions.filter((s) => Boolean(s.labId && allowedLabIds.has(s.labId))));
    };
    notify();
    fallbackSessionListeners.add(notify);
    return () => {
      fallbackSessionListeners.delete(notify);
    };
  }

  const sessionsRef = collection(db, 'sessions');
  if (user.role === 'asisten' || user.role === 'aslab') {
    return onSnapshot(
      query(sessionsRef),
      (snapshot) => {
        const list: Session[] = snapshot.docs.map((d) => toSession(d.id, d.data()));
        onData(list);
      },
      (error) => {
        devWarn('sessions', error);
        if (onError) onError(error);
      },
    );
  }

  // Praktikan: satu listener where('labId', '==', X) per lab keanggotaan (kontrak §2).
  const firestore = db;
  const sessionUnsubs = new Map<string, () => void>();
  const sessionsByLab = new Map<string, Session[]>();
  const initializedLabs = new Set<string>();

  const emitMerged = () => {
    const merged: Session[] = [];
    for (const list of sessionsByLab.values()) {
      merged.push(...list);
    }
    onData(merged);
  };

  const labsQuery = query(
    collection(firestore, 'labs'),
    where('praktikanEmails', 'array-contains', normalizeEmail(user.email)),
  );

  const labsUnsub = onSnapshot(
    labsQuery,
    (labsSnapshot) => {
      const nextLabIds = new Set(labsSnapshot.docs.map((d) => d.id));

      for (const [labId, unsub] of sessionUnsubs.entries()) {
        if (!nextLabIds.has(labId)) {
          unsub();
          sessionUnsubs.delete(labId);
          sessionsByLab.delete(labId);
          initializedLabs.delete(labId);
        }
      }

      if (nextLabIds.size === 0) {
        onData([]);
        return;
      }

      let addedNewListener = false;
      for (const labId of nextLabIds) {
        if (sessionUnsubs.has(labId)) continue;
        addedNewListener = true;
        const labSessionsQuery = query(sessionsRef, where('labId', '==', labId));
        const unsub = onSnapshot(
          labSessionsQuery,
          (snapshot) => {
            sessionsByLab.set(
              labId,
              snapshot.docs.map((d) => toSession(d.id, d.data())),
            );
            initializedLabs.add(labId);
            emitMerged();
          },
          (error) => {
            devWarn('sessions', error);
            if (onError) onError(error);
          },
        );
        sessionUnsubs.set(labId, unsub);
      }

      if (!addedNewListener && initializedLabs.size > 0) {
        emitMerged();
      }
    },
    (error) => {
      devWarn('sessions-labs', error);
      if (onError) onError(error);
    },
  );

  return () => {
    labsUnsub();
    for (const unsub of sessionUnsubs.values()) {
      unsub();
    }
    sessionUnsubs.clear();
    sessionsByLab.clear();
  };
}

export async function createSession(
  input: CreateSessionInput & { id?: string },
): Promise<Result<Session>> {
  // FR-04: Sesi baru wajib punya lab
  if (!input.labId) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Sesi baru wajib memilih lab.',
    };
  }

  // C-2: Sesi dibuat dengan id final Firestore yang konsisten sejak awal
  const sessionId = input.id ?? createId('ses');
  const code = createSessionCode();

  if (!isFirebaseReady || !db) {
    const labExists = getInMemoryLabs().some((l) => l.id === input.labId);
    if (!labExists) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        message: 'Lab yang dipilih tidak ditemukan.',
      };
    }

    const existing = inMemory.sessions.find((s) => s.id === sessionId);
    if (existing) {
      return { ok: true, data: existing };
    }
    const newSession: Session = {
      id: sessionId,
      praktikum: input.praktikum,
      kelas: input.kelas,
      topik: input.topik,
      ruang: '',
      labId: input.labId,
      startAt: input.startAt,
      endAt: input.endAt,
      status: 'scheduled',
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    inMemory.sessions = [...inMemory.sessions, newSession];
    inMemory.codes[sessionId] = code;
    notifyFallbackSessionListeners();
    return { ok: true, data: newSession };
  }

  try {
    const sessionRef = doc(db, 'sessions', sessionId);

    // Kirim ulang dengan id yang sama: bila tulis sebelumnya ternyata sudah tersimpan (mis. setelah
    // TIMEOUT), kembalikan sesi itu tanpa menulis ulang. Rules hanya mengizinkan create, jadi
    // menulis ulang dokumen yang sudah ada akan ditolak.
    if (input.id) {
      const existing = await getDoc(sessionRef);
      if (existing.exists()) {
        return { ok: true, data: toSession(existing.id, existing.data()) };
      }
    }

    const labSnap = await getDoc(doc(db, 'labs', input.labId));
    if (!labSnap.exists()) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        message: 'Lab yang dipilih tidak ditemukan.',
      };
    }

    const batch = writeBatch(db);
    batch.set(sessionRef, {
      praktikum: input.praktikum,
      kelas: input.kelas,
      topik: input.topik,
      labId: input.labId,
      startAt: input.startAt,
      endAt: input.endAt,
      createdBy: input.createdBy,
      status: 'scheduled',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const codeRef = doc(db, 'sessions', sessionId, 'private', 'code');
    batch.set(codeRef, { code });

    try {
      await batch.commit();
    } catch (commitError) {
      // Tulis sebelumnya (mis. yang kena TIMEOUT) bisa tiba di server setelah pengecekan di atas;
      // batch ini lalu dihitung update dan ditolak rules. Bila dokumennya ternyata ada, anggap
      // sukses dengan sesi yang sudah tersimpan.
      if (input.id && (commitError as { code?: string }).code === 'permission-denied') {
        const existing = await getDoc(sessionRef);
        if (existing.exists()) {
          return { ok: true, data: toSession(existing.id, existing.data()) };
        }
      }
      throw commitError;
    }

    const created: Session = {
      id: sessionId,
      praktikum: input.praktikum,
      kelas: input.kelas,
      topik: input.topik,
      ruang: '',
      labId: input.labId,
      startAt: input.startAt,
      endAt: input.endAt,
      createdBy: input.createdBy,
      status: 'scheduled',
    };
    return { ok: true, data: created };
  } catch (error) {
    const mapped = mapFirebaseError(error);
    return { ok: false, code: mapped.code, message: mapped.message };
  }
}

export async function updateSession(
  id: string,
  patch: Partial<Session>,
): Promise<Result> {
  if (patch.labId !== undefined) {
    if (!isFirebaseReady || !db) {
      const labExists = getInMemoryLabs().some((l) => l.id === patch.labId);
      if (!labExists) {
        return { ok: false, code: 'NOT_FOUND', message: 'Lab yang dipilih tidak ditemukan.' };
      }
    } else {
      const labSnap = await getDoc(doc(db, 'labs', patch.labId));
      if (!labSnap.exists()) {
        return { ok: false, code: 'NOT_FOUND', message: 'Lab yang dipilih tidak ditemukan.' };
      }
    }
  }

  if (!isFirebaseReady || !db) {
    inMemory.sessions = inMemory.sessions.map((s) => {
      if (s.id !== id) return s;
      return { ...s, ...patch, updatedAt: new Date().toISOString() };
    });
    notifyFallbackSessionListeners();
    return { ok: true, data: undefined };
  }

  try {
    const sessionRef = doc(db, 'sessions', id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...cleanPatch } = patch;
    const batch = writeBatch(db);
    batch.update(sessionRef, {
      ...cleanPatch,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    return { ok: true, data: undefined };
  } catch (error) {
    const mapped = mapFirebaseError(error);
    return { ok: false, code: mapped.code, message: mapped.message };
  }
}

export async function setStatus(
  id: string,
  status: 'open' | 'closed',
): Promise<Result> {
  const now = new Date().toISOString();

  if (!isFirebaseReady || !db) {
    inMemory.sessions = inMemory.sessions.map((s) => {
      if (s.id !== id) return s;
      return status === 'open'
        ? { ...s, status: 'open', openedAt: now, updatedAt: now }
        : { ...s, status: 'closed', closedAt: now, updatedAt: now };
    });
    notifyFallbackSessionListeners();
    return { ok: true, data: undefined };
  }

  try {
    const sessionRef = doc(db, 'sessions', id);
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp(),
    };

    if (status === 'open') {
      updateData.openedAt = serverTimestamp();
    } else {
      updateData.closedAt = serverTimestamp();
    }

    const batch = writeBatch(db);
    batch.update(sessionRef, updateData);
    await batch.commit();

    return { ok: true, data: undefined };
  } catch (error) {
    const mapped = mapFirebaseError(error);
    return { ok: false, code: mapped.code, message: mapped.message };
  }
}

export async function deleteSession(id: string): Promise<Result> {
  if (!isFirebaseReady || !db) {
    inMemory.sessions = inMemory.sessions.filter((s) => s.id !== id);
    delete inMemory.codes[id];
    notifyFallbackSessionListeners();
    return { ok: true, data: undefined };
  }

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'sessions', id, 'private', 'code'));
    batch.delete(doc(db, 'sessions', id));
    await batch.commit();

    return { ok: true, data: undefined };
  } catch (error) {
    const mapped = mapFirebaseError(error);
    return { ok: false, code: mapped.code, message: mapped.message };
  }
}

const CODE_NOT_FOUND: Result<string> = {
  ok: false,
  code: 'NOT_FOUND',
  message: 'Kode sesi tidak ditemukan',
};

/** Kode sesi 4 digit (khusus asisten). Gagal baca dikembalikan sebagai Result, bukan null. */
export async function getSessionCode(sessionId: string): Promise<Result<string>> {
  if (!isFirebaseReady || !db) {
    const code = inMemory.codes[sessionId];
    return code !== undefined ? { ok: true, data: code } : CODE_NOT_FOUND;
  }

  try {
    const codeDoc = await getDoc(doc(db, 'sessions', sessionId, 'private', 'code'));
    const code: unknown = codeDoc.exists() ? codeDoc.data()?.code : undefined;
    return typeof code === 'string' ? { ok: true, data: code } : CODE_NOT_FOUND;
  } catch (error) {
    const mapped = mapFirebaseError(error);
    return { ok: false, code: mapped.code, message: mapped.message };
  }
}
