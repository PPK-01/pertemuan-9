import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { connectionService } from '@/services/connection';
import {
  fetchMataKuliahMap,
  generateFines as svcGenerateFines,
  listenBillsForPraktikan,
} from '@/services/denda';
import type { SyncStatus } from '@/store/sync';
import type { Bill, MataKuliah, Result, User } from '@/types';
import type { GenerateFinesResponse } from '@/types/api';

export type FineGenStatus = 'idle' | 'loading' | 'success' | 'failed';

export type DendaStoreState = {
  fineStatusBySession: Record<string, FineGenStatus>;
  fineResultBySession: Record<string, GenerateFinesResponse | undefined>;
  fineErrorBySession: Record<string, string | undefined>;
  bills: Bill[];
  billsSync: SyncStatus;
  mataKuliahById: Record<string, MataKuliah>;
  generateFines: (sessionId: string) => Promise<Result<GenerateFinesResponse>>;
  startBillsSync: (user: User) => void;
  stopBillsSync: () => void;
  retryBillsSync: () => void;
  resetDendaState: () => void;
};

let activeBillsUnsub: (() => void) | null = null;
let activeBillsUser: User | null = null;

function detachBillsListener(): void {
  if (activeBillsUnsub) {
    try {
      activeBillsUnsub();
    } catch {
      // Abaikan error cleanup listener.
    }
    activeBillsUnsub = null;
  }
}

export const useDendaStore = create<DendaStoreState>()((set, get) => ({
  fineStatusBySession: {},
  fineResultBySession: {},
  fineErrorBySession: {},
  bills: [],
  billsSync: 'idle',
  mataKuliahById: {},

  generateFines: async (sessionId) => {
    if (get().fineStatusBySession[sessionId] === 'loading') {
      return {
        ok: false,
        code: 'CONFLICT',
        message: 'Pembuatan denda sedang berjalan.',
      };
    }

    set((state) => ({
      fineStatusBySession: { ...state.fineStatusBySession, [sessionId]: 'loading' },
      fineErrorBySession: { ...state.fineErrorBySession, [sessionId]: undefined },
    }));

    const res = await svcGenerateFines(sessionId);
    if (res.ok) {
      set((state) => ({
        fineStatusBySession: { ...state.fineStatusBySession, [sessionId]: 'success' },
        fineResultBySession: { ...state.fineResultBySession, [sessionId]: res.data },
        fineErrorBySession: { ...state.fineErrorBySession, [sessionId]: undefined },
      }));
    } else {
      set((state) => ({
        fineStatusBySession: { ...state.fineStatusBySession, [sessionId]: 'failed' },
        fineErrorBySession: { ...state.fineErrorBySession, [sessionId]: res.message },
      }));
    }
    return res;
  },

  startBillsSync: (user) => {
    if (user.role !== 'praktikan') return;
    if (activeBillsUser?.id === user.id && activeBillsUnsub) return;

    detachBillsListener();
    activeBillsUser = user;
    set({ billsSync: 'loading' });

    if (Object.keys(get().mataKuliahById).length === 0) {
      fetchMataKuliahMap().then((map) => {
        if (activeBillsUser?.id === user.id && Object.keys(map).length > 0) {
          set({ mataKuliahById: map });
        }
      });
    }

    activeBillsUnsub = listenBillsForPraktikan(
      user,
      (bills) => {
        set({ bills, billsSync: 'ready' });
      },
      () => {
        set({ billsSync: 'error' });
      },
    );
  },

  stopBillsSync: () => {
    detachBillsListener();
    activeBillsUser = null;
    set({ bills: [], billsSync: 'idle' });
  },

  retryBillsSync: () => {
    const user = activeBillsUser;
    if (!user) return;
    detachBillsListener();
    set({ billsSync: 'loading' });
    activeBillsUnsub = listenBillsForPraktikan(
      user,
      (bills) => {
        set({ bills, billsSync: 'ready' });
      },
      () => {
        set({ billsSync: 'error' });
      },
    );
  },

  resetDendaState: () => {
    detachBillsListener();
    activeBillsUser = null;
    set({
      fineStatusBySession: {},
      fineResultBySession: {},
      fineErrorBySession: {},
      bills: [],
      billsSync: 'idle',
      mataKuliahById: {},
    });
  },
}));

connectionService.subscribe((isConnected) => {
  if (isConnected) {
    const state = useDendaStore.getState();
    if (state.billsSync === 'error' && activeBillsUser) {
      state.retryBillsSync();
    }
  }
});

export function useFineGenerationState(sessionId: string): {
  status: FineGenStatus;
  result: GenerateFinesResponse | undefined;
  error: string | undefined;
} {
  return useDendaStore(
    useShallow((state) => ({
      status: state.fineStatusBySession[sessionId] ?? 'idle',
      result: state.fineResultBySession[sessionId],
      error: state.fineErrorBySession[sessionId],
    })),
  );
}

const STATUS_SORT_WEIGHT: Record<Bill['status'], number> = {
  failed: 0,
  unpaid: 1,
  pending: 2,
  success: 3,
};

export function useBills(): Bill[] {
  return useDendaStore(
    useShallow((state) =>
      [...state.bills].sort((a, b) => {
        const diff = STATUS_SORT_WEIGHT[a.status] - STATUS_SORT_WEIGHT[b.status];
        if (diff !== 0) return diff;
        return b.createdAt.localeCompare(a.createdAt);
      }),
    ),
  );
}

export function useBillById(billId: string): Bill | null {
  return useDendaStore((state) => state.bills.find((b) => b.id === billId) ?? null);
}

export function useBillsSyncState(): SyncStatus {
  return useDendaStore((state) => state.billsSync);
}

export function useMataKuliahMap(): Record<string, MataKuliah> {
  return useDendaStore((state) => state.mataKuliahById);
}

export function useUnpaidBillsCount(): number {
  return useDendaStore(
    (state) =>
      state.bills.filter((b) => b.status === 'unpaid' || b.status === 'failed').length,
  );
}
