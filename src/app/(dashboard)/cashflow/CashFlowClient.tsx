'use client';
// src/app/(dashboard)/cashflow/CashFlowClient.tsx
//
// Client Component. Reads the Zustand period store, re-derives the aggregate
// and trend data whenever the period/filter state changes.
//
// Renders (verbatim from rndCashflow() in the HTML):
//   - Empty state when no revenue data for the period
//   - Three .cfc summary cards: Cash In / Cash Out / Net to Investors
//   - .crow.re: CashFlowChart (12-month) + RevExpenseBar (12-month)
//
// FIX (Bug 10): propById was () => null — city/property filters never applied.
// Now builds propMap from the properties prop and passes a proper propById
// to getFilteredReps() and getFilteredRepsForMonth().

import { useMemo } from 'react';
import Link from 'next/link';
import { usePeriod } from '@/hooks/usePeriod';
import { usePageFilters } from '@/hooks/usePageFilters';
import { PageFilterBar } from '@/components/layout/PageFilterBar';
import type { FilterOption } from '@/components/layout/PageFilterBar';
import { aggReps, withD, getFYMonths } from '@/lib/period';
import type { RepRow, PeriodState } from '@/lib/period';
import { CashFlowChart } from '@/components/charts/CashFlowChart';
import type { CashFlowTrendPoint } from '@/components/charts/CashFlowChart';
import { RevExpenseBar } from './RevExpenseBar';
import type { RevExpTrendPoint } from './RevExpenseBar';
import type { SerializableReport, SerializableProperty } from '../dashboard/page';

// ---------------------------------------------------------------------------
// Formatting helpers — full precision with 2 decimal places
// ---------------------------------------------------------------------------

function fI(n: number): string {
  if (!n && n !== 0) return '₹0.00';
  const v = Math.abs(n);
  if (v >= 100000) return (n < 0 ? '-' : '') + '₹' + (v / 100000).toFixed(2) + 'L';
  if (v >= 1000)   return (n < 0 ? '-' : '') + '₹' + (v / 1000).toFixed(2) + 'K';
  return (n < 0 ? '-' : '') + '₹' + v.toFixed(2);
}

const MS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// getPeriodMonths — verbatim port (same as DashboardClient, up to maxN=12)
// ---------------------------------------------------------------------------

const Q_MONTHS: Record<number, number[]> = {
  1: [4, 5, 6], 2: [7, 8, 9], 3: [10, 11, 12], 4: [1, 2, 3],
};

