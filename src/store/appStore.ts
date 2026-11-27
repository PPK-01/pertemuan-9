import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { LOCATION_TIMEOUT_MS, MAX_ACCURACY_M } from '@/constants/location';
import {
  dummyAttendances,
  dummyIzin,
  dummyKelasPraktikum,
  dummyLabs,
  dummySessions,
  dummyUsers,
} from '@/data/dummy';
import {
  login as authLogin,
  logout as authLogout,
  observeAuth as authObserveAuth,
  register as authRegister,
} from '@/services/auth';
import {
  addKelas as svcAddKelas,
  deleteKelas as svcDeleteKelas,
  updateKelas as svcUpdateKelas,
} from '@/services/kelas';
import {
  addLab as svcAddLab,
  deleteLab as svcDeleteLab,
  isAsprakOfLab,
  updateLab as svcUpdateLab,
} from '@/services/labs';
import {
  distanceM,
  getPermission as svcGetPermission,
  getPosition as svcGetPosition,
  NOOP_WATCH_CLEANUP,
  openSettings as svcOpenLocationSettings,
  requestEnableServices as svcRequestEnableServices,
  requestPermission as svcRequestPermission,
  watchPosition as svcWatchPosition,
} from '@/services/location';
import {
  createSession as svcCreateSession,
  deleteSession as svcDeleteSession,
  getSessionCode as svcGetSessionCode,
  newSessionId as svcNewSessionId,
  setStatus as svcSetStatus,
  updateSession as svcUpdateSession,
} from '@/services/sessions';
import { submitAttendance as svcSubmitAttendance } from '@/services/attendance';
import {
  reviewIzin as svcReviewIzin,
  saveAiResult as svcSaveAiResult,
  submitIzin as svcSubmitIzin,
} from '@/services/izin';
import { classifyIzin } from '@/services/ai';
import { clearBarkKeyLocally, getSavedBarkKey, toBarkDeviceToken } from '@/services/bark';
import { connectionService } from '@/services/connection';
import { devWarn } from '@/services/devLog';
import { isFirebaseReady } from '@/services/firebase';
import { withWriteGuard } from '@/services/guard';
import {
  addNotificationListeners,
  extractNotifPayload,
  getDeviceToken as svcGetDeviceToken,
  getNotifTargetRoute,
  openNotificationSettings as svcOpenNotificationSettings,
  removeDeviceToken as svcRemoveDeviceToken,
  requestNotifPermission as svcRequestNotifPermission,
  saveDeviceToken as svcSaveDeviceToken,
} from '@/services/notifications';
import {
  notifyIzinDecided,
  notifyLocationChanged,
  notifySessionCreated,
  notifySessionOpened,
  notifySessionUpdated,
} from '@/services/push';
import {
  retrySync as syncRetrySync,
  startSync as syncStartSync,
  stopSync as syncStopSync,
  type SyncKey,
  type SyncStatus,
  type SyncStoreDelegate,
} from './sync';
import type {
  Attendance,
  AttendResult,
  CreateLabInput,
  CreateSessionInput,
  DevicePosition,
  Izin,
  IzinStatus,
  KelasPraktikum,
  Lab,
  LocationStatus,
  LokasiPresensi,
  NotifPayload,
  NotificationPermission,
  RegisterInput,
  Rekap,
  Result,
  Session,
  UpdateLabInput,
  User,
} from '@/types';

export type { SyncKey, SyncStatus };

const IDLE_SYNC: Record<SyncKey, SyncStatus> = {
  sessions: 'idle',
  kelas: 'idle',
  attendances: 'idle',
  izin: 'idle',
  users: 'idle',
  labs: 'idle',
};

export type AppStoreState = {
  authStatus: 'loading' | 'signedOut' | 'signedIn';
  currentUser: User | null;
  isOnline: boolean;
  sync: Record<SyncKey, SyncStatus>;

  users: User[];
  kelasList: KelasPraktikum[];
  sessions: Session[];
  attendances: Attendance[];
  izinList: Izin[];
  sessionCodes: Record<string, string>;

  // Lab & Lokasi (Sprint 3 §3.5)
  labs: Lab[];
  location: { status: LocationStatus; position: DevicePosition | null };
  notifPermission: NotificationPermission;

  // Internal setters
  setCurrentUser: (user: User | null) => void;
  setAuthStatus: (status: 'loading' | 'signedOut' | 'signedIn') => void;
  setSyncStatus: (key: SyncKey, status: SyncStatus) => void;
  setSessionCode: (sessionId: string, code: string) => void;
  setLabs: (labs: Lab[]) => void;
  setLocationStatus: (status: LocationStatus) => void;
  setDevicePosition: (position: DevicePosition | null) => void;
  setNotifPermission: (perm: NotificationPermission) => void;

  // Aksi Auth (FR-01, FR-13 s.d. FR-15)
  initAuth: () => () => void;
  register: (input: RegisterInput) => Promise<Result<User>>;
  login: (email: string, password: string) => Promise<Result<User>>;
  /**
   * Keluar dari akun. Bila signOut gagal, Result gagal dikembalikan dan pengguna tetap masuk
   * (cache tidak dikosongkan), karena sesi Firebase Auth masih aktif.
   */
  logout: () => Promise<Result>;

  // Sinkronisasi (C-4, NFR-02)
  retrySync: (key?: SyncKey) => void;

  // Aksi Sesi & Kelas (FR-04 s.d. FR-06, FR-18 s.d. FR-20, SRS v2.2 §3.4)
  /** Id sesi baru tanpa menulis; simpan lalu kirim ke createSession agar kirim ulang aman. */
  newSessionId: () => string;
  /**
   * Membuat sesi. Dengan `options.id`, sesi yang sudah ada dengan id itu dikembalikan sebagai
   * sukses tanpa menulis ulang, sehingga kirim ulang setelah gagal atau TIMEOUT tidak membuat
   * sesi ganda. Tanpa `options.id`, id baru dibuat setiap pemanggilan.
   */
  createSession: (
    input: CreateSessionInput,
    options?: { id?: string },
  ) => Promise<Result<Session>>;
  updateSession: (id: string, patch: Partial<Session>) => Promise<Result>;
  deleteSession: (id: string) => Promise<Result>;
  openSession: (id: string) => Promise<Result>;
  closeSession: (id: string) => Promise<Result>;
  addKelas: (praktikum: string, kelas: string) => Promise<Result<KelasPraktikum>>;
  updateKelas: (id: string, praktikum: string, kelas: string) => Promise<Result>;
  deleteKelas: (id: string) => Promise<Result>;

  // Aksi Lab (FR-40, FR-41, FR-43)
  addLab: (input: CreateLabInput) => Promise<Result<Lab>>;
  updateLab: (id: string, patch: UpdateLabInput) => Promise<Result>;
  deleteLab: (id: string) => Promise<Result>;

  // Aksi Lokasi & Perangkat (FR-35, FR-50, FR-56–58)
  requestLocation: () => Promise<LocationStatus>;
  refreshLocation: () => Promise<LocationStatus>;
  openLocationSettings: () => Promise<void>;
  enableLocationServices: () => Promise<LocationStatus>;
  registerDevice: () => Promise<void>;

  // Aksi Presensi & Izin (FR-07, FR-21 s.d. FR-24, FR-26)
  submitAttendance: (sessionId: string, code: string) => Promise<AttendResult>;
  submitIzin: (sessionId: string, alasan: string) => Promise<Result<Izin>>;
  retryAi: (izinId: string) => Promise<Result>;
  reviewIzin: (
    izinId: string,
    keputusan: 'approved' | 'rejected',
    catatan?: string,
  ) => Promise<Result>;
};

