import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, isFirebaseReady } from './firebase';
import { connectionService } from './connection';
import { devWarn } from './devLog';
import { isPraktikanOfLab } from './labs';
import { MAX_ACCURACY_M } from '@/constants/location';
import { dummyAttendances, dummySessionCodes } from '@/data/dummy';
import type { Attendance, AttendResult, Lab, LokasiPresensi, Session, User } from '@/types';

let inMemoryAttendances: Attendance[] = [...dummyAttendances];
const fallbackAttendanceListeners = new Set<() => void>();

function notifyFallbackAttendanceListeners() {
  fallbackAttendanceListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Abaikan error di callback
    }
  });
}

export function listenAttendances(
  user: User,
  onData: (attendances: Attendance[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!isFirebaseReady || !db) {
    const notify = () => {
      const list =
        user.role === 'asisten'
          ? inMemoryAttendances
          : inMemoryAttendances.filter((a) => a.userId === user.id);
      onData(list);
    };
    notify();
    fallbackAttendanceListeners.add(notify);
    return () => {
      fallbackAttendanceListeners.delete(notify);
    };
  }

  const collRef = collection(db, 'attendances');
  const q =
    user.role === 'asisten'
      ? query(collRef)
      : query(collRef, where('userId', '==', user.id));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const list: Attendance[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          sessionId: data.sessionId,
          userId: data.userId,
          kelas: data.kelas,
          code: data.code,
          timestamp:
            typeof data.timestamp?.toDate === 'function'
              ? data.timestamp.toDate().toISOString()
              : (data.timestamp || new Date().toISOString()),
          labId: data.labId,
          lokasi: data.lokasi
            ? {
                lat: data.lokasi.lat,
                lng: data.lokasi.lng,
                akurasiM: data.lokasi.akurasiM,
                jarakM: data.lokasi.jarakM,
                mocked: Boolean(data.lokasi.mocked),
              }
            : undefined,
        };
      });
      onData(list);
    },
    (error) => {
      devWarn('attendance', error);
      if (onError) onError(error);
    },
  );

  return unsubscribe;
}

export async function submitAttendance(
  sessionId: string,
  user: User,
  code: string,
  session: Session,
  labId: string,
  lokasi: LokasiPresensi,
  lab?: Lab,
): Promise<AttendResult> {
  // 1. Pra-cek koneksi (FR-29, SRS 4.3)
  if (!connectionService.isConnected) {
    return { ok: false, reason: 'NO_CONNECTION' };
  }

  // 2. Pra-cek sesi & keanggotaan lab
  if (session.status !== 'open') {
    return { ok: false, reason: 'SESSION_NOT_OPEN' };
  }
  if (!lab || !isPraktikanOfLab(lab, user.email)) {
    return { ok: false, reason: 'NOT_IN_CLASS' };
  }

  const attendanceId = `${sessionId}_${user.id}`;

  if (!isFirebaseReady || !db) {
    // Mode Fallback
    const already = inMemoryAttendances.some((a) => a.id === attendanceId);
    if (already) {
      return { ok: false, reason: 'ALREADY_ATTENDED' };
    }

    const expectedCode = dummySessionCodes[sessionId];
    if (expectedCode && expectedCode !== code.trim()) {
      return { ok: false, reason: 'INVALID_CODE' };
    }

    const att: Attendance = {
      id: attendanceId,
      sessionId,
      userId: user.id,
      code: code.trim(),
      timestamp: new Date().toISOString(),
      labId,
      lokasi,
    };
    inMemoryAttendances = [...inMemoryAttendances, att];
    notifyFallbackAttendanceListeners();
    return { ok: true, attendance: att };
  }

  // Firebase Real dengan batas timeout 10 detik (SRS 4.3)
  const timeoutPromise = new Promise<AttendResult>((resolve) => {
    setTimeout(() => {
      resolve({ ok: false, reason: 'TIMEOUT' });
    }, 10000);
  });

  const attRef = doc(db, 'attendances', attendanceId);

  const executionPromise = (async (): Promise<AttendResult> => {
    try {
      await setDoc(attRef, {
        sessionId,
        userId: user.id,
        code: code.trim(),
        timestamp: serverTimestamp(),
        labId,
        lokasi: {
          lat: lokasi.lat,
          lng: lokasi.lng,
          akurasiM: lokasi.akurasiM,
          jarakM: lokasi.jarakM,
          mocked: lokasi.mocked,
        },
      });

      const att: Attendance = {
        id: attendanceId,
        sessionId,
        userId: user.id,
        code: code.trim(),
        timestamp: new Date().toISOString(),
        labId,
        lokasi,
      };
      return { ok: true, attendance: att };
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };

      if (errObj.code === 'permission-denied') {
        // setDoc ke dokumen presensi yang sudah ada dihitung sebagai update, dan rules menolak
        // update dengan permission-denied (bukan already-exists). Jadi presensi kedua dikenali
        // dengan membaca dokumen {sessionId}_{uid}. Bila dokumennya tidak ada, rules juga menolak
        // baca (resource kosong), sehingga error baca berarti belum presensi.
        try {
          const existingDoc = await getDoc(attRef);
          if (existingDoc.exists()) {
            return { ok: false, reason: 'ALREADY_ATTENDED' };
          }
        } catch {
          // Lanjut ke pemetaan berikutnya
        }

        // Cek apakah sesi baru saja ditutup
        try {
          const freshSessionDoc = await getDoc(doc(db, 'sessions', sessionId));
          if (freshSessionDoc.exists() && freshSessionDoc.data().status !== 'open') {
            return { ok: false, reason: 'SESSION_NOT_OPEN' };
          }
        } catch {
          // Abaikan error re-fetch
        }

        // Cek apakah izin sudah disetujui
        try {
          const izinDoc = await getDoc(doc(db, 'izin', attendanceId));
          if (izinDoc.exists() && izinDoc.data().status === 'approved') {
            return { ok: false, reason: 'IZIN_APPROVED' };
          }
        } catch {
          // Abaikan
        }

        // Cek lokasi apakah melanggar rules
        if (lokasi.mocked) {
          return { ok: false, reason: 'MOCKED_LOCATION' };
        }
        if (lokasi.akurasiM > MAX_ACCURACY_M) {
          return { ok: false, reason: 'LOW_ACCURACY' };
        }
        if (lab && lokasi.jarakM > lab.radiusM) {
          return { ok: false, reason: 'OUTSIDE_RADIUS' };
        }

        return { ok: false, reason: 'INVALID_CODE' };
      }

      return { ok: false, reason: 'UNKNOWN' };
    }
  })();

  return Promise.race([executionPromise, timeoutPromise]);
}
