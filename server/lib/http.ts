import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ApiError, ApiErrorCode } from './contract';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UPSTREAM_ERROR: 502,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};

/** Error yang langsung dipetakan ke respons ApiError. */
export class ApiHttpError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
  toBody(): ApiError {
    return { code: this.code, message: this.message };
  }
}

export function sendError(res: VercelResponse, code: ApiErrorCode, message: string): void {
  res.status(STATUS_BY_CODE[code]).json({ code, message } satisfies ApiError);
}

/** Membalas error tak terduga tanpa membocorkan detail internal. */
export function sendCaught(res: VercelResponse, err: unknown): void {
  if (err instanceof ApiHttpError) {
    res.status(err.status).json(err.toBody());
    return;
  }
  console.error('[api] error tak terduga', err);
  sendError(res, 'INTERNAL', 'Terjadi kesalahan pada server.');
}

/** Mengembalikan true bila method cocok; bila tidak, sudah membalas 405 (+ header Allow). */
export function allowMethod(req: VercelRequest, res: VercelResponse, method: 'GET' | 'POST'): boolean {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  sendError(res, 'METHOD_NOT_ALLOWED', `Gunakan method ${method}.`);
  return false;
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}
