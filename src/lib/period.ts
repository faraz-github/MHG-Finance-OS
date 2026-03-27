// src/lib/period.ts
//
// ═══ PERIOD & FILTER LOGIC — SINGLE SOURCE OF TRUTH ═══
// Verbatim port from mg-finance-os.html. TypeScript types added only.
// Global DOM/state reads replaced with explicit parameters (see TYPING NOTES).
// DO NOT duplicate any period or filter logic outside this file.

import { calcROI } from './finance';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Quarter → months mapping (India FY: Q1=Apr–Jun, Q2=Jul–Sep, Q3=Oct–Dec, Q4=Jan–Mar) */
const Q_MONTHS: Record<number, number[]> = {
  1: [4, 5, 6],
  2: [7, 8, 9],
  3: [10, 11, 12],
  4: [1, 2, 3],
};

// ─── Period state type ───────────────────────────────────────────────────────

export type PeriodType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'fy'
  | 'custom';

/**
 * Mirrors the global period state variables in the HTML source.
 * In the full-stack app this is provided by the Zustand period store.
 */
export interface PeriodState {
  cPType: PeriodType;
  /** Active month (1–12) */
  cM: number;
  /** Active year (e.g. 2025) */
  cY: number;
  /** Active quarter (1–4, India FY) */
  cQ: number;
  /** Financial year start — April of this year */
  cFY: number;
  /** Custom range start as 'YYYY-MM', or '' */
  cDateFrom: string;
  /** Custom range end as 'YYYY-MM', or '' */
  cDateTo: string;
  /** Daily mode date as 'YYYY-MM-DD' */
  cDay: string;
  /** Weekly mode week number (1–4) */
  cWeek: number;
}

// ─── Filter state type ───────────────────────────────────────────────────────

/**
 * Mirrors the global filter state variables in the HTML source.
 * In the full-stack app this is provided by the Zustand period store.
 */
export interface FilterState {
  /** 'all' or a city name */
  cCi: string;
  /** 'all' or a property id */
  cPid: string;
  /** 'all' or commission pct as string (e.g. '20') */
  cComm: string;
}

// ─── Data row types ──────────────────────────────────────────────────────────

/**
 * Shape of a report row as used by getFReps and aggReps.
 * Matches the fields stored in the Report.data JSON column
 * and the HTML's Reps array entries.
 */
export interface RepRow {
  id: string;
  pid: string;
  month: number;
  year: number;
  rev: number;
  roomRev: number;
  exp: number;
  opProfit: number;
  commission: number;
  invProfit: number;
  nights: number;
  days: number;
  occ: number;
  roi: number;
  adr: number;
  revpar: number;
  channels: Record<string, number>;
  expCats: Record<string, number>;
  _autoGen?: boolean;
}

/**
 * Minimal property fields needed for filtering.
 * Matches the relevant fields of the HTML's Props entries.
 */
export interface PropLookup {
  id: string;
  city: string;
  /** Commission percentage (e.g. 20 for 20%) */
  comm: number;
}

// ─── Aggregate types ─────────────────────────────────────────────────────────

/** Raw aggregate produced by aggReps — no derived display fields. */
export interface AggRaw {
  rev: number;
  roomRev: number;
  exp: number;
  opProfit: number;
  commission: number;
  invProfit: number;
  nights: number;
  days: number;
  /** Sum of capital bases for unique properties in the aggregated set */
  _capitalBase: number;
}

/** Aggregate with all derived display fields, produced by withD. */
export interface AggResult extends AggRaw {
  occ: number;
  roi: number;
  /** Display string: e.g. '12.5%' or 'N/A' when capital not entered */
  roiDisplay: string;
  _hasCapital: boolean;
  adr: number;
  revpar: number;
  /** Operating margin % */
  margin: number;
  /** Commission as % of operating profit */
  commPct: number;
  /** Investor share as % of operating profit */
  invPct: number;
}

// ─── getFYMonths ─────────────────────────────────────────────────────────────

/**
 * Get FY months: a FY starting in April of year Y spans Apr Y to Mar Y+1.
 */
