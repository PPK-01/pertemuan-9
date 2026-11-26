import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Init Admin SDK sekali per instance function. Kredensial dari env FIREBASE_SERVICE_ACCOUNT_BASE64
 * (isi file JSON service account yang di-base64; lihat server/README.md). Dipanggil malas supaya
 * /api/health tetap jalan walau env belum diisi.
 */
function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 belum diisi.');
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 bukan base64 dari JSON yang valid.');
  }
  return initializeApp({ credential: cert(credentials as Parameters<typeof cert>[0]) });
}

export function getDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
