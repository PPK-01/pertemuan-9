import type { VercelRequest } from '@vercel/node';
import { getAdminAuth, getDb } from './firebaseAdmin';
import { normalizeEmail, type Role } from './contract';
import { ApiHttpError } from './http';

export type AuthedUser = { uid: string; email: string; role: Role };

const ROLES: readonly Role[] = ['praktikan', 'asisten', 'aslab'];

/**
 * Memverifikasi header `Authorization: Bearer <Firebase ID token>` dan membaca role dari users/{uid}.
 * Melempar ApiHttpError: 401 (token hilang/tidak valid) atau 403 (akun tidak punya profil/role valid).
 * Email dinormalisasi (trim + huruf kecil) agar cocok dengan praktikanEmails/asprakEmails.
 */
export async function requireUser(req: VercelRequest): Promise<AuthedUser> {
  const header = req.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header) : null;
  const token = match?.[1]?.trim();
  if (!token) {
    throw new ApiHttpError('UNAUTHENTICATED', 'Token tidak ditemukan. Sertakan header Authorization: Bearer <token>.');
  }

  let uid: string;
  let tokenEmail: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
    tokenEmail = decoded.email;
  } catch {
    throw new ApiHttpError('UNAUTHENTICATED', 'Token tidak valid atau kedaluwarsa.');
  }

  const snap = await getDb().collection('users').doc(uid).get();
  const data = snap.data();
  const role = data?.role as Role | undefined;
  if (!snap.exists || !role || !ROLES.includes(role)) {
    throw new ApiHttpError('FORBIDDEN', 'Akun belum memiliki profil Rawuh.');
  }

  const email = normalizeEmail(tokenEmail ?? (typeof data?.email === 'string' ? data.email : ''));
  if (!email) {
    throw new ApiHttpError('FORBIDDEN', 'Akun tidak memiliki email.');
  }
  return { uid, email, role };
}
