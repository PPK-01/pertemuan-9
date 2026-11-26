import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { HealthResponse } from '../lib/contract';
import { allowMethod } from '../lib/http';

/** GET /api/health: cek deploy. Tanpa auth, tanpa menyentuh Firebase/Midtrans. */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (!allowMethod(req, res, 'GET')) return;
  res.status(200).json({ ok: true } satisfies HealthResponse);
}