// Delegate sync adapter untuk memutus require-cycle antara appStore dan sync
function getSyncDelegate(get: () => AppStoreState, set: (partial: Partial<AppStoreState> | ((state: AppStoreState) => Partial<AppStoreState>)) => void): SyncStoreDelegate {
  return {
    setSyncStatus: (key, status) => {
      set((state) => ({ sync: { ...state.sync, [key]: status } }));
    },
    getSyncStatus: (key) => get().sync[key],
    setKelasList: (kelasList) => set({ kelasList }),
    setSessions: (sessions) => set({ sessions }),
    setAttendances: (attendances) => set({ attendances }),
    setIzinList: (izinList) => set({ izinList }),
    setUsers: (users) => set({ users }),
    setLabs: (labs) => set({ labs }),
    retryAi: (izinId) => get().retryAi(izinId),
  };
}

let locationEpoch = 0;

// uid yang registrasi perangkatnya sedang berjalan; mencegah panggilan ganda untuk uid yang sama.
const registeringDeviceUids = new Set<string>();

function checkAsprakLabAccess(
  state: Pick<AppStoreState, 'currentUser' | 'labs' | 'sync'>,
  labId: string | undefined,
): Result | null {
  const user = state.currentUser;
  if (!user || user.role !== 'asisten' || state.sync.labs !== 'ready') {
    return null;
  }
  const lab = labId ? state.labs.find((l) => l.id === labId) : undefined;
  if (!lab || !isAsprakOfLab(lab, user.email)) {
    return {
      ok: false,
      code: 'PERMISSION_DENIED',
      message: 'Kamu tidak terdaftar sebagai Asprak di laboratorium ini.',
    };
  }
  return null;
}

