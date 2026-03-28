'use client';
// src/components/layout/PeriodBar.tsx
//
// Period controls only — no entity filters.
//
// Entity filters (city, property, commission, platform, investor etc.) have
// been moved to per-page URL query params via usePageFilters. This component
// is now a pure period navigator: period type + date range controls.
//
// It is hidden entirely on Monthly Entry (no period selector needed there).
//
// Source element: <div class="pbar" id="periodBar"> in the HTML.

import { usePathname } from 'next/navigation';
import { usePeriodStore } from '@/store/period';
import type { PeriodType } from '@/lib/period';
import styles from './PeriodBar.module.css';

// ---------------------------------------------------------------------------
// Pages that hide the period bar entirely
// ---------------------------------------------------------------------------

const HIDE_ON: string[] = ['/monthlyentry', '/users', '/utils'];

// ---------------------------------------------------------------------------
// Month / quarter name arrays — verbatim from the HTML
// ---------------------------------------------------------------------------

const MN = ['', 'January', 'February', 'March', 'April', 'May', 'June',
             'July', 'August', 'September', 'October', 'November', 'December'];
const MS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QNAMES = ['Q1 Apr–Jun', 'Q2 Jul–Sep', 'Q3 Oct–Dec', 'Q4 Jan–Mar'];

// ---------------------------------------------------------------------------
// getBadgeText — verbatim port of updBadge() from the HTML
// ---------------------------------------------------------------------------

function getBadgeText(
  cPType: PeriodType,
  cM: number,
  cY: number,
  cQ: number,
  cFY: number,
  cDateFrom: string,
  cDateTo: string,
  cDay: string,
  cWeek: number,
): string {
  switch (cPType) {
    case 'daily':     return cDay;
    case 'weekly':    return 'Week ' + cWeek + ', ' + MS[cM] + ' ' + cY;
    case 'monthly':   return MS[cM] + ' ' + cY;
    case 'quarterly': return QNAMES[cQ - 1] + ' FY ' + cFY + '–' + String(cFY + 1).slice(2);
    case 'fy':        return 'FY ' + cFY + '–' + String(cFY + 1).slice(2);
    case 'custom':    return (cDateFrom || '—') + ' → ' + (cDateTo || '—');
    default:          return MS[cM] + ' ' + cY;
  }
}

// ---------------------------------------------------------------------------
// Year range helper — mirrors populateYearDropdowns() in the HTML
// ---------------------------------------------------------------------------

function getYearRange(): number[] {
  const cy = new Date().getFullYear();
  const years: number[] = [];
  for (let y = cy - 5; y <= cy + 5; y++) years.push(y);
  return years;
}

const YEARS = getYearRange();

// ---------------------------------------------------------------------------
// PeriodBadge — exported so Topbar can render it
// ---------------------------------------------------------------------------

export function PeriodBadge() {
  const { cPType, cM, cY, cQ, cFY, cDateFrom, cDateTo, cDay, cWeek } = usePeriodStore();
  return <>{getBadgeText(cPType, cM, cY, cQ, cFY, cDateFrom, cDateTo, cDay, cWeek)}</>;
}

// ---------------------------------------------------------------------------
// PeriodBar — no props needed (layout fetched cities/props for entity filters
// which are now gone from this component)
// ---------------------------------------------------------------------------

