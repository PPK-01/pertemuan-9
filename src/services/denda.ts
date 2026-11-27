import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';

import { env } from '@/config/env';
import type { Bill, BillStatus, ErrorCode, MataKuliah, Result, User } from '@/types';
import type {
  ApiError,
  ApiErrorCode,
  GenerateFinesRequest,
  GenerateFinesResponse,
} from '@/types/api';
import { connectionService } from './connection';
import { devWarn } from './devLog';
import { auth, db, isFirebaseReady } from './firebase';

const API_TIMEOUT_MS = 10000;

function mapApiErrorCode(code: ApiErrorCode | undefined): ErrorCode {
  switch (code) {
    case 'UNAUTHENTICATED':
    case 'FORBIDDEN':
      return 'PERMISSION_DENIED';
    case 'INVALID_INPUT':
      return 'INVALID_INPUT';
    case 'NOT_FOUND':
      return 'NOT_FOUND';
    case 'CONFLICT':
      return 'CONFLICT';
    default:
      return 'UNKNOWN';
  }
}

function toIsoString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return fallback;
}

const VALID_BILL_STATUSES: readonly BillStatus[] = ['unpaid', 'pending', 'success', 'failed'];

function toBillStatus(value: unknown): BillStatus {
  return typeof value === 'string' && VALID_BILL_STATUSES.includes(value as BillStatus)
    ? (value as BillStatus)
    : 'unpaid';
}

function toBill(id: string, data: DocumentData): Bill {
  const paidAt = toIsoString(data.paidAt);
  return {
    id,
    userId: typeof data.userId === 'string' ? data.userId : '',
    userEmail: typeof data.userEmail === 'string' ? data.userEmail : '',
    sessionId: typeof data.sessionId === 'string' ? data.sessionId : '',
    labId: typeof data.labId === 'string' ? data.labId : '',
    mataKuliahId: typeof data.mataKuliahId === 'string' ? data.mataKuliahId : '',
    attendanceId: typeof data.attendanceId === 'string' ? data.attendanceId : '',
    amount: typeof data.amount === 'number' ? data.amount : 0,
    lateMinutes: typeof data.lateMinutes === 'number' ? data.lateMinutes : 0,
    status: toBillStatus(data.status),
    createdAt: toIsoString(data.createdAt, new Date().toISOString()),
    updatedAt: toIsoString(data.updatedAt, new Date().toISOString()),
    ...(paidAt ? { paidAt } : {}),
    ...(typeof data.lastOrderId === 'string' && data.lastOrderId
      ? { lastOrderId: data.lastOrderId }
      : {}),
  };
}

/**
 * Mengirim permintaan POST terautentikasi Firebase ID token ke backend Vercel dengan
 * pra-cek offline dan batas waktu 10 detik.
 */
export async function postAuthedApi<TRes>(path: string, body: unknown): Promise<Result<TRes>> {
  if (!connectionService.isConnected) {
    return {
      ok: false,
      code: 'NO_CONNECTION',
      message: 'Tidak ada koneksi internet.',
    };
  }

  if (!env.apiBaseUrl) {
    return {
      ok: false,
      code: 'UNKNOWN',
      message: 'Alamat server backend belum dikonfigurasi.',
    };
  }

  const fbUser = auth?.currentUser;
  if (!isFirebaseReady || !fbUser) {
    return {
      ok: false,
      code: 'PERMISSION_DENIED',
      message: 'Sesi login tidak valid. Silakan masuk ulang.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const idToken = await fbUser.getIdToken();
    const response = await fetch(`${env.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as
      | TRes
      | Partial<ApiError>
      | null;

    if (!response.ok) {
      const apiErr = payload as Partial<ApiError> | null;
      return {
        ok: false,
        code: mapApiErrorCode(apiErr?.code),
        message: apiErr?.message || 'Permintaan ke server gagal. Coba lagi.',
      };
    }

    return { ok: true, data: payload as TRes };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        code: 'TIMEOUT',
        message: 'Permintaan ke server terlalu lama. Coba lagi.',
      };
    }
    return {
      ok: false,
      code: 'NO_CONNECTION',
      message: 'Gagal menghubungi server. Periksa koneksi lalu coba lagi.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Memanggil endpoint pembuatan tagihan denda keterlambatan setelah sesi ditutup (FR-72, FR-73). */
export function generateFines(sessionId: string): Promise<Result<GenerateFinesResponse>> {
  const payload: GenerateFinesRequest = { sessionId };
  return postAuthedApi<GenerateFinesResponse>('/api/fines/generate', payload);
}

/** Mendengarkan perubahan daftar tagihan milik praktikan secara realtime (FR-74). */
export function listenBillsForPraktikan(
  user: User,
  onData: (bills: Bill[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!isFirebaseReady || !db) {
    onData([]);
    return () => undefined;
  }

  const q = query(collection(db, 'bills'), where('userId', '==', user.id));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => toBill(docSnap.id, docSnap.data()));
      onData(list);
    },
    (error) => {
      devWarn('bills', error);
      if (onError) onError(error);
    },
  );
}

/** Mengambil daftar mata kuliah untuk melengkapi label praktikum pada tagihan. */
export async function fetchMataKuliahMap(): Promise<Record<string, MataKuliah>> {
  if (!isFirebaseReady || !db) return {};
  try {
    const snap = await getDocs(collection(db, 'mataKuliah'));
    const map: Record<string, MataKuliah> = {};
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (typeof data.nama === 'string') {
        map[docSnap.id] = {
          id: docSnap.id,
          kode: typeof data.kode === 'string' ? data.kode : docSnap.id,
          nama: data.nama,
        };
      }
    }
    return map;
  } catch (err) {
    devWarn('mataKuliah', err);
    return {};
  }
}
