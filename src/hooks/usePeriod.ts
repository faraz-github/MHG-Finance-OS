// src/hooks/usePeriod.ts
//
// Thin wrapper over the Zustand period store.
//
// Exposes ONLY period state (type, month, year, quarter, FY, custom range,
// day, week) and the helpers that apply it to report rows.
//
// Entity filters (city, property, commission, platform, investor) are now
// per-page URL query params managed by usePageFilters — they are NOT here.
// This eliminates cross-page filter contamination.

import { usePeriodStore } from '@/store/period';
import { getFReps } from '@/lib/period';
import type { PeriodState, RepRow, PropLookup, FilterState } from '@/lib/period';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePeriod() {
  const store = usePeriodStore();

  const periodState: PeriodState = {
    cPType:    store.cPType,
    cM:        store.cM,
    cY:        store.cY,
    cQ:        store.cQ,
    cFY:       store.cFY,
    cDateFrom: store.cDateFrom,
    cDateTo:   store.cDateTo,
    cDay:      store.cDay,
    cWeek:     store.cWeek,
  };

  const { setPeriod, reset } = store;

  // ── Filter reps with explicit filter state (provided by the caller) ────────
  // Pages pass their own per-page filter values (from usePageFilters / URL).
  function getFilteredReps(
    reps: RepRow[],
    propById: (pid: string) => PropLookup | null,
    filters?: Partial<FilterState>,
  ): RepRow[] {
    const f: FilterState = {
      cCi:   filters?.cCi   ?? 'all',
      cPid:  filters?.cPid  ?? 'all',
      cComm: filters?.cComm ?? 'all',
    };
    return getFReps(reps, propById, periodState, f);
  }

  // ── Filter reps for a specific month/year (trend loops) ───────────────────
  function getFilteredRepsForMonth(
    reps: RepRow[],
    propById: (pid: string) => PropLookup | null,
    m: number,
    y: number,
    filters?: Partial<FilterState>,
  ): RepRow[] {
    const f: FilterState = {
      cCi:   filters?.cCi   ?? 'all',
      cPid:  filters?.cPid  ?? 'all',
      cComm: filters?.cComm ?? 'all',
    };
    return getFReps(reps, propById, periodState, f, m, y);
  }

  return {
    ...periodState,
    setPeriod,
    reset,
    getFilteredReps,
    getFilteredRepsForMonth,
  };
}
