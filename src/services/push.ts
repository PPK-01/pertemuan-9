import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { normalizeEmail } from '@/constants/denda';
import type { Izin, Lab, NotifPayload, Session, User } from '@/types';
import { formatDate, formatTime } from '@/utils/time';
import { extractBarkKeyFromToken, isBarkDeviceToken, sendBarkNotification } from './bark';
import { devWarn } from './devLog';
import { db, isFirebaseReady } from './firebase';
import { getDeviceTokensForUser } from './notifications';

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: NotifPayload;
  sound?: 'default' | null;
  channelId?: string;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_BATCH_SIZE = 100;
const QUERY_TIMEOUT_MS = 10000;

/** Menolak dengan Error('TIMEOUT') bila `promise` belum selesai dalam `ms`; timer selalu dibersihkan. */
function withTimeout<T>(promise: Promise<T>, ms: number = QUERY_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Format jadwal sesi praktikum untuk isi notifikasi ({hari, tanggal, jam}).
 * Contoh: "Senin, 23 Nov, 08.00"
 */
export function formatSessionSchedule(startAt: string): string {
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return startAt;
  const dayAndDate = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(d);
  const timeStr = formatTime(startAt);
  return `${dayAndDate}, ${timeStr}`;
}

/**
 * Mengirim pesan push notification ke Expo Push API dalam batch maksimal 100 pesan
 * serta meneruskan token Bark (`bark:<key>`) melalui Bark APNs Relay untuk iOS LiveContainer.
 * Mengembalikan daftar token yang ditolak oleh layanan push.
 */
export async function sendPush(messages: PushMessage[]): Promise<string[]> {
  if (!messages || messages.length === 0) {
    return [];
  }

  const barkMessages = messages.filter((m) => isBarkDeviceToken(m.to));
  const expoMessages = messages.filter((m) => !isBarkDeviceToken(m.to));

  // Paralel: Bark yang lambat atau gagal tidak boleh menunda notifikasi Expo (Android).
  const results = await Promise.allSettled([
    sendExpoMessages(expoMessages),
    sendBarkMessages(barkMessages),
  ]);

  const rejectedTokens: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      rejectedTokens.push(...r.value);
    } else {
      devWarn('push-sendPushGroup', r.reason);
    }
  }
  return rejectedTokens;
}

async function sendBarkMessages(barkMessages: PushMessage[]): Promise<string[]> {
  if (barkMessages.length === 0) return [];
  const barkResults = await Promise.all(
    barkMessages.map(async (msg) => {
      const barkKey = extractBarkKeyFromToken(msg.to);
      if (!barkKey) return { token: msg.to, invalidDevice: true };
      const res = await sendBarkNotification(barkKey, msg.title, msg.body);
      return { token: msg.to, invalidDevice: res.invalidDevice };
    }),
  );
  return barkResults.filter((r) => r.invalidDevice).map((r) => r.token);
}

async function sendExpoMessages(expoMessages: PushMessage[]): Promise<string[]> {
  const rejectedTokens: string[] = [];

  for (let i = 0; i < expoMessages.length; i += MAX_BATCH_SIZE) {
    const chunk = expoMessages.slice(i, i + MAX_BATCH_SIZE);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
        signal: controller.signal,
      });

      if (!response.ok) {
        devWarn('push-sendPushHttpError', `${response.status} ${response.statusText}`);
        continue;
      }

      const resData = (await response.json()) as {
        data?: {
          status?: 'ok' | 'error';
          message?: string;
          details?: { error?: string };
        }[];
      };

      if (Array.isArray(resData?.data)) {
        resData.data.forEach((ticket, idx) => {
          if (ticket.status === 'error') {
            const token = chunk[idx]?.to;
            if (token && ticket.details?.error === 'DeviceNotRegistered') {
              rejectedTokens.push(token);
              devWarn('push-ticketError', `${token}: DeviceNotRegistered`);
            } else if (token) {
              devWarn('push-ticketError', `${token}: ${ticket.message || ticket.details?.error}`);
            }
          }
        });
      }
    } catch (err) {
      devWarn('push-sendPushNetworkError', err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return rejectedTokens;
}

/**
 * Mengirim notifikasi push ke daftar pengguna berdasarkan UID mereka.
 */
export async function sendNotificationToUsers(
  uids: string[],
  title: string,
  body: string,
  data: NotifPayload,
): Promise<string[]> {
  if (!uids || uids.length === 0) {
    return [];
  }

  try {
    const tokenPromises = uids.map((uid) => getDeviceTokensForUser(uid));
    const tokenLists = await Promise.all(tokenPromises);
    const allTokens = Array.from(new Set(tokenLists.flat()));

    if (allTokens.length === 0) {
      return [];
    }

    const messages: PushMessage[] = allTokens.map((to) => ({
      to,
      title,
      body,
      data,
      sound: 'default',
      channelId: 'default',
    }));

    return await sendPush(messages);
  } catch (err) {
    devWarn('push-sendNotificationToUsers', err);
    return [];
  }
}

async function resolvePraktikanUidsForLab(
  session: Session,
  users: User[],
  labs: Lab[],
): Promise<string[]> {
  if (!session.labId) return [];

  let lab = labs.find((l) => l.id === session.labId) ?? null;
  if (!lab && isFirebaseReady && db) {
    try {
      const labSnap = await withTimeout(getDoc(doc(db, 'labs', session.labId)));
      if (labSnap.exists()) {
        const data = labSnap.data();
        lab = {
          id: labSnap.id,
          nama: data.nama,
          lat: data.lat,
          lng: data.lng,
          radiusM: data.radiusM,
          createdBy: data.createdBy,
          createdAt: '',
          updatedBy: data.updatedBy,
          updatedAt: '',
          praktikanEmails: Array.isArray(data.praktikanEmails)
            ? data.praktikanEmails.filter((e): e is string => typeof e === 'string').map(normalizeEmail)
            : [],
        };
      }
    } catch (err) {
      devWarn('push-resolveLab', err);
    }
  }

  const memberEmails = new Set(
    (lab?.praktikanEmails ?? []).map(normalizeEmail).filter(Boolean),
  );
  if (memberEmails.size === 0) return [];

  let sourceUsers = users;
  if (sourceUsers.length === 0 && isFirebaseReady && db) {
    try {
      const snap = await withTimeout(
        getDocs(query(collection(db, 'users'), where('role', '==', 'praktikan'))),
      );
      sourceUsers = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          email: data.email,
          role: data.role,
          kelas: data.kelas,
        } as User;
      });
    } catch (err) {
      devWarn('push-resolvePraktikanUids', err);
    }
  }

  return sourceUsers
    .filter(
      (u) =>
        u.role === 'praktikan' &&
        memberEmails.has(normalizeEmail(u.email ?? '')),
    )
    .map((u) => u.id);
}

