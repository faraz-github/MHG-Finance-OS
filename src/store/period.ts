// src/store/period.ts
//
// ═══ PERIOD STORE — PERIOD STATE ONLY ═══
// Zustand in-memory store. Holds ONLY the period type and date controls.
//
// Filter state (city, property, commission, platform etc.) has been moved
// to per-page URL query parameters via the usePageFilters hook. This eliminates
// cross-page filter contamination — changing city on Dashboard no longer
// affects Bookings or Investors.
//
// Default values mirror the HTML source globals exactly.
//
// ABSOLUTE RULE: Do NOT add persistence (localStorage, sessionStorage,
// IndexedDB, or any middleware that writes to storage). State is in-memory
// only per the v3 plan.

import { create } from 'zustand';
import type { PeriodState, PeriodType } from '@/lib/period';

// ---------------------------------------------------------------------------
// Default value helpers — mirror the HTML's `const now = new Date()` block
// ---------------------------------------------------------------------------

function getDefaults(): PeriodState {
  const now = new Date();
  const cM = now.getMonth() + 1;
  const cY = now.getFullYear();
  const cFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  const cDay = `${cY}-${pad(cM)}-${pad(now.getDate())}`;

  return {
    cPType: 'monthly' as PeriodType,
    cM,
    cY,
    cQ: 1,
    cFY,
    cDateFrom: '',
    cDateTo: '',
    cDay,
    cWeek: 1,
  };
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface PeriodStore extends PeriodState {
  setPeriod: (partial: Partial<PeriodState>) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePeriodStore = create<PeriodStore>((set) => ({
  ...getDefaults(),
  setPeriod: (partial) => set((state) => ({ ...state, ...partial })),
  reset: () => set(getDefaults()),
}));
