import { getDb } from './firebaseAdmin';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_BATCH_SIZE = 100;
const PUSH_TIMEOUT_MS = 5000;

export type ServerNotifPayload =
  | { type: 'bill_created'; billId: string }
  | { type: 'payment_success'; billId: string }
  | { type: 'payment_failed'; billId: string };

export type UserNotificationInput = {
  uid: string;
  title: string;
  body: string;
  data: ServerNotifPayload;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: ServerNotifPayload;
  sound: 'default';
  channelId: 'default';
};

type DeviceTokenRecord = {
  uid: string;
  docId: string;
  token: string;
};

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID').format(amount);
}

function isExpoPushToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

/**
 * Mengirim notifikasi push dari server lewat Expo Push API (maks 100 pesan per request)
 * ke token perangkat di users/{uid}/devices. Gagal kirim tidak menggagalkan operasi utama.
 */
export async function sendUserNotifications(items: UserNotificationInput[]): Promise<void> {
  if (items.length === 0) return;

  try {
    const db = getDb();
    const uniqueUids = [...new Set(items.map((item) => item.uid).filter(Boolean))];
    const deviceSnaps = await Promise.all(
      uniqueUids.map((uid) => db.collection('users').doc(uid).collection('devices').get()),
    );

    const tokensByUid = new Map<string, DeviceTokenRecord[]>();
    uniqueUids.forEach((uid, index) => {
      const snap = deviceSnaps[index];
      if (!snap) return;
      const records: DeviceTokenRecord[] = [];
      for (const docSnap of snap.docs) {
        const token = docSnap.data().token;
        if (typeof token === 'string' && isExpoPushToken(token)) {
          records.push({ uid, docId: docSnap.id, token });
        }
      }
      tokensByUid.set(uid, records);
    });

    const messages: { msg: ExpoPushMessage; record: DeviceTokenRecord }[] = [];
    const seenKeys = new Set<string>();

    for (const item of items) {
      const records = tokensByUid.get(item.uid) ?? [];
      for (const record of records) {
        const dedupeKey = `${record.token}:${item.data.type}:${item.data.billId}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);
        messages.push({
          msg: {
            to: record.token,
            title: item.title,
            body: item.body,
            data: item.data,
            sound: 'default',
            channelId: 'default',
          },
          record,
        });
      }
    }

    if (messages.length === 0) return;

    const invalidRecords: DeviceTokenRecord[] = [];

    for (let i = 0; i < messages.length; i += MAX_BATCH_SIZE) {
      const chunk = messages.slice(i, i + MAX_BATCH_SIZE);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);

      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify(chunk.map((entry) => entry.msg)),
          signal: controller.signal,
        });

        if (!response.ok) continue;

        const body = (await response.json()) as {
          data?: { status?: string; details?: { error?: string } }[];
        };
        if (Array.isArray(body.data)) {
          body.data.forEach((ticket, idx) => {
            if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
              const rec = chunk[idx]?.record;
              if (rec) invalidRecords.push(rec);
            }
          });
        }
      } catch {
        // Kegagalan push tidak boleh menggagalkan aksi bisnis.
      } finally {
        clearTimeout(timeout);
      }
    }

    if (invalidRecords.length > 0) {
      await Promise.allSettled(
        invalidRecords.map((rec) =>
          db.collection('users').doc(rec.uid).collection('devices').doc(rec.docId).delete(),
        ),
      );
    }
  } catch {
    // Abaikan error push agar pembuatan tagihan/webhook tetap sukses.
  }
}
