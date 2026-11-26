/**
 * Seed & migrasi data Sprint 4 (milik PM). DEFAULT DRY-RUN: hanya membaca dan mencetak rencana.
 * Penulisan baru terjadi dengan flag --apply. Aman dijalankan ulang (idempoten): hanya mengisi yang
 * belum ada, tidak menimpa data yang sudah terisi.
 *
 * Jalankan dari folder server/:
 *   GOOGLE_APPLICATION_CREDENTIALS=<path JSON service account, DI LUAR repo> npx tsx scripts/seed-sprint4.ts
 *   ... --apply           (menulis)
 * Akun aslab (opsional di dry-run, wajib untuk --apply): env SEED_ASLAB_EMAIL, SEED_ASLAB_PASSWORD,
 * (opsional) SEED_ASLAB_NAME. Tidak ada kredensial tertanam di kode ini.
 *
 * Urutan di produksi: jalankan --apply SEBELUM men-deploy firestore.rules baru, karena rules baru
 * menganggap lab tanpa asprakEmails/mataKuliahId sebagai "bukan anggota"/"tidak bisa diubah".
 */
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_GRACE_MINUTES, normalizeEmail } from '../lib/contract';

const APPLY = process.argv.includes('--apply');
const FALLBACK_MK = { id: 'mk-ppk', kode: 'PPK', nama: 'Pengembangan Platform Khusus' };