export const useAppStore = create<AppStoreState>()((set, get) => ({
  authStatus: 'loading',
  currentUser: null,
  isOnline: connectionService.isConnected,
  sync: IDLE_SYNC,

  // State awal: jika Firebase aktif, mulai dengan data kosong (O-4). Jika fallback in-memory, muat dummy data.
  users: isFirebaseReady ? [] : dummyUsers,
  kelasList: isFirebaseReady ? [] : dummyKelasPraktikum,
  sessions: isFirebaseReady ? [] : dummySessions,
  attendances: isFirebaseReady ? [] : dummyAttendances,
  izinList: isFirebaseReady ? [] : dummyIzin,
  sessionCodes: {},

  // Lab & Lokasi
  labs: isFirebaseReady ? [] : dummyLabs,
  location: {
    status: 'idle',
    position: null,
  },
  notifPermission: 'undetermined',

  setCurrentUser: (user) => {
    set({
      currentUser: user,
      authStatus: user ? 'signedIn' : 'signedOut',
    });
    if (user) {
      syncStartSync(user, getSyncDelegate(get, set));
    } else {
      syncStopSync(getSyncDelegate(get, set));
      locationEpoch++;
      stopGlobalWatch();
      // Seluruh cache dikosongkan agar akun berikutnya di perangkat yang sama tidak melihat data
      // akun sebelumnya (mis. daftar praktikan atau kode sesi milik asisten).
      set({
        sync: IDLE_SYNC,
        users: isFirebaseReady ? [] : dummyUsers,
        kelasList: isFirebaseReady ? [] : dummyKelasPraktikum,
        sessions: isFirebaseReady ? [] : dummySessions,
        attendances: isFirebaseReady ? [] : dummyAttendances,
        izinList: isFirebaseReady ? [] : dummyIzin,
        sessionCodes: {},
        labs: isFirebaseReady ? [] : dummyLabs,
        location: { status: 'idle', position: null },
      });
    }
  },

  setAuthStatus: (authStatus) => set({ authStatus }),

  setSyncStatus: (key, status) => {
    set((state) => ({
      sync: { ...state.sync, [key]: status },
    }));
  },

  setSessionCode: (sessionId, code) => {
    set((state) => ({
      sessionCodes: { ...state.sessionCodes, [sessionId]: code },
    }));
  },

  setLabs: (labs) => set({ labs }),

  setLocationStatus: (status) =>
    set((state) => ({ location: { ...state.location, status } })),

  setDevicePosition: (position) =>
    set((state) => ({ location: { ...state.location, position } })),

  setNotifPermission: (notifPermission) => set({ notifPermission }),

  initAuth: () => {
    // Satu-satunya titik registrasi perangkat: dipicu setiap uid pengguna berganti (null → A, A → B),
    // lewat login, daftar, maupun sesi tersimpan. Listener auth sendiri tidak memanggil
    // onUser setelah register, sehingga pemicunya adalah perubahan currentUser di store.
    const registerFor = (user: User | null) => {
      if (!user) return;
      get().registerDevice().catch((err) => {
        devWarn('initAuth-registerDevice', err);
      });
    };
    const unsubscribeStore = useAppStore.subscribe((state, prev) => {
      const uid = state.currentUser?.id;
      if (uid && uid !== prev.currentUser?.id) {
        registerFor(state.currentUser);
      }
    });
    const unsubscribeAuth = authObserveAuth((user) => {
      get().setCurrentUser(user);
    });
    return () => {
      unsubscribeAuth();
      unsubscribeStore();
    };
  },

  retrySync: (key) => {
    const user = get().currentUser;
    if (user) {
      syncRetrySync(key, user, getSyncDelegate(get, set));
    }
  },

  register: async (input) => {
    const res = await authRegister(input);
    if (res.ok) {
      get().setCurrentUser(res.data);
    }
    return res;
  },

  login: async (email, password) => {
    const res = await authLogin(email, password);
    if (res.ok) {
      get().setCurrentUser(res.data);
    }
    return res;
  },

  logout: async () => {
    const user = get().currentUser;
    if (user) {
      // Hapus token perangkat saat logout (FR-50); race timeout 10 detik agar tidak hang saat offline
      let barkKey: string | null = null;
      try {
        barkKey = Platform.OS === 'ios' ? await getSavedBarkKey() : null;
        await Promise.race([
          Promise.all([
            svcRemoveDeviceToken(user.id),
            barkKey ? svcRemoveDeviceToken(user.id, toBarkDeviceToken(barkKey)) : undefined,
          ]),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), 10000),
          ),
        ]);
      } catch (err) {
        devWarn('logout-removeDeviceToken', err);
      }
      // Key Bark milik perangkat/akun ini; hapus lokal agar akun berikutnya tidak ikut mendaftarkannya
      if (Platform.OS === 'ios') {
        await clearBarkKeyLocally().catch((err) => {
          devWarn('logout-clearBarkKey', err);
        });
      }
    }
    const res = await authLogout();
    // Bila signOut gagal, sesi Firebase Auth masih aktif dan akun ini akan masuk lagi saat
    // aplikasi dibuka ulang; mengosongkan cache hanya membuat pengguna mengira sudah keluar.
    if (res.ok) {
      locationEpoch++;
      stopGlobalWatch();
      get().setCurrentUser(null);
    }
    return res;
  },

  newSessionId: () => svcNewSessionId(),

  createSession: async (input, options) => {
    const accessErr = checkAsprakLabAccess(get(), input.labId);
    if (accessErr) {
      return accessErr as Result<Session>;
    }
    // C-2: Sesi dibuat dengan id final Firestore yang konsisten sejak awal. Tanpa options.id,
    // service membuat id baru seperti sebelumnya.
    const id = options?.id;
    if (id) {
      // Kirim ulang dengan id yang sama dan sesinya sudah tersinkron: tidak perlu menulis lagi.
      const cached = get().sessions.find((s) => s.id === id);
      if (cached) {
        return { ok: true, data: cached };
      }
    }
    // Dengan id, service membaca dokumen lebih dulu untuk tulis yang sudah tersimpan tetapi
    // belum sampai ke cache.
    const res = await withWriteGuard(() => svcCreateSession({ ...input, id }));
    if (res.ok) {
      // N2: Notifikasi jadwal baru ke praktikan kelas sesi
      notifySessionCreated(res.data, get().users, get().labs).catch((err) => {
        devWarn('notify-createSession', err);
      });
    }
    return res;
  },

  updateSession: async (id, patch) => {
    const oldSession = get().sessions.find((s) => s.id === id);
    const currentAccessErr = oldSession ? checkAsprakLabAccess(get(), oldSession.labId) : null;
    if (currentAccessErr) return currentAccessErr;
    if (patch.labId !== undefined) {
      const targetAccessErr = checkAsprakLabAccess(get(), patch.labId);
      if (targetAccessErr) return targetAccessErr;
    }
    const labChanged =
      oldSession &&
      oldSession.status !== 'closed' &&
      patch.labId !== undefined &&
      patch.labId !== oldSession.labId;
    // "Jadwal berubah" hanya bila waktu mulai/selesai berubah (dibandingkan sebagai waktu, bukan string)
    // dan lab tidak berubah: perubahan lab sudah diberitahukan lewat N4 sehingga satu aksi = satu notifikasi.
    const sameTime = (a: string, b: string): boolean => new Date(a).getTime() === new Date(b).getTime();
    const scheduleChanged =
      oldSession &&
      oldSession.status !== 'closed' &&
      !labChanged &&
      ((patch.startAt !== undefined && !sameTime(patch.startAt, oldSession.startAt)) ||
        (patch.endAt !== undefined && !sameTime(patch.endAt, oldSession.endAt)));

    const res = await withWriteGuard(() => svcUpdateSession(id, patch));
    if (res.ok && oldSession) {
      const updatedSession = { ...oldSession, ...patch };
      if (labChanged) {
        // N4: labId sesi yang belum Ditutup berubah
        const newLab = patch.labId ? get().labs.find((l) => l.id === patch.labId) : null;
        const labName = newLab?.nama || 'Lab';
        notifyLocationChanged(updatedSession, get().users, labName).catch((err) => {
          devWarn('notify-updateSession', err);
        });
      }
      if (scheduleChanged) {
        notifySessionUpdated(updatedSession, get().users, get().labs).catch((err) => {
          devWarn('notify-updateSession-schedule', err);
        });
      }
    }
    return res;
  },

  deleteSession: async (id) => {
    const session = get().sessions.find((s) => s.id === id);
    const accessErr = session ? checkAsprakLabAccess(get(), session.labId) : null;
    if (accessErr) return accessErr;
    return withWriteGuard(() => svcDeleteSession(id));
  },

  openSession: async (id) => {
    // C-5: Pra-cek transisi status sesi terkini di store
    const session = get().sessions.find((s) => s.id === id);
    const accessErr = session ? checkAsprakLabAccess(get(), session.labId) : null;
    if (accessErr) return accessErr;
    if (session && session.status !== 'scheduled') {
      return {
        ok: false,
        code: 'CONFLICT',
        message:
          session.status === 'open'
            ? 'Sesi sudah dibuka'
            : 'Sesi sudah ditutup dan tidak dapat dibuka kembali',
      };
    }
    const res = await withWriteGuard(() => svcSetStatus(id, 'open'));
    if (res.ok) {
      // N1: Status sesi scheduled -> open ke praktikan kelas sesi
      const currentSession = get().sessions.find((s) => s.id === id) || session;
      if (currentSession) {
        notifySessionOpened(currentSession, get().users, get().labs).catch((err) => {
          devWarn('notify-openSession', err);
        });
      }
    }
    return res;
  },

  closeSession: async (id) => {
    // C-5: Pra-cek transisi status sesi terkini di store
    const session = get().sessions.find((s) => s.id === id);
    const accessErr = session ? checkAsprakLabAccess(get(), session.labId) : null;
    if (accessErr) return accessErr;
    if (session && session.status !== 'open') {
      return {
        ok: false,
        code: 'CONFLICT',
        message:
          session.status === 'closed'
            ? 'Sesi sudah ditutup'
            : 'Sesi belum dibuka',
      };
    }
    return withWriteGuard(() => svcSetStatus(id, 'closed'));
  },

  addKelas: async (praktikum, kelas) => {
    const user = get().currentUser;
    return withWriteGuard(() => svcAddKelas(praktikum, kelas, user?.id ?? ''));
  },

  updateKelas: async (id, praktikum, kelas) => {
    return withWriteGuard(() => svcUpdateKelas(id, praktikum, kelas));
  },

  deleteKelas: async (id) => {
    return withWriteGuard(() => svcDeleteKelas(id));
  },

  addLab: async (input) => {
    const user = get().currentUser;
    if (!user) {
      return { ok: false, code: 'PERMISSION_DENIED', message: 'Harap masuk terlebih dahulu' };
    }
    return withWriteGuard(() => svcAddLab(input, user));
  },

  updateLab: async (id, patch) => {
    const user = get().currentUser;
    if (!user) {
      return { ok: false, code: 'PERMISSION_DENIED', message: 'Harap masuk terlebih dahulu' };
    }

    const oldLab = get().labs.find((l) => l.id === id);
    const nameChanged = patch.nama !== undefined && patch.nama !== oldLab?.nama;
    const coordChanged =
      (patch.lat !== undefined && patch.lat !== oldLab?.lat) ||
      (patch.lng !== undefined && patch.lng !== oldLab?.lng);
    const labLocationChanged = nameChanged || coordChanged;

    const res = await withWriteGuard(() => svcUpdateLab(id, patch, user));
    if (res.ok && labLocationChanged) {
      // N4: Nama/koordinat lab yang dipakai sesi yang belum Ditutup berubah
      const affectedSessions = get().sessions.filter(
        (s) => s.labId === id && s.status !== 'closed',
      );
      const newLabName = patch.nama || oldLab?.nama || 'Lab';
      for (const s of affectedSessions) {
        notifyLocationChanged(s, get().users, newLabName).catch((err) => {
          devWarn('notify-updateLab', err);
        });
      }
    }
    return res;
  },

  deleteLab: async (id) => {
    // Pra-cek di store sesi yang masih memakai lab dan belum ditutup (FR-43)
    const activeSession = get().sessions.find(
      (s) => s.labId === id && s.status !== 'closed',
    );
    if (activeSession) {
      return {
        ok: false,
        code: 'IN_USE',
        message: 'Lab ini masih dipakai sesi yang belum ditutup.',
      };
    }
    return withWriteGuard(() => svcDeleteLab(id));
  },

  requestLocation: async () => {
    const epoch = ++locationEpoch;
    set((state) => ({ location: { ...state.location, status: 'checking' } }));

    try {
      // Cek izin terlebih dahulu (SRS 3.5: minta izin bila perlu, lalu ambil posisi)
      const perm = await svcGetPermission();
      if (epoch !== locationEpoch) {
        return get().location.status;
      }

      if (!perm.granted) {
        if (perm.canAskAgain || perm.status === 'undetermined') {
          const req = await svcRequestPermission();
          if (epoch !== locationEpoch) {
            return get().location.status;
          }
          if (!req.granted) {
            const status: LocationStatus = req.canAskAgain
              ? 'permission_denied'
              : 'permission_blocked';
            set({ location: { status, position: null } });
            return status;
          }
        } else {
          set({ location: { status: 'permission_blocked', position: null } });
          return 'permission_blocked';
        }
      }

      const res = await svcGetPosition(LOCATION_TIMEOUT_MS);
      if (epoch !== locationEpoch) {
        return get().location.status;
      }

      const isValidPos =
        res.status === 'ready' ||
        res.status === 'low_accuracy' ||
        res.status === 'mocked';
      const position = isValidPos ? res.position : null;
      set({ location: { status: res.status, position } });
      if (isValidPos) {
        restartWatchIfActive();
      }
      return res.status;
    } catch {
      if (epoch === locationEpoch) {
        set({ location: { status: 'unavailable', position: null } });
        return 'unavailable';
      }
      return get().location.status;
    } finally {
      if (epoch === locationEpoch && get().location.status === 'checking') {
        set({ location: { status: 'unavailable', position: null } });
      }
    }
  },

  refreshLocation: async () => {
    const epoch = ++locationEpoch;
    set((state) => ({ location: { ...state.location, status: 'checking' } }));
    try {
      const res = await svcGetPosition(LOCATION_TIMEOUT_MS);
      if (epoch !== locationEpoch) {
        return get().location.status;
      }

      const isValidPos =
        res.status === 'ready' ||
        res.status === 'low_accuracy' ||
        res.status === 'mocked';
      const position = isValidPos ? res.position : null;

      set({ location: { status: res.status, position } });
      if (isValidPos) {
        restartWatchIfActive();
      }
      return res.status;
    } catch {
      if (epoch === locationEpoch) {
        set({ location: { status: 'unavailable', position: null } });
        return 'unavailable';
      }
      return get().location.status;
    } finally {
      if (epoch === locationEpoch && get().location.status === 'checking') {
        set({ location: { status: 'unavailable', position: null } });
      }
    }
  },

  openLocationSettings: async () => {
    await svcOpenLocationSettings();
  },

  enableLocationServices: async () => {
    const epoch = ++locationEpoch;
    set((state) => ({ location: { ...state.location, status: 'checking' } }));
    try {
      await svcRequestEnableServices();
      if (epoch !== locationEpoch) {
        return get().location.status;
      }
      const st = await get().refreshLocation();
      if (st === 'ready' || st === 'low_accuracy' || st === 'mocked') {
        restartWatchIfActive();
      }
      return st;
    } catch {
      if (epoch === locationEpoch) {
        set({ location: { status: 'services_off', position: null } });
        return 'services_off';
      }
      return get().location.status;
    } finally {
      if (epoch === locationEpoch && get().location.status === 'checking') {
        set({ location: { status: 'services_off', position: null } });
      }
    }
  },

  registerDevice: async () => {
    const user = get().currentUser;
    if (!user || registeringDeviceUids.has(user.id)) return;

    registeringDeviceUids.add(user.id);
    try {
      // Di iOS (LiveContainer), daftarkan Bark key terlebih dahulu agar tidak terblokir prompt/gagal APNs
      if (Platform.OS === 'ios') {
        const barkKey = await getSavedBarkKey();
        if (barkKey && get().currentUser?.id === user.id) {
          await svcSaveDeviceToken(user.id, toBarkDeviceToken(barkKey));
        }
      }

      // Minta izin notifikasi (dengan dialog penjelasan sebelum dialog sistem jika undetermined)
      const perm = await svcRequestNotifPermission(true);
      set({ notifPermission: perm });

      if (perm === 'granted') {
        const token = await svcGetDeviceToken();
        // Pengguna bisa logout atau berganti akun selama menunggu; jangan simpan di uid yang salah.
        if (token && get().currentUser?.id === user.id) {
          await svcSaveDeviceToken(user.id, token);
        }
      }
    } catch (err) {
      devWarn('store-registerDevice', err);
    } finally {
      registeringDeviceUids.delete(user.id);
    }
  },

  submitAttendance: async (sessionId, code) => {
    // 1. Offline (SRS 4.3, FR-29)
    if (!connectionService.isConnected) {
      return { ok: false, reason: 'NO_CONNECTION' };
    }

    const user = get().currentUser;
    if (!user) {
      return { ok: false, reason: 'UNKNOWN' };
    }

    // 2. Sesi tidak Dibuka
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session || session.status !== 'open') {
      return { ok: false, reason: 'SESSION_NOT_OPEN' };
    }

    // 3. Kelas berbeda
    if (!user.kelas || user.kelas !== session.kelas) {
      return { ok: false, reason: 'NOT_IN_CLASS' };
    }

    // 4. Sudah hadir
    const alreadyAttended = get().attendances.some(
      (a) => a.sessionId === sessionId && a.userId === user.id,
    );
    if (alreadyAttended) {
      return { ok: false, reason: 'ALREADY_ATTENDED' };
    }

    // 5. Izin disetujui (FR-28)
    const approvedIzin = get().izinList.some(
      (i) => i.sessionId === sessionId && i.userId === user.id && i.status === 'approved',
    );
    if (approvedIzin) {
      return { ok: false, reason: 'IZIN_APPROVED' };
    }

    // 6. Lab tidak ada
    if (!session.labId) {
      return { ok: false, reason: 'NO_LAB' };
    }
    const lab = get().labs.find((l) => l.id === session.labId);
    if (!lab) {
      return { ok: false, reason: 'NO_LAB' };
    }

    // 7. Status lokasi bukan 'ready'
    // Ambil ulang posisi bila umurnya > 30 detik atau status belum 'ready'
    let loc = get().location;
    const now = Date.now();
    const posTime = loc.position?.at ? new Date(loc.position.at).getTime() : 0;
    const ageMs = now - posTime;
    const isStale = !loc.position || isNaN(posTime) || ageMs > 30000 || ageMs < 0;

    if (loc.status !== 'ready' || isStale) {
      await get().refreshLocation();
      loc = get().location;
    }

    // Cek ulang currentUser setelah async refresh lokasi (mis. bila user logout saat menunggu)
    if (!get().currentUser) {
      return { ok: false, reason: 'UNKNOWN' };
    }

    if (loc.status !== 'ready' || !loc.position) {
      switch (loc.status) {
        case 'permission_denied':
        case 'permission_blocked':
          return { ok: false, reason: 'LOCATION_PERMISSION' };
        case 'services_off':
          return { ok: false, reason: 'LOCATION_SERVICES_OFF' };
        case 'low_accuracy':
          return { ok: false, reason: 'LOW_ACCURACY' };
        case 'mocked':
          return { ok: false, reason: 'MOCKED_LOCATION' };
        case 'timeout':
          return { ok: false, reason: 'LOCATION_TIMEOUT' };
        default:
          return { ok: false, reason: 'UNKNOWN' };
      }
    }

    // Posisi cuma valid kalau status 'ready'
    const pos = loc.position;
    if (pos.mocked) {
      return { ok: false, reason: 'MOCKED_LOCATION' };
    }
    if (pos.akurasiM > MAX_ACCURACY_M) {
      return { ok: false, reason: 'LOW_ACCURACY' };
    }

    // 8. Di luar radius
    const jarakM = distanceM(
      { lat: pos.lat, lng: pos.lng },
      { lat: lab.lat, lng: lab.lng },
    );

    if (jarakM > lab.radiusM) {
      return { ok: false, reason: 'OUTSIDE_RADIUS' };
    }

    const lokasi: LokasiPresensi = {
      lat: pos.lat,
      lng: pos.lng,
      akurasiM: pos.akurasiM,
      jarakM,
      mocked: pos.mocked,
    };

    return svcSubmitAttendance(sessionId, user, code, session, session.labId, lokasi, lab);
  },

  submitIzin: async (sessionId, alasan) => {
    const user = get().currentUser;
    if (!user) {
      return { ok: false, code: 'PERMISSION_DENIED', message: 'Harap masuk terlebih dahulu' };
    }

    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) {
      return { ok: false, code: 'NOT_FOUND', message: 'Sesi tidak ditemukan' };
    }

    return withWriteGuard(() => svcSubmitIzin(sessionId, user, alasan, session));
  },

  retryAi: async (izinId) => {
    const izin = get().izinList.find((i) => i.id === izinId);
    if (!izin) {
      return { ok: false, code: 'NOT_FOUND', message: 'Pengajuan izin tidak ditemukan' };
    }

    return withWriteGuard(async () => {
      const aiResult = await classifyIzin(izin.alasan);
      return svcSaveAiResult(izinId, aiResult);
    });
  },

  reviewIzin: async (izinId, keputusan, catatan) => {
    const user = get().currentUser;
    const izin = get().izinList.find((i) => i.id === izinId);

    const res = await withWriteGuard(() =>
      svcReviewIzin(izinId, user?.id ?? '', keputusan, catatan),
    );
    if (res.ok && izin) {
      // N3: Status izin approved / rejected ke praktikan pengaju
      const session = get().sessions.find((s) => s.id === izin.sessionId);
      notifyIzinDecided(izin, session, keputusan).catch((err) => {
        devWarn('notify-reviewIzin', err);
      });
    }
    return res;
  },
}));

