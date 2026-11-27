import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { generateFines as svcGenerateFines } from '@/services/denda';
import type { Result } from '@/types';
import type { GenerateFinesResponse } from '@/types/api';

export type FineGenStatus = 'idle' | 'loading' | 'success' | 'failed';

export type DendaStoreState = {
  fineStatusBySession: Record<string, FineGenStatus>;
  fineResultBySession: Record<string, GenerateFinesResponse | undefined>;
  fineErrorBySession: Record<string, string | undefined>;
  generateFines: (sessionId: string) => Promise<Result<GenerateFinesResponse>>;
  resetDendaState: () => void;
};

export const useDendaStore = create<DendaStoreState>()((set, get) => ({
  fineStatusBySession: {},
  fineResultBySession: {},
  fineErrorBySession: {},

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

  resetDendaState: () =>
    set({
      fineStatusBySession: {},
      fineResultBySession: {},
      fineErrorBySession: {},
    }),
}));

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
