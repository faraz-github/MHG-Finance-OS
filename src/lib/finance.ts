// src/lib/finance.ts
//
// ═══ FINANCIAL ENGINE — SINGLE SOURCE OF TRUTH ═══
// These 4 functions are the ONLY place financial calculations happen.
// Verbatim port from mg-finance-os.html. TypeScript types added only.
// DO NOT duplicate any formula outside this file.

// ─── Return type of calcF ────────────────────────────────────────────────────

export interface CalcFResult {
  rev: number;
  roomRev: number;
  exp: number;
  opProfit: number;
  commission: number;
  invProfit: number;
  occ: number;
  /** Always a number (0 when capital is absent). Use _hasCapital to detect N/A. */
  roi: number;
  /** true when capitalInvested > 0; use this to decide whether to show N/A */
  _hasCapital: boolean;
  adr: number;
  revpar: number;
}

// ─── calcF ───────────────────────────────────────────────────────────────────

/**
 * Master calculation function.
 * All dashboard metrics derive from this one function.
 *
 * @param rev             Total revenue for the period
 * @param exp             Total expenses for the period
 * @param commPct         Commission percentage (e.g. 20 for 20%)
 * @param nights          Booked nights in the period
 * @param days            Available room-nights in the period (calendar days)
 * @param capitalInvested Property capital base (0 triggers N/A ROI)
 * @param roomRev         Room-only revenue for ADR; falls back to rev if omitted
 */
export function calcF(
  rev: number,
  exp: number,
  commPct: number,
  nights: number,
  days: number,
  capitalInvested: number,
  roomRev?: number,
): CalcFResult {
  const rRev = roomRev || rev; // Room-only revenue for ADR; falls back to total
  const opP = rev - exp;
  const commission = calcCommission(opP, commPct);
  const invP = opP - commission; // Can be negative (investor bears loss)
  const occ = days > 0 ? Math.round((nights / days) * 100) : 0;
  // ROI = Investor Profit / Capital × 100 — null if no capital
  const roi = calcROI(invP, capitalInvested);
  // ADR = Room Revenue / Nights Booked (excludes add-ons/food)
  const adr = nights > 0 ? Math.round(rRev / nights) : 0;
  // RevPAR = Room Revenue / Available Room Nights
  const revpar = days > 0 ? Math.round(rRev / days) : 0;
  return {
    rev,
    roomRev: rRev,
    exp,
    opProfit: opP,
    commission,
    invProfit: invP,
    occ,
    roi: roi !== null ? roi : 0,
    _hasCapital: capitalInvested > 0,
    adr,
    revpar,
  };
}

// ─── calcROI ─────────────────────────────────────────────────────────────────

/** calcROI — returns NUMBER or null when capital is missing/zero.
 *  NEVER uses revenue as denominator. */
export function calcROI(
  invProfit: number,
  capitalInvested: number,
): number | null {
  if (!capitalInvested || capitalInvested <= 0) return null;
  return +((invProfit / capitalInvested) * 100).toFixed(1);
}

// ─── formatROI ───────────────────────────────────────────────────────────────

/** formatROI — display string. Returns "N/A" when capital unknown. */
export function formatROI(
  invProfit: number,
  capitalInvested: number,
): string {
  const roi = calcROI(invProfit, capitalInvested);
  if (roi === null) return 'N/A';
  return roi + '%';
}

// ─── calcCommission ──────────────────────────────────────────────────────────

/** calcCommission — NEVER negative. Zero on loss months.
 *  Commission = % of Operating Profit (NOT revenue). */
export function calcCommission(
  operatingProfit: number,
  commissionPct: number,
): number {
  return Math.round(Math.max(0, operatingProfit) * commissionPct / 100);
}