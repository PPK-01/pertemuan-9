/**
 * Store Zustand domain Aslab (Ibrahim – Sprint 4).
 * TERPISAH dari appStore.ts agar tidak bentrok dengan domain Dhimas.
 * Hanya berisi state yang dibutuhkan oleh fitur Aslab (FR-60 s.d. FR-70).
 */
import { create } from 'zustand';
import { listenMataKuliah } from '@/services/aslab';
import type { Lab, MataKuliah } from '@/types';

type SyncStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AslabState {
  // ── Mata Kuliah ──────────────────────────────────────────────────
  mataKuliah: MataKuliah[];
  mataKuliahSync: SyncStatus;
  mataKuliahError: string | null;

  // ── Lab (difilter berdasarkan mataKuliahIds Aslab) ───────────────
  labs: Lab[];
  labsSync: SyncStatus;
  labsError: string | null;

  // ── Listener cleanup ─────────────────────────────────────────────
  _cleanupMataKuliah: (() => void) | null;
  _cleanupLabs: (() => void) | null;

  // ── Actions ──────────────────────────────────────────────────────
  startListenMataKuliah: (mataKuliahIds: string[]) => void;
  stopListenMataKuliah: () => void;
  setLabs: (labs: Lab[]) => void;
  setLabsSync: (status: SyncStatus, error?: string | null) => void;
  reset: () => void;
}

export const useAslabStore = create<AslabState>((set, get) => ({
  mataKuliah: [],
  mataKuliahSync: 'idle',
  mataKuliahError: null,
  labs: [],
  labsSync: 'idle',
  labsError: null,
  _cleanupMataKuliah: null,
  _cleanupLabs: null,

  startListenMataKuliah: (mataKuliahIds: string[]) => {
    // Bersihkan listener lama sebelum membuat yang baru
    get()._cleanupMataKuliah?.();

    if (mataKuliahIds.length === 0) {
      set({ mataKuliah: [], mataKuliahSync: 'ready', mataKuliahError: null, _cleanupMataKuliah: null });
      return;
    }

    set({ mataKuliahSync: 'loading', mataKuliahError: null });

    const cleanup = listenMataKuliah(
      mataKuliahIds,
      (list) => {
        set({ mataKuliah: list, mataKuliahSync: 'ready', mataKuliahError: null });
      },
      (err) => {
        set({ mataKuliahSync: 'error', mataKuliahError: err.message });
      },
    );

    set({ _cleanupMataKuliah: cleanup });
  },

  stopListenMataKuliah: () => {
    get()._cleanupMataKuliah?.();
    set({ _cleanupMataKuliah: null });
  },

  setLabs: (labs: Lab[]) => {
    set({ labs });
  },

  setLabsSync: (status: SyncStatus, error?: string | null) => {
    set({ labsSync: status, labsError: error ?? null });
  },

  reset: () => {
    get()._cleanupMataKuliah?.();
    get()._cleanupLabs?.();
    set({
      mataKuliah: [],
      mataKuliahSync: 'idle',
      mataKuliahError: null,
      labs: [],
      labsSync: 'idle',
      labsError: null,
      _cleanupMataKuliah: null,
      _cleanupLabs: null,
    });
  },
}));

// ── Selector hooks ────────────────────────────────────────────────────────────

export const useAslabMataKuliah = () => useAslabStore((s) => s.mataKuliah);
export const useAslabMataKuliahSync = () => useAslabStore((s) => s.mataKuliahSync);
export const useAslabLabs = () => useAslabStore((s) => s.labs);
export const useAslabLabsSync = () => useAslabStore((s) => s.labsSync);