type Mk = { id: string; kode: string; nama: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeKode(nama: string): string {
  const initials = nama
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return initials.slice(0, 6) || 'MK';
}

function log(msg = ''): void {
  console.log(msg);
}

async function main(): Promise<void> {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS belum diisi. Arahkan ke file JSON service account di luar repo.',
    );
  }
  if (getApps().length === 0) initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const auth = getAuth();

  log(APPLY ? '=== SEED SPRINT 4: --apply (MENULIS) ===' : '=== SEED SPRINT 4: DRY-RUN (tidak menulis apa pun) ===');

  // ---------- 1. Mata kuliah ----------
  const kelasSnap = await db.collection('kelasPraktikum').get();
  const namaSet = new Set<string>();
  kelasSnap.docs.forEach((d) => {
    const p = d.data().praktikum;
    if (typeof p === 'string' && p.trim()) namaSet.add(p.trim());
  });
  const mkList: Mk[] =
    namaSet.size > 0
      ? [...namaSet].sort().map((nama) => ({ id: `mk-${slugify(nama)}`, kode: makeKode(nama), nama }))
      : [FALLBACK_MK];
  const mkByNama = new Map(mkList.map((m) => [m.nama, m]));
  const defaultMk = mkList[0]!;

  log('\n[1] mataKuliah');
  const mkToWrite: Mk[] = [];
  for (const mk of mkList) {
    const exists = (await db.collection('mataKuliah').doc(mk.id).get()).exists;
    log(`  ${exists ? 'sudah ada ' : 'BUAT       '} mataKuliah/${mk.id}  (${mk.kode}) ${mk.nama}`);
    if (!exists) mkToWrite.push(mk);
  }

  // ---------- 2. Akun aslab ----------
  const aslabEmailRaw = process.env.SEED_ASLAB_EMAIL;
  const aslabPassword = process.env.SEED_ASLAB_PASSWORD;
  const aslabName = process.env.SEED_ASLAB_NAME?.trim() || 'Aslab';
  log('\n[2] akun aslab');
  let aslabPlan: { email: string; uid?: string; createAuth: boolean; mataKuliahIds: string[] } | null = null;
  if (!aslabEmailRaw || !aslabPassword) {
    log('  DILEWATI: SEED_ASLAB_EMAIL / SEED_ASLAB_PASSWORD belum diisi.');
    if (APPLY) throw new Error('--apply memerlukan SEED_ASLAB_EMAIL dan SEED_ASLAB_PASSWORD.');
  } else {
    const email = normalizeEmail(aslabEmailRaw);
    let uid: string | undefined;
    try {
      uid = (await auth.getUserByEmail(email)).uid;
    } catch (e) {
      if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
    }
    const mataKuliahIds = mkList.map((m) => m.id);
    if (uid) {
      const profile = await db.collection('users').doc(uid).get();
      const role = profile.data()?.role;
      if (profile.exists && role !== 'aslab') {
        throw new Error(`Akun ${email} sudah ada dengan role '${String(role)}'; seed menolak mengubah role.`);
      }
      const current: string[] = profile.data()?.mataKuliahIds ?? [];
      const merged = [...new Set([...current, ...mataKuliahIds])];
      log(`  Auth sudah ada (${uid}); profil ${profile.exists ? 'diperbarui mataKuliahIds' : 'DIBUAT'} -> [${merged.join(', ')}]`);
      aslabPlan = { email, uid, createAuth: false, mataKuliahIds: merged };
    } else {
      log(`  BUAT akun Auth ${email} + users/{uid} role 'aslab' mataKuliahIds [${mataKuliahIds.join(', ')}]`);
      aslabPlan = { email, createAuth: true, mataKuliahIds };
    }
    log('  (semua mata kuliah di atas diberikan ke aslab ini; ubah manual di console bila perlu)');
  }

  // ---------- 3. Migrasi lab lama ----------
  const usersSnap = await db.collection('users').get();
  const asprakEmails = usersSnap.docs
    .filter((d) => d.data().role === 'asisten' && typeof d.data().email === 'string')
    .map((d) => normalizeEmail(d.data().email as string));
  const praktikanByKelas = new Map<string, string[]>();
  usersSnap.docs.forEach((d) => {
    const u = d.data();
    if (u.role !== 'praktikan' || typeof u.email !== 'string' || typeof u.kelas !== 'string') return;
    const list = praktikanByKelas.get(u.kelas) ?? [];
    list.push(normalizeEmail(u.email));
    praktikanByKelas.set(u.kelas, list);
  });

  log(`\n[3] migrasi lab (Asprak ditemukan: ${asprakEmails.length})`);
  const labsSnap = await db.collection('labs').get();
  const labUpdates: { id: string; patch: Record<string, unknown> }[] = [];
  for (const labDoc of labsSnap.docs) {
    const lab = labDoc.data();
    const sesSnap = await db.collection('sessions').where('labId', '==', labDoc.id).get();
    const praktikumSet = new Set<string>();
    const kelasSet = new Set<string>();
    sesSnap.docs.forEach((s) => {
      const d = s.data();
      if (typeof d.praktikum === 'string') praktikumSet.add(d.praktikum.trim());
      if (typeof d.kelas === 'string') kelasSet.add(d.kelas);
    });

    const patch: Record<string, unknown> = {};
    const notes: string[] = [];

    if (typeof lab.mataKuliahId !== 'string') {
      const matches = [...praktikumSet].map((p) => mkByNama.get(p)).filter((m): m is Mk => !!m);
      const unique = [...new Set(matches.map((m) => m.id))];
      if (unique.length === 1) {
        patch.mataKuliahId = unique[0];
      } else {
        patch.mataKuliahId = defaultMk.id;
        notes.push(
          unique.length === 0
            ? `PERIKSA: tidak ada sesi/praktikum yang cocok, dipakai bawaan ${defaultMk.id}`
            : `PERIKSA: sesi memakai ${unique.length} mata kuliah (${unique.join(', ')}), dipakai bawaan ${defaultMk.id}`,
        );
      }
    }
    if (typeof lab.graceMinutes !== 'number') patch.graceMinutes = DEFAULT_GRACE_MINUTES;
    if (!Array.isArray(lab.asprakEmails)) patch.asprakEmails = asprakEmails;
    if (!Array.isArray(lab.praktikanEmails)) {
      const emails = new Set<string>();
      kelasSet.forEach((k) => (praktikanByKelas.get(k) ?? []).forEach((e) => emails.add(e)));
      patch.praktikanEmails = [...emails].sort();
      if (kelasSet.size === 0) notes.push('PERIKSA: lab belum dipakai sesi, praktikanEmails kosong');
    }

    const changed = Object.keys(patch);
    log(
      `  lab ${labDoc.id} "${String(lab.nama)}": ` +
        (changed.length === 0
          ? 'sudah lengkap, dilewati'
          : `isi [${changed.join(', ')}] mk=${String(patch.mataKuliahId ?? lab.mataKuliahId)} ` +
            `kelas-sesi=[${[...kelasSet].join(',')}] praktikan=${(patch.praktikanEmails as string[] | undefined)?.length ?? '-'} ` +
            `asprak=${(patch.asprakEmails as string[] | undefined)?.length ?? '-'}`),
    );
    notes.forEach((n) => log(`      ${n}`));
    if (changed.length > 0) labUpdates.push({ id: labDoc.id, patch });
  }

  // ---------- Terapkan ----------
  if (!APPLY) {
    log(
      `\nDRY-RUN selesai: ${mkToWrite.length} mataKuliah baru, ` +
        `${aslabPlan ? '1 akun aslab' : '0 akun aslab'}, ${labUpdates.length} lab diperbarui. ` +
        'Tambahkan --apply untuk menulis.',
    );
    return;
  }

  for (const mk of mkToWrite) {
    await db.collection('mataKuliah').doc(mk.id).set({ kode: mk.kode, nama: mk.nama });
  }
  if (aslabPlan) {
    let uid = aslabPlan.uid;
    if (aslabPlan.createAuth) {
      uid = (
        await auth.createUser({
          email: aslabPlan.email,
          password: aslabPassword!,
          displayName: aslabName,
          emailVerified: false,
        })
      ).uid;
    }
    await db
      .collection('users')
      .doc(uid!)
      .set(
        {
          name: aslabName,
          email: aslabPlan.email,
          role: 'aslab',
          mataKuliahIds: aslabPlan.mataKuliahIds,
          ...(aslabPlan.createAuth ? { createdAt: FieldValue.serverTimestamp() } : {}),
        },
        { merge: true },
      );
  }
  for (const { id, patch } of labUpdates) {
    await db.collection('labs').doc(id).update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
  }
  log('\n--apply selesai.');
}

main().catch((err: unknown) => {
  console.error('Seed gagal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
