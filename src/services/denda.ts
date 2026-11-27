import { env } from '@/config/env';
import type { ErrorCode, Result } from '@/types';
import type {
  ApiError,
  ApiErrorCode,
  GenerateFinesRequest,
  GenerateFinesResponse,
} from '@/types/api';
import { connectionService } from './connection';
import { auth, isFirebaseReady } from './firebase';

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
