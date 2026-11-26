// Uji firestore.rules Sprint 4 di emulator Firestore (tanpa login/deploy).
// Jalankan dari folder ini:  npm install  &&  npm test
// Java 17 cukup dengan firebase-tools 14 (versi 15 butuh JDK 21). Port emulator: 8189.
// Berkas ini hanya skrip uji; tidak ikut bundle aplikasi (scripts/* di-ignore ESLint).
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, Timestamp } = require('firebase/firestore');

const RULES = path.resolve(process.argv[2]);
let env;
const results = [];
async function t(name, fn, expectOk) {
  try {
    if (expectOk) await assertSucceeds(fn()); else await assertFails(fn());
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name + ' :: ' + String(e.message).split('\n')[0].slice(0, 160)]);
  }
}

const lab = (over) => ({
  nama: 'Lab Satu', gedung: 'A', lat: -7.7, lng: 110.3, radiusM: 50,
  mataKuliahId: 'mk1', praktikanEmails: ['p1@x.id', 'p4@x.id'], asprakEmails: ['asp@x.id'], graceMinutes: 15,
  createdBy: 'al1', createdAt: 'x', updatedBy: 'al1', updatedAt: 'x', ...over,
});

(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rawuh',
    firestore: { rules: fs.readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8189 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config/asisten'), { inviteCode: 'KODE' });
    await setDoc(doc(db, 'users/a1'), { name: 'Asp', email: 'asp@x.id', role: 'asisten' });
    await setDoc(doc(db, 'users/a2'), { name: 'Asp2', email: 'asp2@x.id', role: 'asisten' });
    await setDoc(doc(db, 'users/p1'), { name: 'P Satu', email: 'p1@x.id', role: 'praktikan' });
    await setDoc(doc(db, 'users/p2'), { name: 'P Dua', email: 'p2@x.id', role: 'praktikan', kelas: 'A' });
    await setDoc(doc(db, 'users/p4'), { name: 'P Empat', email: 'p4@x.id', role: 'praktikan' });
    await setDoc(doc(db, 'users/p3'), { name: 'P Tiga', email: 'p3@x.id', role: 'praktikan' });
    await setDoc(doc(db, 'users/al1'), { name: 'Aslab', email: 'al@x.id', role: 'aslab', mataKuliahIds: ['mk1'] });
    await setDoc(doc(db, 'labs/lab1'), lab({}));
    await setDoc(doc(db, 'labs/lab2'), lab({ nama: 'Lab Dua', praktikanEmails: ['p3@x.id', 'p4@x.id'], asprakEmails: ['asp2@x.id'] }));
    await setDoc(doc(db, 'labs/labOld'), { nama: 'Lab Lama', lat: -7, lng: 110, radiusM: 50, createdBy: 'a1', createdAt: 'x', updatedBy: 'a1', updatedAt: 'x' });
    const ses = (over) => ({ praktikum: 'PPK', kelas: 'Z', topik: 't', ruang: '', labId: 'lab1', startAt: '2026-11-26T01:00:00Z', endAt: '2026-11-26T03:00:00Z', status: 'open', createdBy: 'a1', ...over });
    await setDoc(doc(db, 'sessions/s1'), ses({}));
    await setDoc(doc(db, 'sessions/s1/private/code'), { code: '1234' });
    await setDoc(doc(db, 'sessions/s5'), ses({ status: 'scheduled' }));
    await setDoc(doc(db, 'sessions/s2'), ses({ labId: 'lab2' }));
    await setDoc(doc(db, 'sessions/s3'), ses({ kelas: 'A', labId: 'lab2' }));
    await setDoc(doc(db, 'sessions/sLegacy'), { praktikum: 'PPK', kelas: 'A', topik: 't', ruang: 'R1', startAt: 'x', endAt: 'y', status: 'scheduled', createdBy: 'a1' });
    await setDoc(doc(db, 'bills/s1_p1'), { userId: 'p1', labId: 'lab1', mataKuliahId: 'mk1', status: 'unpaid', amount: 5000 });
    await setDoc(doc(db, 'payments/s1_p1-1'), { userId: 'p1', billId: 's1_p1', status: 'pending' });
  });

  const as = (uid, email) => env.authenticatedContext(uid, { email }).firestore();
  const p1 = as('p1', 'P1@X.id'); // huruf campuran: harus tetap cocok
  const p2 = as('p2', 'p2@x.id');
  const p3 = as('p3', 'p3@x.id');
  const a1 = as('a1', 'asp@x.id');
  const al1 = as('al1', 'al@x.id');

  // --- sessions read (get)
  await t('praktikan anggota lab1 get s1', () => getDoc(doc(p1, 'sessions/s1')), true);
  await t('praktikan non-anggota get s1 ditolak', () => getDoc(doc(p3, 'sessions/s1')), false);
  // --- sessions list
  await t('LIST p1 where labId==lab1', () => getDocs(query(collection(p1, 'sessions'), where('labId', '==', 'lab1'))), true);
  await t('LIST p1 where labId==lab2 (bukan anggota) ditolak', () => getDocs(query(collection(p1, 'sessions'), where('labId', '==', 'lab2'))), false);
  await t('LIST p1 where labId in [lab1]', () => getDocs(query(collection(p1, 'sessions'), where('labId', 'in', ['lab1']))), true);
  await t('LIST p1 where labId in [lab1,lab2] (bukan anggota lab2) ditolak', () => getDocs(query(collection(p1, 'sessions'), where('labId', 'in', ['lab1', 'lab2']))), false);
  await t('LIST p4 anggota dua lab where labId in [lab1,lab2]', () => getDocs(query(collection(as('p4', 'p4@x.id'), 'sessions'), where('labId', 'in', ['lab1', 'lab2']))), true);
  await t('LIST p2 where kelas==A (jalur lama)', () => getDocs(query(collection(p2, 'sessions'), where('kelas', '==', 'A'))), true);
  await t('LIST p1 (tanpa kelas) where kelas==A ditolak', () => getDocs(query(collection(p1, 'sessions'), where('kelas', '==', 'A'))), false);
  await t('LIST p1 tanpa filter ditolak', () => getDocs(collection(p1, 'sessions')), false);
  await t('LIST asisten tanpa filter', () => getDocs(collection(a1, 'sessions')), true);
  await t('LIST aslab tanpa filter', () => getDocs(collection(al1, 'sessions')), true);

  // --- sessions write
  const newSes = (labId) => ({ praktikum: 'PPK', kelas: 'Z', topik: 't', labId, startAt: '2026-11-27T01:00:00Z', endAt: '2026-11-27T03:00:00Z', status: 'scheduled', createdBy: 'a1' });
  await t('asisten create sesi di lab miliknya', () => setDoc(doc(a1, 'sessions/n1'), newSes('lab1')), true);
  await t('asisten create sesi di lab lain ditolak', () => setDoc(doc(a1, 'sessions/n2'), newSes('lab2')), false);
  await t('asisten update sesi legacy tanpa labId', () => updateDoc(doc(a1, 'sessions/sLegacy'), { topik: 'baru' }), true);
  await t('asisten pindahkan sesi ke lab lain ditolak', () => updateDoc(doc(a1, 'sessions/n1'), { labId: 'lab2' }), false);
  await t('asisten lain (lab2) update sesi lab1 ditolak', () => updateDoc(doc(as('a2', 'asp2@x.id'), 'sessions/n1'), { topik: 'x' }), false);

  // --- labs
  await t('aslab create lab MK sendiri', () => setDoc(doc(al1, 'labs/new1'), lab({})), true);
  await t('aslab create lab MK lain ditolak', () => setDoc(doc(al1, 'labs/new2'), lab({ mataKuliahId: 'mk2' })), false);
  await t('aslab create graceMinutes 61 ditolak', () => setDoc(doc(al1, 'labs/new3'), lab({ graceMinutes: 61 })), false);
  await t('aslab create tanpa praktikanEmails ditolak', () => { const l = lab({}); delete l.praktikanEmails; return setDoc(doc(al1, 'labs/new4'), l); }, false);
  await t('aslab create field asing ditolak', () => setDoc(doc(al1, 'labs/new5'), lab({ foo: 1 })), false);
  await t('aslab update lab MK sendiri', () => setDoc(doc(al1, 'labs/lab1'), lab({ nama: 'Baru Lab' })), true);
  await t('aslab update lab lama tanpa MK ditolak', () => setDoc(doc(al1, 'labs/labOld'), lab({})), false);
  await t('aslab delete lab MK sendiri', () => deleteDoc(doc(al1, 'labs/new1')), true);
  await t('asisten create lab ditolak (FR-71)', () => setDoc(doc(a1, 'labs/x'), lab({})), false);
  await t('asisten update lab ditolak', () => updateDoc(doc(a1, 'labs/lab1'), { nama: 'Zzz' }), false);
  await t('praktikan write lab ditolak', () => setDoc(doc(p1, 'labs/x'), lab({})), false);
  await t('praktikan read lab', () => getDoc(doc(p1, 'labs/lab1')), true);

  // --- users
  await t('aslab baca semua user', () => getDocs(collection(al1, 'users')), true);
  const nu = env.authenticatedContext('nu', { email: 'nu@x.id' }).firestore();
  await t('create user aslab dari klien ditolak', () => setDoc(doc(nu, 'users/nu'), { name: 'Aslab Palsu', email: 'nu@x.id', role: 'aslab', mataKuliahIds: ['mk1'] }), false);
  await t('create user aslab (tanpa mataKuliahIds) ditolak', () => setDoc(doc(nu, 'users/nu'), { name: 'Aslab Palsu', email: 'nu@x.id', role: 'aslab' }), false);
  await t('create praktikan tanpa kelas', () => setDoc(doc(nu, 'users/nu'), { name: 'Praktikan Baru', email: 'nu@x.id', role: 'praktikan' }), true);
  await t('mataKuliah read signedIn', () => getDoc(doc(p1, 'mataKuliah/mk1')), true);
  await t('mataKuliah write ditolak', () => setDoc(doc(al1, 'mataKuliah/mk9'), { kode: 'x', nama: 'y' }), false);

  // --- attendances
  const att = (extra) => ({ sessionId: 's1', userId: 'p1', code: '1234', timestamp: serverTimestamp(), labId: 'lab1', lokasi: { lat: -7.7, lng: 110.3, akurasiM: 10, jarakM: 5, mocked: false }, ...extra });
  await t('presensi anggota lab tanpa kelas', () => setDoc(doc(p1, 'attendances/s1_p1'), att({})), true);
  await t('presensi non-anggota & beda kelas ditolak', () => setDoc(doc(p3, 'attendances/s1_p3'), att({ userId: 'p3' })), false);
  await t('presensi jalur kelas lama (p2 kelas A di sesi s3)', async () => {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'sessions/s3/private/code'), { code: '1234' }); await updateDoc(doc(c.firestore(), 'sessions/s3'), { status: 'open' }); });
    return setDoc(doc(p2, 'attendances/s3_p2'), att({ sessionId: 's3', userId: 'p2', labId: 'lab2', kelas: 'A' }));
  }, true);
  await t('presensi kelas salah dikirim ditolak', () => setDoc(doc(p1, 'attendances/s1_p1x'), att({ kelas: 'B' })), false);
  await t('aslab baca attendances', () => getDocs(collection(al1, 'attendances')), true);

  // --- izin
  const izin = (extra) => ({ sessionId: 's5', userId: 'p1', userName: 'P Satu', alasan: 'sakit demam tinggi', status: 'pending_ai', createdAt: 'x', updatedAt: 'x', ...extra });
  await t('izin anggota lab tanpa kelas', () => setDoc(doc(p1, 'izin/s5_p1'), izin({})), true);
  await t('izin non-anggota ditolak', () => setDoc(doc(p3, 'izin/s5_p3'), izin({ userId: 'p3' })), false);

  // --- bills / payments
  await t('pemilik baca bill', () => getDoc(doc(p1, 'bills/s1_p1')), true);
  await t('LIST pemilik where userId', () => getDocs(query(collection(p1, 'bills'), where('userId', '==', 'p1'))), true);
  await t('praktikan lain baca bill ditolak', () => getDoc(doc(p3, 'bills/s1_p1')), false);
  await t('asisten lab terkait baca bill', () => getDoc(doc(a1, 'bills/s1_p1')), true);
  await t('LIST asisten bills where labId==lab1', () => getDocs(query(collection(a1, 'bills'), where('labId', '==', 'lab1'))), true);
  await t('asisten lab lain baca bill ditolak', () => getDoc(doc(as('a2', 'asp2@x.id'), 'bills/s1_p1')), false);
  await t('aslab baca bill', () => getDoc(doc(al1, 'bills/s1_p1')), true);
  await t('klien write bill ditolak', () => setDoc(doc(p1, 'bills/s1_p1'), { status: 'success' }), false);
  await t('aslab write bill ditolak', () => updateDoc(doc(al1, 'bills/s1_p1'), { status: 'success' }), false);
  await t('pemilik baca payment', () => getDoc(doc(p1, 'payments/s1_p1-1')), true);
  await t('asisten lab terkait baca payment', () => getDoc(doc(a1, 'payments/s1_p1-1')), true);
  await t('LIST asisten payments where billId', () => getDocs(query(collection(a1, 'payments'), where('billId', '==', 's1_p1'))), true);
  await t('praktikan lain baca payment ditolak', () => getDoc(doc(p3, 'payments/s1_p1-1')), false);
  await t('klien write payment ditolak', () => setDoc(doc(p1, 'payments/zz'), { userId: 'p1' }), false);

  for (const r of results) console.log(r[0], r[1]);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} lulus`);
  await env.cleanup();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