// O-3 & FR-29: Pasang pemantauan status koneksi secara global dan pasang ulang otomatis listener yang error saat kembali online
connectionService.subscribe((isConnected) => {
  useAppStore.setState({ isOnline: isConnected });
  if (isConnected) {
    const store = useAppStore.getState();
    const user = store.currentUser;
    if (user) {
      (Object.keys(store.sync) as SyncKey[]).forEach((key) => {
        if (store.sync[key] === 'error') {
          store.retrySync(key);
        }
      });
    }
  }
});

// ===== Fungsi Murni Rekapitulasi (FR-10, FR-28, FR-39) =====

export function computeRekap(
  session: Session,
  users: User[],
  attendances: Attendance[],
  izinList: Izin[],
): Rekap {
  // Hanya praktikan di kelas sesi
  const praktikan = users.filter(
    (user) => user.role === 'praktikan' && user.kelas === session.kelas,
  );

  // 1. Hadir (urut waktu paling awal)
  const attendanceByUser = new Map<string, Attendance>();
  for (const att of attendances) {
    if (att.sessionId === session.id && !attendanceByUser.has(att.userId)) {
      attendanceByUser.set(att.userId, att);
    }
  }

  const hadir = praktikan
    .flatMap((user) => {
      const att = attendanceByUser.get(user.id);
      return att ? [{ user, timestamp: att.timestamp, lokasi: att.lokasi }] : [];
    })
    .sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));

  const hadirIds = new Set(hadir.map((h) => h.user.id));

  // 2. Izin (hanya status 'approved', urut nama)
  const approvedIzinMap = new Map<string, Izin>();
  for (const iz of izinList) {
    if (iz.sessionId === session.id && iz.status === 'approved') {
      approvedIzinMap.set(iz.userId, iz);
    }
  }

  const izin = praktikan
    .flatMap((user) => {
      const iz = approvedIzinMap.get(user.id);
      return iz ? [{ user, izin: iz }] : [];
    })
    .sort((a, b) => a.user.name.localeCompare(b.user.name, 'id'));

  const izinApprovedIds = new Set(izin.map((i) => i.user.id));

  // 3. Belum Hadir (tidak hadir dan tidak berizin disetujui, urut nama)
  const belumHadir = praktikan
    .filter((user) => !hadirIds.has(user.id) && !izinApprovedIds.has(user.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));

  return {
    total: praktikan.length,
    hadir,
    izin,
    belumHadir,
  };
}

