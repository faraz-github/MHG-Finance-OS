'use client';
// src/app/(dashboard)/dashboard/DashboardClient.tsx
//
// Client Component. Reads the Zustand period store, re-derives all metrics
// and chart data whenever the period/filter state changes.
//
// Renders (pixel-matched to HTML):
//   - Empty state (#d-empty) when no data for the current period
//   - MetricCard grid (11 cards, verbatim from rndMetrics())
//   - Info cards row (Total Nights · Total Expenses · Expense Goal)
//   - .crow.r2: RevenueChart + CommissionDonut
//   - .crow.r3: OccupancyChart + Booking Channels Donut + Property Revenue bar

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePeriod } from '@/hooks/usePeriod';
import { usePageFilters } from '@/hooks/usePageFilters';
import { PageFilterBar } from '@/components/layout/PageFilterBar';
import { aggReps, withD, getFYMonths } from '@/lib/period';
import type { RepRow, PropLookup, PeriodState } from '@/lib/period';
import { MetricCard, MetricCardGrid } from '@/components/ui/MetricCard';
import { RevenueChart } from '@/components/charts/RevenueChart';
import { CommissionDonut } from '@/components/charts/CommissionDonut';
import { OccupancyChart } from '@/components/charts/OccupancyChart';
import type { SerializableReport, SerializableProperty } from './page';
import type { RevenueTrendPoint } from '@/components/charts/RevenueChart';
import type { OccupancyTrendPoint } from '@/components/charts/OccupancyChart';

// Lazy-imported to keep initial bundle smaller (chart.js is ~200KB)
import dynamic from 'next/dynamic';
const ChannelsDonut  = dynamic(() => import('./ChannelsDonut').then(m => ({ default: m.ChannelsDonut })),  { ssr: false });
const PropertyRevBar = dynamic(() => import('./PropertyRevBar').then(m => ({ default: m.PropertyRevBar })), { ssr: false });

// ---------------------------------------------------------------------------
// Formatting helpers — full precision with 2 decimal places everywhere
// ---------------------------------------------------------------------------

function fI(n: number): string {
  if (!n && n !== 0) return '₹0.00';
  const v = Math.abs(n);
  if (v >= 100000) return (n < 0 ? '-' : '') + '₹' + (v / 100000).toFixed(2) + 'L';
  if (v >= 1000)   return (n < 0 ? '-' : '') + '₹' + (v / 1000).toFixed(2) + 'K';
  return (n < 0 ? '-' : '') + '₹' + v.toFixed(2);
}