function getPeriodMonths(
  maxN: number,
  period: PeriodState,
): Array<{ m: number; y: number; l: string }> {
  const { cPType, cM, cY, cQ, cFY, cDateFrom, cDateTo } = period;
  const res: Array<{ m: number; y: number; l: string }> = [];

  switch (cPType) {
    case 'monthly':
      for (let i = Math.min(maxN, 12) - 1; i >= 0; i--) {
        let m = cM - i; let y = cY;
        if (m <= 0) { m += 12; y--; }
        res.push({ m, y, l: MS[m] });
      }
      break;
    case 'quarterly': {
      const months = Q_MONTHS[cQ] ?? [];
      const yr = cQ === 4 ? cFY + 1 : cFY;
      months.forEach((m) => res.push({ m, y: yr, l: MS[m] }));
      break;
    }
    case 'fy':
      getFYMonths(cFY).forEach(({ month: m, year: y }) =>
        res.push({ m, y, l: MS[m] }),
      );
      break;
    case 'custom': {
      if (!cDateFrom && !cDateTo) {
        for (let i = 5; i >= 0; i--) {
          let m = cM - i; let y = cY;
          if (m <= 0) { m += 12; y--; }
          res.push({ m, y, l: MS[m] });
        }
        break;
      }
      const from = cDateFrom ? new Date(cDateFrom + '-01') : new Date(cY, cM - 7, 1);
      const to   = cDateTo   ? new Date(cDateTo   + '-01') : new Date(cY, cM - 1, 1);
      const d = new Date(from);
      while (d <= to && res.length < maxN) {
        res.push({ m: d.getMonth() + 1, y: d.getFullYear(), l: MS[d.getMonth() + 1] });
        d.setMonth(d.getMonth() + 1);
      }
      break;
    }
    default:
      for (let i = 5; i >= 0; i--) {
        let m = cM - i; let y = cY;
        if (m <= 0) { m += 12; y--; }
        res.push({ m, y, l: MS[m] });
      }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CashFlowClientProps {
  reports: SerializableReport[];
  properties: SerializableProperty[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CashFlowClient({ reports, properties }: CashFlowClientProps) {
  const { getFilteredReps, getFilteredRepsForMonth, ...periodState } = usePeriod();
  const { cM, cY } = periodState;
  const filters = usePageFilters({ city: true, property: true });

  const allReps = reports as RepRow[];

  const propMap = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p])),
    [properties],
  );

  const propById = useMemo(
    () => (pid: string) => propMap[pid]
      ? { id: pid, city: propMap[pid].city, comm: propMap[pid].comm }
      : null,
    [propMap],
  );

  const pageFilterState = useMemo(
    () => ({ cCi: filters.city, cPid: filters.property, cComm: 'all' }),
    [filters.city, filters.property],
  );

  const cityOptions: FilterOption[] = useMemo(
    () => [...new Set(properties.map((p) => p.city).filter(Boolean))].sort().map((c) => ({ value: c, label: c })),
    [properties],
  );
  const propOptions: FilterOption[] = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  const filteredReps = useMemo(
    () => getFilteredReps(allReps, propById, pageFilterState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allReps, propById, pageFilterState,
     periodState.cPType, periodState.cM, periodState.cY,
     periodState.cQ, periodState.cFY, periodState.cDateFrom, periodState.cDateTo,
     periodState.cDay, periodState.cWeek],
  );

  const agg = useMemo(
    () => withD(aggReps(filteredReps, (pid) => propMap[pid]?.capital ?? 0)),
    [filteredReps, propMap],
  );

  const trendPeriods = useMemo(
    () => getPeriodMonths(12, periodState as PeriodState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodState.cPType, periodState.cM, periodState.cY, periodState.cQ,
     periodState.cFY, periodState.cDateFrom, periodState.cDateTo],
  );

  const cfTrend: CashFlowTrendPoint[] = useMemo(
    () => trendPeriods.map(({ m, y, l }) => {
      const rs = getFilteredRepsForMonth(allReps, propById, m, y, pageFilterState);
      const ta = withD(aggReps(rs, (pid) => propMap[pid]?.capital ?? 0));
      return { l, ci: ta?.rev ?? 0, co: (ta?.exp ?? 0) + (ta?.commission ?? 0) };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trendPeriods, allReps, propById, propMap, pageFilterState],
  );

  const expTrend: RevExpTrendPoint[] = useMemo(
    () => trendPeriods.map(({ m, y, l }) => {
      const rs = getFilteredRepsForMonth(allReps, propById, m, y, pageFilterState);
      const ta = withD(aggReps(rs, (pid) => propMap[pid]?.capital ?? 0));
      return { l, rev: ta?.rev ?? 0, exp: ta?.exp ?? 0 };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trendPeriods, allReps, propById, propMap, pageFilterState],
  );

  const filterBar = <PageFilterBar filters={filters} config={{ city: true, property: true }} cities={cityOptions} properties={propOptions} />;

  if (!agg || !agg.rev) {
    return (
      <div id="cf-empty" className="es">
        <div className="es-ico">💸</div>
        <div className="es-t">No Cash Flow Data</div>
        <div className="es-s">
          Add bookings via Monthly Entry or the Bookings page — reports generate
          automatically after saving. Then return here to see cash flow.
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
          <Link href="/monthlyentry" className="btn btn-or">+ Monthly Entry</Link>
          <Link href="/bookings" className="btn btn-g">+ Add Booking</Link>
        </div>
      </div>
    );
  }

  const periodLabel = periodState.cPType === 'monthly'
    ? `${MS[cM]} ${cY}`
    : periodState.cPType === 'fy'
      ? `FY ${periodState.cFY}–${String(periodState.cFY + 1).slice(2)}`
      : periodState.cPType === 'quarterly'
        ? `Q${periodState.cQ} FY ${periodState.cFY}`
        : `${MS[cM]} ${cY}`;

  return (
    <div id="cf-content">
      {filterBar}
      <div className="cfrow" id="cfCards">
        <div className="cfc in">
          <div className="cfc-l">💰 Cash In</div>
          <div className="cfc-a">{fI(agg.rev)}</div>
          <div className="cfc-d">Total Revenue — {periodLabel}</div>
        </div>

        <div className="cfc out">
          <div className="cfc-l">💸 Cash Out</div>
          <div className="cfc-a">{fI(agg.exp + agg.commission)}</div>
          <div className="cfc-d">
            Expenses ({fI(agg.exp)}) + Commission ({fI(agg.commission)})
          </div>
        </div>

        <div className="cfc net">
          <div className="cfc-l">📊 Net to Investors</div>
          <div className="cfc-a">{fI(agg.invProfit)}</div>
          <div className="cfc-d">{agg.invPct}% of operating profit</div>
        </div>
      </div>

      {/* ── .crow.re: two charts side by side ──────────────────────────────── */}
      <div className="crow re">
        {/* 12-Month Cash Flow line chart */}
        <div className="cc">
          <div className="ch">
            <div>
              <div className="ct">12-Month Cash Flow</div>
            </div>
          </div>
          <CashFlowChart trend={cfTrend} />
        </div>

        {/* Revenue vs Expenses bar chart */}
        <div className="cc">
          <div className="ch">
            <div>
              <div className="ct">Revenue vs Expenses Trend</div>
              <div className="cs">12-month real data</div>
            </div>
          </div>
          <RevExpenseBar trend={expTrend} />
        </div>
      </div>

    </div>
  );
}