// ===== Hook Baca Store =====

export function useCurrentUser(): User | null {
  return useAppStore((state) => state.currentUser);
}

export function useAuthStatus(): 'loading' | 'signedOut' | 'signedIn' {
  return useAppStore((state) => state.authStatus);
}

export function useIsOnline(): boolean {
  return useAppStore((state) => state.isOnline);
}

export function useSyncState(key: SyncKey): SyncStatus {
  return useAppStore((state) => state.sync[key]);
}

export function useKelasList(): KelasPraktikum[] {
  return useAppStore((state) => state.kelasList);
}

export function useSessionsForUser(userId: string): Session[] {
  return useAppStore(
    useShallow((state) => {
      const user =
        state.currentUser?.id === userId
          ? state.currentUser
          : state.users.find((u) => u.id === userId);
      if (!user) return [];

      let visible: Session[];
      if (user.role === 'asisten') {
        const allowedLabIds = new Set(
          state.labs.filter((lab) => isAsprakOfLab(lab, user.email)).map((lab) => lab.id),
        );
        visible = state.sessions.filter((s) => Boolean(s.labId && allowedLabIds.has(s.labId)));
      } else {
        visible = state.sessions.filter((s) => s.kelas === user.kelas);
      }

      return [...visible].sort((a, b) => a.startAt.localeCompare(b.startAt));
    }),
  );
}