export function getFYMonths(
  fyStart: number,
): Array<{ month: number; year: number }> {
  const r: Array<{ month: number; year: number }> = [];
  for (let m = 4; m <= 12; m++) r.push({ month: m, year: fyStart });
  for (let m = 1; m <= 3; m++) r.push({ month: m, year: fyStart + 1 });
  return r;
}

// ─── getFReps ────────────────────────────────────────────────────────────────

/**
 * Core filter — respects all period types.
 *
 * @param reps       All report rows (replaces HTML global Reps array)
 * @param propById   O(1) property lookup by pid (replaces HTML _propMap / propById())
 * @param period     Current period state (replaces HTML global cPType/cM/cY etc.)
 * @param filters    Current filter state (replaces HTML global cCi/cPid/cComm)
 * @param m          Optional explicit month override (for trend loops)
 * @param y          Optional explicit year override (for trend loops)
 */
export function getFReps(
  reps: RepRow[],
  propById: (pid: string) => PropLookup | null,
  period: PeriodState,
  filters: FilterState,
  m?: number,
  y?: number,
): RepRow[] {
  const { cPType, cM, cY, cQ, cFY, cDateFrom, cDateTo, cDay, cWeek } = period;
  const { cCi, cPid, cComm } = filters;

  // If called with explicit m,y (for trend loops) use those
  if (m !== undefined && y !== undefined) {
    return reps.filter((r) => {
      if (r.month !== m || r.year !== y) return false;
      const p = propById(r.pid);
      if (!p) return false;
      if (cCi !== 'all' && p.city !== cCi) return false;
      if (cPid !== 'all' && r.pid !== cPid) return false;
      if (cComm !== 'all' && p.comm !== +cComm) return false;
      return true;
    });
  }

  // No explicit m,y — use period type
  return reps.filter((r) => {
    const p = propById(r.pid);
    if (!p) return false;
    if (cCi !== 'all' && p.city !== cCi) return false;
    if (cPid !== 'all' && r.pid !== cPid) return false;
    if (cComm !== 'all' && p.comm !== +cComm) return false;
    switch (cPType) {
      case 'daily': {
        // Filter to specific day — match month/year for reports
        const dd = new Date(cDay || Date.now());
        return r.month === dd.getMonth() + 1 && r.year === dd.getFullYear();
      }
      case 'weekly': {
        return r.month === cM && r.year === cY;
      }
      case 'monthly':
        return r.month === cM && r.year === cY;
      case 'quarterly': {
        // cFY mirrors the sQY dropdown value (synced in the period store)
        const qy = cFY;
        const months = Q_MONTHS[cQ] ?? [];
        // Q4 spans Jan-Mar of next FY year
        const yr = cQ === 4 ? qy + 1 : qy;
        return months.includes(r.month) && r.year === yr;
      }
      case 'fy': {
        const fyMo = getFYMonths(cFY);
        return fyMo.some((x) => x.month === r.month && x.year === r.year);
      }
      case 'custom': {
        if (!cDateFrom && !cDateTo) return true;
        const rDate = r.year * 100 + r.month;
        const from = cDateFrom ? +cDateFrom.replace('-', '') || 0 : 0;
        const to = cDateTo ? +cDateTo.replace('-', '') || 999999 : 999999;
        return rDate >= from && rDate <= to;
      }
      default:
        return r.month === cM && r.year === cY;
    }
  });
}

// ─── aggReps ─────────────────────────────────────────────────────────────────

/**
 * Aggregate all financial fields across an array of rep rows.
 *
 * @param rs             Report rows to aggregate (output of getFReps)
 * @param getCapitalBase Callback returning capital base for a given pid.
 *                       Replaces HTML's global getInvestmentBase(pid).
 *                       Defaults to () => 0 (no capital → ROI shows N/A).
 */