function fIN(n: number): string {
  return '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Month abbrev array (for info card label)
const MS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// getPeriodMonths — verbatim port from getPeriodMonths() in the HTML
// Returns up to maxN {m, y, l} entries for the trend window.
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
      for (let i = Math.min(maxN, 6) - 1; i >= 0; i--) {
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
      getFYMonths(cFY).forEach(({ month: m, year: y }) => res.push({ m, y, l: MS[m] }));
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
// ExpenseGoalCard — DB-persisted expense goal.
// Reads initial value from UtilsSetting (via page.tsx prop).
// Saves via POST /api/targets — same key as Smart Insights targets so the
// expense_limit field stays in sync across both pages.
// ---------------------------------------------------------------------------

function ExpenseGoalCard({
  cM, cY, totalExp, fIN, initialGoal,
}: {
  cM: number;
  cY: number;
  totalExp: number;
  fIN: (n: number) => string;
  initialGoal: number;
}) {
  const [goal, setGoal]       = useState<number | null>(initialGoal > 0 ? initialGoal : null);
  const [inputVal, setInputVal] = useState('');
  const [editing, setEditing]   = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync when the server-side prop changes (period changes → page reloads)
  useEffect(() => {
    setGoal(initialGoal > 0 ? initialGoal : null);
  }, [initialGoal]);

  async function handleSet() {
    const parsed = parseFloat(inputVal.replace(/[^0-9.]/g, ''));
    if (isNaN(parsed) || parsed <= 0) return;

    setIsSaving(true);
    try {
      const res = await fetch('/api/targets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year:    cY,
          month:   cM,
          targets: { expense_limit: parsed },
        }),
      });
      if (res.ok) {
        setGoal(parsed);
        setEditing(false);
        setInputVal('');
      }
    } catch {
      // Silently fail — goal remains unchanged
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClear() {
    setIsSaving(true);
    try {
      await fetch('/api/targets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year:    cY,
          month:   cM,
          targets: { expense_limit: 0 },
        }),
      });
      setGoal(null);
      setEditing(false);
      setInputVal('');
    } catch {
      // Silently fail
    } finally {
      setIsSaving(false);
    }
  }

  const pct    = goal && goal > 0 ? Math.min(100, (totalExp / goal) * 100) : 0;
  const over   = goal !== null && totalExp > goal;
  const barClr = over ? 'var(--rd)' : pct > 80 ? 'var(--or)' : 'var(--gr)';

  return (
    <div className="cc" style={{ padding: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t2)' }}>
          EXPENSE GOAL — {MS[cM]} {cY}
        </div>
        {!editing ? (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className="btn btn-g btn-sm"
              style={{ fontSize: '9px', padding: '2px 7px' }}
              onClick={() => { setInputVal(goal ? String(goal) : ''); setEditing(true); }}
              disabled={isSaving}
            >
              {goal ? 'Edit' : 'Set'}
            </button>
            {goal && (
              <button
                className="btn btn-rd btn-sm"
                style={{ fontSize: '9px', padding: '2px 7px' }}
                onClick={handleClear}
                disabled={isSaving}
                title="Clear goal"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <input
              type="number"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSet()}
              placeholder="e.g. 50000"
              style={{ width: '90px', fontSize: '11px', padding: '2px 6px', border: '1px solid var(--bdr)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--tx)' }}
              autoFocus
              disabled={isSaving}
            />
            <button className="btn btn-or btn-sm" style={{ fontSize: '9px', padding: '2px 7px' }} onClick={handleSet} disabled={isSaving}>
              {isSaving ? '…' : '✓'}
            </button>
            <button className="btn btn-g btn-sm" style={{ fontSize: '9px', padding: '2px 7px' }} onClick={() => setEditing(false)} disabled={isSaving}>✕</button>
          </div>
        )}
      </div>
      {goal ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
            <span style={{ color: over ? 'var(--rd)' : 'var(--tx)', fontWeight: 600 }}>{fIN(totalExp)}</span>
            <span style={{ color: 'var(--t3)' }}>of {fIN(goal)}</span>
          </div>
          <div style={{ background: 'var(--s2)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
            <div style={{ width: pct + '%', height: '100%', background: barClr, borderRadius: '4px', transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '10px', color: over ? 'var(--rd)' : 'var(--t3)', marginTop: '3px', textAlign: 'right' }}>
            {over ? `⚠ Over by ${fIN(totalExp - goal)}` : `${pct.toFixed(1)}% used`}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '6px 0' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--t3)' }}>Not set</div>
          <div style={{ fontSize: '10.5px', color: 'var(--t3)' }}>Click Set to add a monthly goal</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardClientProps {
  reports: SerializableReport[];
  properties: SerializableProperty[];
  initialExpenseGoal: number;
  goalMonth: number;
  goalYear: number;
}


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardClient({ reports, properties, initialExpenseGoal, goalMonth, goalYear }: DashboardClientProps) {
  // ── Period state ──────────────────────────────────────────────────────────
  const { getFilteredReps, getFilteredRepsForMonth, ...periodState } = usePeriod();
  const { cM, cY } = periodState;

  // ── Per-page filters (URL params) ─────────────────────────────────────────
  const filters = usePageFilters({ city: true, property: true });

  // ── Build prop lookup map ─────────────────────────────────────────────────
  const propMap = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p])),
    [properties],
  );
  const propById = (pid: string): PropLookup | null =>
    propMap[pid]
      ? { id: pid, city: propMap[pid].city, comm: propMap[pid].comm }
      : null;

  const allReps = reports as RepRow[];

  const pageFilterState = useMemo(
    () => ({ cCi: filters.city, cPid: filters.property, cComm: 'all' }),
    [filters.city, filters.property],
  );

  // ── Filtered reps for current period ──────────────────────────────────────
  const filteredReps = useMemo(
    () => getFilteredReps(allReps, propById, pageFilterState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allReps, propMap, pageFilterState,
     periodState.cPType, periodState.cM, periodState.cY,
     periodState.cQ, periodState.cFY, periodState.cDateFrom, periodState.cDateTo,
     periodState.cDay, periodState.cWeek],
  );

  // ── Aggregate for current period ──────────────────────────────────────────
  const agg = useMemo(() => {
    const raw = aggReps(filteredReps, (pid) => propMap[pid]?.capital ?? 0);
    return withD(raw);
  }, [filteredReps, propMap]);

  // ── Empty state ───────────────────────────────────────────────────────────
  const isEmpty = !agg || (agg.rev === 0 && agg.exp === 0);

  // ── Trend data for charts (6 months) ──────────────────────────────────────
  const trendPeriods = useMemo(
    () => getPeriodMonths(6, periodState as PeriodState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodState.cPType, periodState.cM, periodState.cY, periodState.cQ,
     periodState.cFY, periodState.cDateFrom, periodState.cDateTo],
  );

  const trend = useMemo(() => {
    return trendPeriods.map(({ m, y, l }: { m: number; y: number; l: string }) => {
      const rs = getFilteredRepsForMonth(allReps, propById, m, y, pageFilterState);
      const ta = withD(aggReps(rs, (pid) => propMap[pid]?.capital ?? 0));
      return { l, rev: ta?.rev ?? 0, exp: ta?.exp ?? 0, op: ta?.opProfit ?? 0, occ: ta?.occ ?? 0, m, y };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendPeriods, allReps, propMap, pageFilterState]);

  const revenueTrend: RevenueTrendPoint[] = trend;
  const occupancyTrend: OccupancyTrendPoint[] = trend;

  // ── Channel aggregation ───────────────────────────────────────────────────
  const chanAgg = useMemo(() => {
    const agg: Record<string, number> = {};
    filteredReps.forEach((r: RepRow) => {
      if (r.channels && typeof r.channels === 'object') {
        Object.entries(r.channels).forEach(([k, v]: [string, number]) => {
          agg[k] = (agg[k] ?? 0) + v;
        });
      }
    });
    return agg;
  }, [filteredReps]);

  // ── Property revenue ──────────────────────────────────────────────────────
  const propRevs = useMemo(() => {
    const map: Record<string, number> = {};
    filteredReps.forEach((r: RepRow) => { map[r.pid] = (map[r.pid] ?? 0) + r.rev; });
    return Object.entries(map)
      .map(([pid, rev]) => ({ name: propMap[pid]?.name ?? 'Unknown', rev }))
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 8);
  }, [filteredReps, propMap]);

  // ── Derived display values ────────────────────────────────────────────────
  const totalNights = filteredReps.reduce((s: number, r: RepRow) => s + (r.nights ?? 0), 0);
  const activeProps = new Set(filteredReps.map((r: RepRow) => r.pid)).size;

  // Secured assets total — sum of all asset amounts across all properties
  const securedAssetsTotal = properties.reduce((sum, p) => {
    const propAssets = p.assets ?? [];
    return sum + propAssets.reduce((s, a) => s + (a.amount ?? 0), 0);
  }, 0);

  // Expense ratio for info card
  const expRatio = agg && agg.rev > 0
    ? ((agg.exp / agg.rev) * 100).toFixed(1)
    : '0';

  // Commission split % (for donut)
  const commPct = agg && agg.opProfit > 0
    ? +((agg.commission / agg.opProfit) * 100).toFixed(1)
    : 0;
  const invPct = agg && agg.opProfit > 0
    ? +((agg.invProfit / agg.opProfit) * 100).toFixed(1)
    : 0;

  // ── Build city/property options for PageFilterBar ─────────────────────────
  const cityOptions = useMemo(
    () => [...new Set(properties.map((p) => p.city).filter(Boolean))].sort()
      .map((c) => ({ value: c, label: c })),
    [properties],
  );
  const propOptions = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <>
        <PageFilterBar filters={filters} config={{ city: true, property: true }} cities={cityOptions} properties={propOptions} />
        <div id="d-empty" className="es">
          <div className="es-ico">📊</div>
          <div className="es-t">No Data for This Period</div>
          <div className="es-s">Upload a report or add data manually.</div>
          <Link href="/bookings" className="btn btn-or">+ Add Booking</Link>
        </div>
      </>
    );
  }

  return (
    <div id="d-content">
      <PageFilterBar filters={filters} config={{ city: true, property: true }} cities={cityOptions} properties={propOptions} />

      {/* ── Metric cards (12 cards including Secured Assets) ──────────────── */}
      <MetricCardGrid>
        <MetricCard accent label="Total Revenue"       value={fI(agg!.rev)}       sub="Gross booking revenue"                           iconText="₹"  iconVariant="w" />
        <MetricCard       label="Operating Profit"     value={fI(agg!.opProfit)}   sub={agg!.margin + '% of revenue'}                    iconText="✓"  iconVariant="g" />
        <MetricCard       label="Total Expenses"       value={fI(agg!.exp)}        sub={agg!.rev > 0 ? expRatio + '% of revenue' : ''}   iconText="↓"  iconVariant="r" />
        <MetricCard       label="MehmanGhar Commission" value={agg!.opProfit > 0 ? fI(agg!.commission) : '₹0.00'} sub={agg!.opProfit > 0 ? agg!.commPct + '% of op. profit' : 'No commission on loss'} iconText="%" iconVariant="o" />
        <MetricCard       label="Investor Payout"      value={fI(agg!.invProfit)}  sub={agg!.invPct + '% of op. profit'}                 iconText="→"  iconVariant="b" />
        <MetricCard       label="Occupancy"            value={agg!.occ + '%'}      sub={agg!.occ >= 75 ? '✓ On target' : '⚠ Below 75% target'} iconText="◉" iconVariant="go" />
        <MetricCard       label="ADR"                  value={fIN(agg!.adr ?? 0)}  sub="Avg Daily Rate (room only)"                      iconText="⌂"  iconVariant="b" />
        <MetricCard       label="RevPAR"               value={fIN(agg!.revpar ?? 0)} sub="Rev per available room-night"                  iconText="▤"  iconVariant="g" />
        <MetricCard       label="Active Properties"    value={String(activeProps)} sub={activeProps + ' active properties'}               iconText="🏠" iconVariant="o" />
        <MetricCard       label="Total Nights"         value={String(totalNights)} sub="Booked this period"                               iconText="🌙" iconVariant="b" />
        <MetricCard       label="Avg ROI"              value={agg!.roiDisplay ?? agg!.roi + '%'} sub={agg!._hasCapital ? 'On investor capital' : 'Capital not entered'} iconText="%" iconVariant="o" />
        <MetricCard       label="Secured Assets"       value={fIN(securedAssetsTotal)} sub="Deposits + advances (recoverable)"           iconText="🔒" iconVariant="g" />
      </MetricCardGrid>

      {/* ── Info cards row: Total Expenses + Expense Goal ──────────────────── */}
      <div className="rg2" style={{ marginBottom: '16px' }}>
        {/* Total Expenses */}
        <div className="cc" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--rd)', marginBottom: '4px' }}>TOTAL EXPENSES</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--rd)', lineHeight: 1 }}>{fIN(agg!.exp)}</div>
          <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '4px' }}>{expRatio}% of revenue</div>
        </div>

        {/* Expense goal — DB-persisted via /api/targets */}
        <ExpenseGoalCard cM={goalMonth} cY={goalYear} totalExp={agg!.exp} fIN={fIN} initialGoal={initialExpenseGoal} />
      </div>

      {/* ── .crow.r2: Revenue chart + Commission donut ──────────────────────── */}
      <div className="crow r2">
        <div className="cc">
          <div className="ch">
            <div>
              <div className="ct">Revenue vs Expenses vs Op. Profit</div>
              <div className="cs">Monthly trend · correct commission formula</div>
            </div>
          </div>
          <RevenueChart trend={revenueTrend} />
        </div>
        <div className="cc">
          <div className="ch">
            <div>
              <div className="ct">Commission Split</div>
              <div className="cs">% of Operating Profit</div>
            </div>
          </div>
          <CommissionDonut commPct={commPct} invPct={invPct} />
        </div>
      </div>

      {/* ── .crow.r3: Occupancy + Channels + Property Revenue ───────────────── */}
      <div className="crow r3">
        <div className="cc">
          <div className="ch">
            <div>
              <div className="ct">Occupancy Trend</div>
              <div className="cs">6-month rolling</div>
            </div>
          </div>
          <OccupancyChart trend={occupancyTrend} />
        </div>

        <div className="cc">
          <div className="ch">
            <div>
              <div className="ct">Booking Channels</div>
              <div className="cs">
                {Object.keys(chanAgg).length ? 'From report data' : 'No channel data'}
              </div>
            </div>
          </div>
          {Object.keys(chanAgg).length > 0 && (
            <ChannelsDonut chanAgg={chanAgg} />
          )}
        </div>

        <div className="cc">
          <div className="ch">
            <div>
              <div className="ct">Property Revenue</div>
              <div className="cs">Top performers</div>
            </div>
          </div>
          {propRevs.length > 0 && (
            <PropertyRevBar propRevs={propRevs} />
          )}
        </div>
      </div>

    </div>
  );
}