/**
 * Notifikasi N1: Status sesi dijadwalkan dibuka (scheduled → open).
 * Penerima: praktikan anggota lab sesi tersebut.
 */
export async function notifySessionOpened(
  session: Session,
  users: User[],
  labs: Lab[],
): Promise<void> {
  const praktikanUids = await resolvePraktikanUidsForLab(session, users, labs);
  if (praktikanUids.length === 0) return;

  const lab = session.labId ? labs.find((l) => l.id === session.labId) : null;
  const labName = lab?.nama || session.ruang || 'Lab';

  const title = 'Sesi dibuka';
  const body = `${session.praktikum} dibuka. Presensi sekarang di ${labName}.`;
  const payload: NotifPayload = { type: 'session_opened', sessionId: session.id };

  await sendNotificationToUsers(praktikanUids, title, body, payload);
}

/**
 * Notifikasi N2: Sesi baru dibuat.
 * Penerima: praktikan anggota lab sesi tersebut.
 */
export async function notifySessionCreated(
  session: Session,
  users: User[],
  labs: Lab[],
): Promise<void> {
  const praktikanUids = await resolvePraktikanUidsForLab(session, users, labs);
  if (praktikanUids.length === 0) return;

  const lab = session.labId ? labs.find((l) => l.id === session.labId) : null;
  const labName = lab?.nama || session.ruang || 'Lab';
  const scheduleStr = formatSessionSchedule(session.startAt);

  const title = 'Jadwal baru';
  const body = `${session.praktikum}: ${scheduleStr} di ${labName}.`;
  const payload: NotifPayload = { type: 'session_created', sessionId: session.id };

  await sendNotificationToUsers(praktikanUids, title, body, payload);
}

/**
 * Notifikasi N6: Perubahan jadwal sesi (waktu mulai atau selesai). Tidak dikirim bila lab ikut berubah (N4).
 * Penerima: praktikan anggota lab sesi tersebut.
 */
export async function notifySessionUpdated(
  session: Session,
  users: User[],
  labs: Lab[],
): Promise<void> {
  const praktikanUids = await resolvePraktikanUidsForLab(session, users, labs);
  if (praktikanUids.length === 0) return;

  const lab = session.labId ? labs.find((l) => l.id === session.labId) : null;
  const labName = lab?.nama || session.ruang || 'Lab';
  const scheduleStr = formatSessionSchedule(session.startAt);

  const title = 'Jadwal berubah';
  const body = `${session.praktikum}: ${scheduleStr} di ${labName}.`;
  const payload: NotifPayload = { type: 'session_created', sessionId: session.id };

  await sendNotificationToUsers(praktikanUids, title, body, payload);
}

/**
 * Notifikasi N3: Status izin diputuskan (approved / rejected).
 * Penerima: praktikan pengaju izin.
 */
export async function notifyIzinDecided(
  izin: Izin,
  session: Session | undefined,
  keputusan: 'approved' | 'rejected',
): Promise<void> {
  const praktikanUid = izin.userId;
  if (!praktikanUid) return;

  const praktikumName = session?.praktikum || 'Praktikum';
  const tanggalStr = session?.startAt ? formatDate(session.startAt) : formatDate(izin.createdAt);
  const keputusanText = keputusan === 'approved' ? 'disetujui' : 'ditolak';

  const title = `Izin ${keputusanText}`;
  const body = `untuk ${praktikumName} ${tanggalStr}.`;
  const payload: NotifPayload = { type: 'izin_decided', izinId: izin.id };

  await sendNotificationToUsers([praktikanUid], title, body, payload);
}

/**
 * Notifikasi N4: Lokasi sesi praktikum berubah (labId sesi berubah atau koordinat/nama lab berubah).
 * Penerima: praktikan anggota lab sesi tersebut.
 */
export async function notifyLocationChanged(
  session: Session,
  users: User[],
  labName: string,
  labs: Lab[] = [],
): Promise<void> {
  const praktikanUids = await resolvePraktikanUidsForLab(session, users, labs);
  if (praktikanUids.length === 0) return;

  const title = 'Lokasi praktikum berubah';
  const body = `${session.praktikum} kini di ${labName}.`;
  const payload: NotifPayload = { type: 'location_changed', sessionId: session.id };

  await sendNotificationToUsers(praktikanUids, title, body, payload);
}