export function useSessionById(id: string): Session | null {
  return useAppStore((state) => state.sessions.find((s) => s.id === id) ?? null);
}

export type SessionCodeStatus = 'loading' | 'ready' | 'error';

export type SessionCodeState = {
  code: string | null;
  status: SessionCodeStatus;
  /** Membaca ulang kode setelah status 'error'. */
  retry: () => void;
};

/**
 * Hook khusus asisten untuk membaca kode sesi 4 digit secara reaktif (C-3, SRS v2.2 §3.4).
 * Kode yang berhasil dibaca disimpan di store; gagal baca menghasilkan status 'error' yang bisa
 * dicoba lagi lewat `retry`. Objek hasil stabil selama code dan status tidak berubah.
 */
export function useSessionCode(sessionId?: string): SessionCodeState {
  const codeInStore = useAppStore((state) =>
    sessionId ? state.sessionCodes[sessionId] : undefined,
  );
  const setSessionCode = useAppStore((state) => state.setSessionCode);
  const role = useAppStore((state) => state.currentUser?.role);
  // sessionId terakhir yang gagal dibaca; berganti sesi otomatis kembali ke 'loading'.
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Pindah sesi membuang status gagal lama (penyesuaian state saat render, pola React resmi),
  // agar kembali ke sesi yang tadinya gagal tampil 'loading' selama dibaca ulang.
  const [prevSessionId, setPrevSessionId] = useState(sessionId);
  if (prevSessionId !== sessionId) {
    setPrevSessionId(sessionId);
    setFailedFor(null);
  }

  useEffect(() => {
    if (!sessionId || role !== 'asisten' || codeInStore !== undefined) {
      return;
    }
    let isMounted = true;
    svcGetSessionCode(sessionId).then((res) => {
      if (!isMounted) return;
      if (res.ok) {
        setSessionCode(sessionId, res.data);
      } else {
        setFailedFor(sessionId);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [sessionId, role, codeInStore, setSessionCode, attempt]);

  const retry = useCallback(() => {
    setFailedFor(null);
    setAttempt((n) => n + 1);
  }, []);

  const status: SessionCodeStatus =
    codeInStore !== undefined
      ? 'ready'
      : sessionId !== undefined && failedFor === sessionId
        ? 'error'
        : 'loading';
  const code = codeInStore ?? null;

  return useMemo(() => ({ code, status, retry }), [code, status, retry]);
}

export function useAttendanceBySession(sessionId: string): Attendance[] {
  return useAppStore(
    useShallow((state) =>
      state.attendances.filter((a) => a.sessionId === sessionId),
    ),
  );
}

export function useAttendanceByUser(userId: string): Attendance[] {
  return useAppStore(
    useShallow((state) => state.attendances.filter((a) => a.userId === userId)),
  );
}

export function useHasAttended(sessionId: string, userId: string): boolean {
  return useAppStore((state) =>
    state.attendances.some(
      (a) => a.sessionId === sessionId && a.userId === userId,
    ),
  );
}

export function useRekap(sessionId: string): Rekap | null {
  const session = useSessionById(sessionId);
  const users = useAppStore((state) => state.users);
  const attendances = useAppStore((state) => state.attendances);
  const izinList = useAppStore((state) => state.izinList);

  return useMemo(
    () => (session ? computeRekap(session, users, attendances, izinList) : null),
    [session, users, attendances, izinList],
  );
}

export function useIzinByUser(userId: string): Izin[] {
  return useAppStore(
    useShallow((state) =>
      state.izinList
        .filter((i) => i.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ),
  );
}

export function useIzinById(id: string): Izin | null {
  return useAppStore((state) => state.izinList.find((i) => i.id === id) ?? null);
}

export function useIzinBySession(sessionId: string): Izin[] {
  return useAppStore(
    useShallow((state) =>
      state.izinList
        .filter((i) => i.sessionId === sessionId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ),
  );
}

/**
 * Hook membaca daftar izin asisten (C-7, FR-25).
 * Mendukung filter spesifik status, 'all', atau 'pending' ('pending_ai' + 'pending_review').
 */
export function useIzinForAsisten(
  filter?: IzinStatus | 'all' | 'pending',
): Izin[] {
  return useAppStore(
    useShallow((state) => {
      let list = state.izinList;
      if (state.currentUser?.role === 'asisten') {
        const userEmail = state.currentUser.email;
        const allowedLabIds = new Set(
          state.labs.filter((lab) => isAsprakOfLab(lab, userEmail)).map((lab) => lab.id),
        );
        const allowedSessionIds = new Set(
          state.sessions
            .filter((s) => Boolean(s.labId && allowedLabIds.has(s.labId)))
            .map((s) => s.id),
        );
        list = list.filter((i) => allowedSessionIds.has(i.sessionId));
      }
      if (filter === 'pending') {
        list = list.filter(
          (i) => i.status === 'pending_ai' || i.status === 'pending_review',
        );
      } else if (filter && filter !== 'all') {
        list = list.filter((i) => i.status === filter);
      }
      return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }),
  );
}

export async function fetchSessionCode(sessionId: string): Promise<string | null> {
  const res = await svcGetSessionCode(sessionId);
  return res.ok ? res.data : null;
}

// ===== Hook Lab & Lokasi (Sprint 3 §3.5) =====

export function useLabs(): Lab[] {
  return useAppStore((state) => state.labs);
}

/** Daftar lab yang menjadi tanggung jawab Asprak saat ini (FR-71). */
export function useLabsForAsprak(): Lab[] {
  return useAppStore(
    useShallow((state) => {
      const user = state.currentUser;
      if (!user || user.role !== 'asisten') return [];
      return state.labs.filter((lab) => isAsprakOfLab(lab, user.email));
    }),
  );
}

export function useLabById(id: string | undefined): Lab | null {
  return useAppStore((state) =>
    id ? state.labs.find((l) => l.id === id) ?? null : null,
  );
}

export function useLabForSession(sessionId: string | undefined): Lab | null {
  return useAppStore((state) => {
    if (!sessionId) return null;
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session || !session.labId) return null;
    return state.labs.find((l) => l.id === session.labId) ?? null;
  });
}

/**
 * Hook membaca aktivitas sesi pada suatu laboratorium (FR-46, FR-47).
 * Menggunakan selector terpisah dan useMemo untuk kestabilan referensi di Zustand v5.
 */
export function useLabActivity(labId: string | undefined): {
  berlangsung: Session[];
  berikutnya: Session[];
} {
  const sessions = useAppStore((state) => state.sessions);
  const currentUser = useAppStore((state) => state.currentUser);

  return useMemo(() => {
    if (!labId) return { berlangsung: [], berikutnya: [] };
    const now = new Date().toISOString();

    let labSessions = sessions.filter((s) => s.labId === labId);
    if (currentUser && currentUser.role === 'praktikan') {
      labSessions = labSessions.filter((s) => s.kelas === currentUser.kelas);
    }

    const berlangsung = labSessions.filter(
      (s) =>
        s.status === 'open' ||
        (s.status === 'scheduled' && now >= s.startAt && now <= s.endAt),
    );

    const berikutnya = labSessions
      .filter((s) => s.status === 'scheduled' && s.startAt > now)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));

    return { berlangsung, berikutnya };
  }, [labId, sessions, currentUser]);
}

let watchRefCount = 0;
let globalWatchCleanup: (() => void) | null = null;
let isWatchingStarting = false;
let watchEpoch = 0;

async function startGlobalWatch(
  set: (fn: (state: AppStoreState) => Partial<AppStoreState>) => void,
) {
  if (globalWatchCleanup || isWatchingStarting) return;
  isWatchingStarting = true;
  const currentEpoch = ++watchEpoch;

  try {
    const cleanup = await svcWatchPosition(({ status, position }) => {
      // Guard: jangan tulis jika watch sudah dihentikan atau berganti sesi (logout/stop)
      if (currentEpoch !== watchEpoch || watchRefCount === 0) {
        return;
      }

      const isValidPosition =
        status === 'ready' || status === 'low_accuracy' || status === 'mocked';
      const nextPosition = isValidPosition ? position : null;

      const prev = useAppStore.getState().location;
      const prevPos = prev.position;

      // Skip set() jika status, koordinat, akurasi, dan mocked identik (poin 5 review)
      const isSamePosition =
        (!prevPos && !nextPosition) ||
        (prevPos !== null &&
          nextPosition !== null &&
          prevPos.lat === nextPosition.lat &&
          prevPos.lng === nextPosition.lng &&
          prevPos.akurasiM === nextPosition.akurasiM &&
          prevPos.mocked === nextPosition.mocked);

      if (prev.status === status && isSamePosition) {
        return;
      }

      set(() => ({
        location: {
          status,
          position: nextPosition,
        },
      }));
    });

    if (currentEpoch !== watchEpoch || watchRefCount === 0 || AppState.currentState !== 'active') {
      cleanup();
      globalWatchCleanup = null;
    } else if (cleanup === NOOP_WATCH_CLEANUP) {
      // Tidak menandai watch aktif jika yang dikembalikan hanya cleanup kosong (izin belum ada / services off)
      globalWatchCleanup = null;
    } else {
      globalWatchCleanup = cleanup;
    }
  } catch (err) {
    devWarn('location-watch', err);
  } finally {
    isWatchingStarting = false;
  }
}

function restartWatchIfActive() {
  if (watchRefCount > 0 && !globalWatchCleanup && AppState.currentState === 'active') {
    void startGlobalWatch(useAppStore.setState);
  }
}

function stopGlobalWatch() {
  watchEpoch++;
  if (globalWatchCleanup) {
    try {
      globalWatchCleanup();
    } catch {
      // Abaikan error di cleanup
    }
    globalWatchCleanup = null;
  }
}

// NFR-18: Hentikan watch saat aplikasi ke latar belakang, lanjutkan saat kembali aktif
AppState.addEventListener('change', (nextState: AppStateStatus) => {
  if (nextState === 'active') {
    if (watchRefCount > 0 && !globalWatchCleanup) {
      void startGlobalWatch(useAppStore.setState);
    }
  } else {
    stopGlobalWatch();
  }
});

export function useLocation(): {
  status: LocationStatus;
  position: DevicePosition | null;
} {
  return useAppStore(useShallow((state) => state.location));
}

/**
 * Hook menghitung jarak perangkat ke laboratorium (FR-36).
 * Menggunakan useMemo agar objek hasil stabil dan tidak memicu re-render jika koordinat tidak berubah.
 */
export function useDistanceToLab(
  labId: string | undefined,
): { jarakM: number; didalamRadius: boolean } | null {
  const lab = useAppStore(
    useCallback(
      (state) => (labId ? state.labs.find((l) => l.id === labId) : undefined),
      [labId],
    ),
  );
  const position = useAppStore((state) => state.location.position);

  const labLat = lab?.lat;
  const labLng = lab?.lng;
  const labRadiusM = lab?.radiusM;
  const posLat = position?.lat;
  const posLng = position?.lng;

  return useMemo(() => {
    if (
      labLat === undefined ||
      labLng === undefined ||
      labRadiusM === undefined ||
      posLat === undefined ||
      posLng === undefined
    ) {
      return null;
    }

    const jarakM = distanceM(
      { lat: posLat, lng: posLng },
      { lat: labLat, lng: labLng },
    );

    return {
      jarakM,
      didalamRadius: jarakM <= labRadiusM,
    };
  }, [labLat, labLng, labRadiusM, posLat, posLng]);
}

/**
 * Hook memantau posisi perangkat saat layar aktif (NFR-13, NFR-18).
 * Menyalakan watch posisi di latar depan dengan akurasi Balanced dan interval 5s/5m.
 * Otomatis berhenti saat layar ditinggalkan (unmount) atau aplikasi ke latar belakang (background).
 */
export function useWatchPosition(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    watchRefCount++;
    if (!globalWatchCleanup && AppState.currentState === 'active') {
      void startGlobalWatch(useAppStore.setState);
    }

    return () => {
      watchRefCount = Math.max(0, watchRefCount - 1);
      if (watchRefCount === 0) {
        stopGlobalWatch();
      }
    };
  }, [enabled]);
}

/**
 * Hook membaca daftar sesi praktikan hari ini dan status presensinya (FR-32, FR-33).
 * Menggunakan selector terpisah dan useMemo untuk mencegah infinite re-render.
 */
export function useTodaySessionsForAttendance(): {
  session: Session;
  attendance: Attendance | null;
  izin: Izin | null;
  canAttend: boolean;
}[] {
  const sessions = useAppStore((state) => state.sessions);
  const attendances = useAppStore((state) => state.attendances);
  const izinList = useAppStore((state) => state.izinList);
  const currentUser = useAppStore((state) => state.currentUser);

  return useMemo(() => {
    if (!currentUser || currentUser.role !== 'praktikan') return [];

    const todayStr = new Date().toISOString().slice(0, 10);
    const userSessions = sessions.filter(
      (s) => s.kelas === currentUser.kelas && s.startAt.startsWith(todayStr),
    );

    const items = userSessions.map((session) => {
      const att =
        attendances.find(
          (a) => a.sessionId === session.id && a.userId === currentUser.id,
        ) ?? null;
      const iz =
        izinList.find(
          (i) => i.sessionId === session.id && i.userId === currentUser.id,
        ) ?? null;

      const isIzinApproved = iz?.status === 'approved';
      const canAttend = session.status === 'open' && !att && !isIzinApproved;

      return { session, attendance: att, izin: iz, canAttend };
    });

    // FR-33: Sesi Dibuka yang belum dipresensi tampil paling atas
    return items.sort((a, b) => {
      if (a.canAttend && !b.canAttend) return -1;
      if (!a.canAttend && b.canAttend) return 1;
      return a.session.startAt.localeCompare(b.session.startAt);
    });
  }, [sessions, attendances, izinList, currentUser]);
}

export function useNotifPermission(): NotificationPermission {
  return useAppStore((state) => state.notifPermission);
}

/**
 * Hook untuk mendaftarkan listener notifikasi push (foreground banner dan respons tap).
 * Mengarahkan navigasi ke rute tujuan berdasarkan payload notifikasi.
 */
export function useNotificationHandler(
  onNavigate: (targetRoute: string, payload: NotifPayload) => void,
): void {
  useEffect(() => {
    let lastResponseId: string | null = null;

    const unsubscribe = addNotificationListeners(
      (notification) => {
        devWarn('notif-received-foreground', notification.request.content.title);
      },
      (response) => {
        const id = response.notification.request.identifier;
        if (id && id === lastResponseId) {
          return;
        }
        lastResponseId = id;

        const payload = extractNotifPayload(
          response.notification.request.content.data,
        );
        if (!payload) return;
        const user = useAppStore.getState().currentUser;
        const route = getNotifTargetRoute(payload, user?.role);
        onNavigate(route, payload);
      },
    );
    return () => {
      unsubscribe();
    };
  }, [onNavigate]);
}

export {
  addNotificationListeners,
  extractNotifPayload,
  getNotifTargetRoute,
  svcOpenNotificationSettings as openNotificationSettings,
};