export function aggReps(
  rs: RepRow[],
  getCapitalBase: (pid: string) => number = () => 0,
): AggRaw | null {
  if (!rs || !rs.length) return null;
  // Aggregate ALL financial fields including roomRev for ADR
  const agg = rs.reduce<AggRaw>(
    (a, r) => ({
      rev: a.rev + (r.rev || 0),
      roomRev: a.roomRev + (r.roomRev || r.rev || 0),
      exp: a.exp + (r.exp || 0),
      opProfit: a.opProfit + (r.opProfit || 0),
      commission: a.commission + (r.commission || 0),
      invProfit: a.invProfit + (r.invProfit || 0),
      nights: a.nights + (r.nights || 0),
      days: a.days + (r.days || 0),
      _capitalBase: 0, // populated below
    }),
    {
      rev: 0,
      roomRev: 0,
      exp: 0,
      opProfit: 0,
      commission: 0,
      invProfit: 0,
      nights: 0,
      days: 0,
      _capitalBase: 0,
    },
  );
  // Capital base from unique properties
  const pids = [...new Set(rs.map((r) => r.pid))];
  agg._capitalBase = pids.reduce((s, pid) => {
    const inv = getCapitalBase(pid);
    return s + (inv > 0 ? inv : 0);
  }, 0);
  return agg;
}

// ─── withD ───────────────────────────────────────────────────────────────────

/**
 * Extend a raw aggregate with derived display fields.
 * Verbatim port of withD() from the HTML source.
 * Placed here (not finance.ts) because it works on aggregated rep data.
 */
export function withD(a: AggRaw | null): AggResult | null {
  if (!a) return null;
  const capBase = a._capitalBase || 0;
  const roiVal = calcROI(a.invProfit, capBase);
  const rRev = a.roomRev || a.rev || 0; // Room revenue for ADR/RevPAR
  return {
    ...a,
    occ: a.days ? Math.round((a.nights / a.days) * 100) : 0,
    roi: roiVal !== null ? roiVal : 0,
    roiDisplay: roiVal !== null ? roiVal + '%' : 'N/A',
    _hasCapital: capBase > 0,
    adr: a.nights > 0 ? Math.round(rRev / a.nights) : 0,
    revpar: a.days > 0 ? Math.round(rRev / a.days) : 0,
    margin: a.rev ? +((a.opProfit / a.rev) * 100).toFixed(1) : 0,
    commPct: a.opProfit > 0 ? +((a.commission / a.opProfit) * 100).toFixed(1) : 0,
    invPct: a.opProfit > 0 ? +((a.invProfit / a.opProfit) * 100).toFixed(1) : 0,
  };
}

// ─── matchesPeriod ───────────────────────────────────────────────────────────

/**
 * Filter any ISO date string (YYYY-MM-DD) by the global period.
 * Used by Bookings, Daily Expenses, and other date-stamped records.
 *
 * @param dateStr ISO date string 'YYYY-MM-DD'
 * @param period  Current period state
 */
export function matchesPeriod(
  dateStr: string,
  period: PeriodState,
): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const { cPType, cM, cY, cQ, cFY, cDateFrom, cDateTo, cDay, cWeek } = period;

  switch (cPType) {
    case 'daily':
      return dateStr === cDay;
    case 'weekly': {
      if (m !== cM || y !== cY) return false;
      const day = d.getDate();
      const ws = [0, 1, 8, 15, 22];
      const we = [0, 7, 14, 21, new Date(y, m, 0).getDate()];
      return day >= ws[cWeek] && day <= we[cWeek];
    }
    case 'monthly':
      return m === cM && y === cY;
    case 'quarterly': {
      // cFY mirrors the sQY dropdown value (synced in the period store)
      const qy = cFY;
      const months = Q_MONTHS[cQ] ?? [];
      const yr = cQ === 4 ? qy + 1 : qy;
      return months.includes(m) && y === yr;
    }
    case 'fy': {
      const fyMo = getFYMonths(cFY);
      return fyMo.some((x) => x.month === m && x.year === y);
    }
    case 'custom': {
      if (!cDateFrom && !cDateTo) return true;
      const rd = y * 100 + m;
      const from = cDateFrom ? +cDateFrom.replace('-', '') || 0 : 0;
      const to = cDateTo ? +cDateTo.replace('-', '') || 999999 : 999999;
      return rd >= from && rd <= to;
    }
    default:
      return m === cM && y === cY;
  }
}