export function PeriodBar() {
  const pathname = usePathname();

  // Hide entirely on pages that don't use it
  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return null;
  }

  const {
    cPType, cM, cY, cQ, cFY, cDateFrom, cDateTo, cDay, cWeek,
    setPeriod,
  } = usePeriodStore();

  return (
    <div className={styles.pbar} id="periodBar">

      {/* ── Period type selector ─────────────────────────────────────────── */}
      <span className={styles.plbl}>Period:</span>
      <select
        className={styles.fsel}
        value={cPType}
        onChange={(e) => setPeriod({ cPType: e.target.value as PeriodType })}
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="quarterly">Quarterly</option>
        <option value="fy">Financial Year</option>
        <option value="custom">Custom Range</option>
      </select>

      <div className={styles.fdiv} />

      {/* ── Daily controls ──────────────────────────────────────────────── */}
      {cPType === 'daily' && (
        <span className={styles['ctrl-group']}>
          <input
            type="date"
            className={`${styles.fsel} ${styles['fsel-date']}`}
            value={cDay}
            onChange={(e) => {
              const val = e.target.value;
              const d = new Date(val);
              setPeriod({ cDay: val, cM: d.getMonth() + 1, cY: d.getFullYear() });
            }}
          />
        </span>
      )}

      {/* ── Weekly controls ──────────────────────────────────────────────── */}
      {cPType === 'weekly' && (
        <span className={styles['ctrl-group']}>
          <select className={styles.fsel} value={cWeek} onChange={(e) => setPeriod({ cWeek: +e.target.value })}>
            <option value={1}>Week 1 (1–7)</option>
            <option value={2}>Week 2 (8–14)</option>
            <option value={3}>Week 3 (15–21)</option>
            <option value={4}>Week 4 (22–End)</option>
          </select>
          <select className={styles.fsel} value={cM} onChange={(e) => setPeriod({ cM: +e.target.value })}>
            {MS.slice(1).map((abbr, i) => <option key={i + 1} value={i + 1}>{abbr}</option>)}
          </select>
          <select className={styles.fsel} value={cY} onChange={(e) => setPeriod({ cY: +e.target.value })}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </span>
      )}

      {/* ── Monthly controls ─────────────────────────────────────────────── */}
      {cPType === 'monthly' && (
        <span className={styles['ctrl-group']}>
          <select className={styles.fsel} value={cM} onChange={(e) => setPeriod({ cM: +e.target.value })}>
            {MN.slice(1).map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
          </select>
          <select className={styles.fsel} value={cY} onChange={(e) => setPeriod({ cY: +e.target.value })}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </span>
      )}

      {/* ── Quarterly controls ───────────────────────────────────────────── */}
      {cPType === 'quarterly' && (
        <span className={styles['ctrl-group']}>
          <select className={styles.fsel} value={cQ} onChange={(e) => setPeriod({ cQ: +e.target.value })}>
            <option value={1}>Q1 (Apr–Jun)</option>
            <option value={2}>Q2 (Jul–Sep)</option>
            <option value={3}>Q3 (Oct–Dec)</option>
            <option value={4}>Q4 (Jan–Mar)</option>
          </select>
          <select className={styles.fsel} value={cFY} onChange={(e) => setPeriod({ cFY: +e.target.value, cY: +e.target.value })}>
            {YEARS.map((y) => (
              <option key={y} value={y}>FY {y}–{String(y + 1).slice(2)}</option>
            ))}
          </select>
        </span>
      )}

      {/* ── Financial Year controls ──────────────────────────────────────── */}
      {cPType === 'fy' && (
        <span className={styles['ctrl-group']}>
          <select className={styles.fsel} value={cFY} onChange={(e) => setPeriod({ cFY: +e.target.value })}>
            {YEARS.map((y) => (
              <option key={y} value={y}>FY {y}–{String(y + 1).slice(2)}</option>
            ))}
          </select>
        </span>
      )}

      {/* ── Custom range controls ────────────────────────────────────────── */}
      {cPType === 'custom' && (
        <span className={styles['ctrl-group']}>
          <input
            type="month"
            className={`${styles.fsel} ${styles['fsel-month']}`}
            value={cDateFrom}
            onChange={(e) => setPeriod({ cDateFrom: e.target.value })}
          />
          <span className={styles['range-sep']}>to</span>
          <input
            type="month"
            className={`${styles.fsel} ${styles['fsel-month']}`}
            value={cDateTo}
            onChange={(e) => setPeriod({ cDateTo: e.target.value })}
          />
        </span>
      )}

    </div>
  );
}

// Keep CityOption and PropertyOption exported so layout.tsx doesn't break
// until it's updated (layout no longer needs to pass them to PeriodBar)
export interface CityOption     { value: string; label: string; }
export interface PropertyOption { value: string; label: string; }
export interface PeriodBarProps { cities?: CityOption[]; properties?: PropertyOption[]; }