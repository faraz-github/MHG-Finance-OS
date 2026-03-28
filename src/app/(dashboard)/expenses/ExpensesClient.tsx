'use client';
// src/app/(dashboard)/expenses/ExpensesClient.tsx
//
// Client Component. Re-derives all expense analysis whenever the
// period/filter state changes.
//
// Renders (pixel-matched to HTML #page-expenses):
//   - Empty state when no expense data
//   - View toggle: Overall Portfolio | Property-wise + property select
//   - 4 KPI metric cards (Total Expenses, % of Revenue, vs Previous, Largest Cat)
//   - .crow.r3: Category Doughnut + Expense/Revenue Trend bar
//   - Expense Insights grid (.isg)
//   - Property Expense Comparison table
//
// HTML source: rndExpenses(), genExpInsights(), rndExpPropTable(),
//              getPrevPeriodReps(), aggExpCats(), expLabel(), expColor()

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePeriod } from '@/hooks/usePeriod';
import { usePageFilters } from '@/hooks/usePageFilters';
import { downloadCsv } from '@/lib/csvDownload';
import { PageFilterBar } from '@/components/layout/PageFilterBar';
import type { FilterOption } from '@/components/layout/PageFilterBar';
import { aggReps, withD, getFYMonths } from '@/lib/period';
import type { RepRow, PeriodState } from '@/lib/period';
import { MetricCard, MetricCardGrid } from '@/components/ui/MetricCard';
import { aggExpCats, expLabel, expColor, EXP_DEFAULT_CATS } from './expUtils';
import type { ExpTrendPoint } from './ExpenseCharts';
import type { SerializableReport } from '../dashboard/page';

// ---------------------------------------------------------------------------
// Minimal property type — expenses only needs id, name, city, comm, capital
// ---------------------------------------------------------------------------

export interface ExpensesProperty {
  id:      string;
  name:    string;
  city:    string;
  comm:    number;
  capital: number;
}

const ExpenseCharts = dynamic(
  () => import('./ExpenseCharts').then((m) => ({ default: m.ExpenseCharts })),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fI(n: number): string {
  if (!n && n !== 0) return '₹0.00';
  const v = Math.abs(n);
  if (v >= 100000) return (n < 0 ? '-' : '') + '₹' + (v / 100000).toFixed(2) + 'L';
  if (v >= 1000)   return (n < 0 ? '-' : '') + '₹' + (v / 1000).toFixed(2) + 'K';
  return (n < 0 ? '-' : '') + '₹' + v.toFixed(2);
}
const fIN = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ---------------------------------------------------------------------------
// getPeriodMonths (verbatim — same as Insights/Dashboard)
// ---------------------------------------------------------------------------

const Q_MONTHS: Record<number, number[]> = {
  1: [4,5,6], 2: [7,8,9], 3: [10,11,12], 4: [1,2,3],
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
// getPrevPeriodReps — verbatim port (propById passed through)
// ---------------------------------------------------------------------------

type PropByIdFn = (pid: string) => { id: string; city: string; comm: number } | null;

function getPrevReps(
  period: PeriodState,
  allReps: RepRow[],
  getForMonth: (reps: RepRow[], propById: PropByIdFn, m: number, y: number) => RepRow[],
  propById: PropByIdFn,
): RepRow[] {
  const { cPType, cM, cY, cQ, cFY } = period;
  switch (cPType) {
    case 'monthly': {
      let pm = cM - 1; let py = cY;
      if (pm < 1) { pm = 12; py--; }
      return getForMonth(allReps, propById, pm, py);
    }
    case 'quarterly': {
      const pq  = cQ === 1 ? 4 : cQ - 1;
      const pqy = cQ === 1 ? cFY - 1 : cFY;
      const months = Q_MONTHS[pq] ?? [];
      const yr = pq === 4 ? pqy + 1 : pqy;
      return months.flatMap((m) => getForMonth(allReps, propById, m, yr));
    }
    case 'fy': {
      const prevFY = getFYMonths(cFY - 1);
      return prevFY.flatMap(({ month: m, year: y }) =>
        getForMonth(allReps, propById, m, y),
      );
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// genExpInsights — verbatim port
// ---------------------------------------------------------------------------

type AggResult = NonNullable<ReturnType<typeof withD>>;

interface InsightItem { c: string; t: string; }

function genExpInsights(
  rs: RepRow[],
  a: AggResult,
  cats: Record<string, number>,
  prevA: AggResult | null,
  propMap: Record<string, ExpensesProperty>,
): InsightItem[] {
  const ins: InsightItem[] = [];
  const expPct = a.rev > 0 ? +((a.exp / a.rev) * 100).toFixed(1) : 0;

  if (expPct > 30)
    ins.push({ c: '#DC2626', t: `<strong>🚨 Critical: Expenses at ${expPct}%</strong> of revenue — far exceeds 20% benchmark. Immediate review required.` });
  else if (expPct > 20)
    ins.push({ c: '#D97706', t: `<strong>⚠ Expenses at ${expPct}%</strong> of revenue — above 20% benchmark.` });
  else
    ins.push({ c: '#16A34A', t: `<strong>✓ Expense ratio healthy</strong> at ${expPct}% — within 20% benchmark.` });

  if (prevA && prevA.exp > 0) {
    const chg = +((a.exp - prevA.exp) / prevA.exp * 100).toFixed(1);
    if (chg > 25)
      ins.push({ c: '#DC2626', t: `<strong>Expense spike: +${chg}%</strong> vs previous period. ${fI(a.exp - prevA.exp)} more than last period.` });
    else if (chg > 10)
      ins.push({ c: '#D97706', t: `<strong>Expenses increased ${chg}%</strong> vs previous period.` });
    else if (chg < -10)
      ins.push({ c: '#16A34A', t: `<strong>Expenses reduced ${Math.abs(chg)}%</strong> vs previous period. Good cost control.` });
  }

  const hasCatData = Object.values(cats).some((v) => v > 0);
  if (hasCatData) {
    const sorted = Object.entries(cats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [topCat, topVal] = sorted[0];
      const topPct = a.exp > 0 ? +((topVal / a.exp) * 100).toFixed(0) : 0;
      ins.push({ c: '#F4521E', t: `<strong>${expLabel(topCat)} is largest expense</strong> at ${topPct}% of total (${fI(topVal)}).` });
    }
    const pfVal = cats['platform-fees'] ?? 0;
    if (pfVal > 0 && a.rev > 0) {
      const pfPct = +((pfVal / a.rev) * 100).toFixed(1);
      if (pfPct > 12)
        ins.push({ c: '#D97706', t: `<strong>Platform fees at ${pfPct}%</strong> of revenue — consider direct booking push.` });
    }
  }

  if (rs.length > 1) {
    const propExps = rs
      .map((r) => ({
        name: propMap[r.pid]?.name ?? '?',
        ratio: r.rev > 0 ? +((r.exp / r.rev) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.ratio - a.ratio);
    if (propExps[0] && propExps[0].ratio > 30)
      ins.push({ c: '#DC2626', t: `<strong>Highest expense ratio: ${propExps[0].name}</strong> at ${propExps[0].ratio}% of revenue.` });
  }

  return ins;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExpensesClientProps {
  reports: SerializableReport[];
  properties: ExpensesProperty[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpensesClient({ reports, properties }: ExpensesClientProps) {
  // ── View state ────────────────────────────────────────────────────────────
  const [expView, setExpView]         = useState<'all' | 'property'>('all');
  const [expPropId, setExpPropId]     = useState('');
  const [trendMode, setTrendMode]     = useState<'total' | 'category'>('total');

  // ── Period store + per-page filters ───────────────────────────────────────
  const { getFilteredReps, getFilteredRepsForMonth, ...periodState } = usePeriod();
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

  const getCapital = useMemo(
    () => (pid: string) => propMap[pid]?.capital ?? 0,
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

  // ── Period-filtered reps + optional property-wise view filter ─────────────
  const baseReps = useMemo(
    () => getFilteredReps(allReps, propById, pageFilterState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allReps, propById, pageFilterState, periodState.cPType, periodState.cM, periodState.cY,
     periodState.cQ, periodState.cFY, periodState.cDateFrom, periodState.cDateTo,
     periodState.cDay, periodState.cWeek],
  );

  const filteredReps = useMemo(
    () => expView === 'property' && expPropId
      ? baseReps.filter((r) => r.pid === expPropId)
      : baseReps,
    [baseReps, expView, expPropId],
  );

  // ── Aggregates ────────────────────────────────────────────────────────────
  const agg  = useMemo(
    () => withD(aggReps(filteredReps, getCapital)),
    [filteredReps, getCapital],
  );
  const cats = useMemo(() => aggExpCats(filteredReps), [filteredReps]);

  // Previous period for comparison
  const prevReps = useMemo(
    () => getPrevReps(periodState as PeriodState, allReps, getFilteredRepsForMonth, propById),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allReps, propById, periodState.cPType, periodState.cM, periodState.cY,
     periodState.cQ, periodState.cFY],
  );
  const prevAgg = useMemo(
    () => (prevReps.length ? withD(aggReps(prevReps, getCapital)) : null),
    [prevReps, getCapital],
  );

  // ── Derived values ────────────────────────────────────────────────────────
  const hasCatData    = Object.values(cats).some((v) => v > 0);
  const sortedCats    = Object.entries(cats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  // customKeys = categories not in EXP_DEFAULT_CATS (get extra colours in charts)
  const defaultCatKeys = new Set(EXP_DEFAULT_CATS.map((c) => c.key));
  const customKeys    = sortedCats.map(([k]) => k).filter((k) => !defaultCatKeys.has(k));
  const expPct        = agg && agg.rev > 0 ? +((agg.exp / agg.rev) * 100).toFixed(1) : 0;
  const expChange     = prevAgg && prevAgg.exp > 0 && agg
    ? +((agg.exp - prevAgg.exp) / prevAgg.exp * 100).toFixed(1)
    : null;
  const largestCatKey = sortedCats[0]?.[0] ?? '';
  const largestCatVal = sortedCats[0]?.[1] ?? 0;

  // ── Trend data (up to 12 months) ──────────────────────────────────────────
  const trendPeriods = useMemo(
    () => getPeriodMonths(12, periodState as PeriodState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodState.cPType, periodState.cM, periodState.cY, periodState.cQ,
     periodState.cFY, periodState.cDateFrom, periodState.cDateTo],
  );

  const trendPoints: ExpTrendPoint[] = useMemo(() => {
    return trendPeriods.map(({ m, y, l }) => {
      let prs = getFilteredRepsForMonth(allReps, propById, m, y, pageFilterState);
      if (expView === 'property' && expPropId)
        prs = prs.filter((r) => r.pid === expPropId);
      const pa = withD(aggReps(prs, getCapital));
      const pc = aggExpCats(prs);
      return {
        l,
        rev: pa?.rev ?? 0,
        exp: pa?.exp ?? 0,
        cats: pc,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendPeriods, allReps, propById, getCapital, expView, expPropId, pageFilterState]);

  // ── Insights ──────────────────────────────────────────────────────────────
  const insights = useMemo(
    () => agg ? genExpInsights(filteredReps, agg, cats, prevAgg, propMap) : [],
    [filteredReps, agg, cats, prevAgg, propMap],
  );

  // ── Property comparison table data ────────────────────────────────────────
  const portfolioRatio = agg && agg.rev > 0 ? +((agg.exp / agg.rev) * 100).toFixed(1) : 0;

  const propTableData = useMemo(() => {
    if (!agg) return [];
    return properties
      .map((p) => {
        const pr = baseReps.filter((r) => r.pid === p.id);
        if (!pr.length) return null;
        const pa = withD(aggReps(pr));
        if (!pa) return null;
        const pc      = aggExpCats(pr);
        const ratio   = pa.rev > 0 ? +((pa.exp / pa.rev) * 100).toFixed(1) : 0;
        const vs      = +(ratio - portfolioRatio).toFixed(1);
        const topCat  = Object.entries(pc).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
        return { name: p.name, city: p.city, exp: pa.exp, rev: pa.rev, ratio, vs, topCat };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => b.ratio - a.ratio);
  }, [baseReps, properties, portfolioRatio, agg]);

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!filteredReps.length || !agg || agg.exp === 0) {
    return (
      <>
        <PageFilterBar filters={filters} config={{ city: true, property: true }} cities={cityOptions} properties={propOptions} />
        <div id="exp-empty" className="es">
          <div className="es-ico">📊</div>
          <div className="es-t">No Expense Data for This Period</div>
          <div className="es-s">
            Expense data is derived from saved reports. Add daily expenses or use
            Monthly Entry to record expenses, then reports will generate automatically.
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
            <Link href="/dailyexp" className="btn btn-or">+ Daily Expense</Link>
            <Link href="/monthlyentry" className="btn btn-g">+ Monthly Entry</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <div id="exp-content">
      <PageFilterBar filters={filters} config={{ city: true, property: true }} cities={cityOptions} properties={propOptions} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div className="stl" style={{ marginBottom: 0 }}>
          <div className="d" />Expense Intelligence
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--t2)', fontWeight: 600 }}>View:</span>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <div
              className={`tab${expView === 'all' ? ' active' : ''}`}
              onClick={() => { setExpView('all'); setExpPropId(''); }}
            >
              Overall Portfolio
            </div>
            <div
              className={`tab${expView === 'property' ? ' active' : ''}`}
              onClick={() => setExpView('property')}
            >
              Property-wise
            </div>
          </div>
          {expView === 'property' && (
            <select
              className="fsel"
              value={expPropId}
              onChange={(e) => setExpPropId(e.target.value)}
            >
              <option value="">Select Property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── KPI metric cards ─────────────────────────────────────────────── */}
      <MetricCardGrid>
        <MetricCard
          label="Total Expenses"
          value={fI(agg?.exp ?? 0)}
          sub="This period"
          iconText="↓"
          iconVariant="r"
        />
        <MetricCard
          label="% of Revenue"
          value={expPct + '%'}
          sub={expPct > 20 ? '⚠ Above 20% benchmark' : '✓ Within benchmark'}
          iconText="%"
          iconVariant={expPct > 20 ? 'r' : 'g'}
        />
        <MetricCard
          label="vs Previous Period"
          value={expChange !== null ? (expChange > 0 ? '+' : '') + expChange + '%' : 'N/A'}
          sub={expChange !== null
            ? expChange > 0 ? 'Expenses increased' : 'Expenses decreased'
            : 'No prior data'}
          iconText={expChange !== null && expChange > 0 ? '↑' : '↓'}
          iconVariant={expChange === null ? 'b' : expChange > 5 ? 'r' : expChange < -5 ? 'g' : 'go'}
        />
        <MetricCard
          label="Largest Category"
          value={hasCatData ? expLabel(largestCatKey) : 'No category data'}
          sub={hasCatData ? fI(largestCatVal) + ' spent' : 'Enter categories'}
          iconText="📂"
          iconVariant="o"
        />
      </MetricCardGrid>

      {/* ── .crow.r3: Category donut (1 col) + Trend bar (2 cols) ────────── */}
      <div className="crow r3" style={{ marginBottom: '16px' }}>
        {/* Trend mode toggle rendered inside the chart card header */}
        <ExpenseCharts
          sortedCats={sortedCats}
          customKeys={customKeys}
          trendPoints={trendPoints}
          trendMode={trendMode}
        />
        {/*
          The trend toggle tabs are placed outside ExpenseCharts for clean
          prop flow. They are rendered as an overlay by the parent.
          In the HTML they live inside the .ch header of the trend card.
          Since ExpenseCharts renders its own .ch, we pass trendMode as a
          prop and the toggle below updates it.
        */}
      </div>

      {/* Trend mode toggle (below charts, above insights) */}
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '-8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', color: 'var(--t2)', fontWeight: 600, alignSelf: 'center' }}>Trend:</span>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <div
            className={`tab${trendMode === 'total' ? ' active' : ''}`}
            onClick={() => setTrendMode('total')}
          >
            Total
          </div>
          <div
            className={`tab${trendMode === 'category' ? ' active' : ''}`}
            onClick={() => setTrendMode('category')}
          >
            By Category
          </div>
        </div>
      </div>

      {/* ── Expense Insights grid ─────────────────────────────────────────── */}
      <div className="stl"><div className="d" />Expense Insights</div>
      <div className="isg" id="expInsGrid">
        {insights.map((ins, i) => (
          <div key={i} className="isc">
            <div className="isd" style={{ background: ins.c }} />
            <div
              style={{ fontSize: '12.5px', lineHeight: 1.55 }}
              dangerouslySetInnerHTML={{ __html: ins.t }}
            />
          </div>
        ))}
      </div>

      {/* ── Property Expense Comparison table ─────────────────────────────── */}
      <div className="tw" id="expPropTable" style={{ marginTop: '8px' }}>
        <div className="th">
          <div className="ct">Property Expense Comparison</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="btn btn-g btn-sm" onClick={() => {
              downloadCsv(
                ['Property', 'City', 'Expenses', 'Revenue', 'Exp Ratio%', 'vs Portfolio%', 'Top Category'],
                propTableData.map((p) => [
                  p.name, p.city || '',
                  String(p.exp), String(p.rev),
                  `${p.ratio}%`,
                  `${p.vs > 0 ? '+' : ''}${p.vs}%`,
                  p.topCat ? expLabel(p.topCat[0]) : '',
                ]),
                `mg-expense-intel-${new Date().toISOString().slice(0, 10)}.csv`,
              );
            }}>↓ CSV</button>
            <button className="btn btn-g btn-sm" onClick={async () => {
              const { exportTablePdf } = await import('@/components/layout/exportPdf');
              await exportTablePdf({
                title: 'Expense Intelligence',
                headers: ['Property', 'City', 'Expenses', 'Revenue', 'Exp Ratio', 'vs Portfolio', 'Top Category'],
                rows: propTableData.map((p) => [
                  p.name, p.city || '—',
                  'Rs. ' + p.exp.toLocaleString('en-IN'),
                  'Rs. ' + p.rev.toLocaleString('en-IN'),
                  `${p.ratio}%`,
                  `${p.vs > 0 ? '+' : ''}${p.vs}%`,
                  p.topCat ? expLabel(p.topCat[0]) : '—',
                ]),
                filename: `mg-expense-intel-${new Date().toISOString().slice(0, 10)}.pdf`,
              });
            }}>↓ PDF</button>
          </div>
        </div>
        {propTableData.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--t3)' }}>
            No data
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Expenses</th>
                  <th>Revenue</th>
                  <th>Exp Ratio</th>
                  <th>vs Portfolio</th>
                  <th>Top Category</th>
                </tr>
              </thead>
              <tbody>
                {propTableData.map((p) => {
                  const vsColor = p.vs > 5 ? 'var(--rd)' : p.vs < -5 ? 'var(--gr)' : 'var(--go)';
                  return (
                    <tr key={p.name}>
                      <td>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{p.name}</div>
                        {p.city && (
                          <div style={{ fontSize: '10.5px', color: 'var(--t3)' }}>{p.city}</div>
                        )}
                      </td>
                      <td style={{ color: 'var(--rd)', fontWeight: 700 }}>{fIN(p.exp)}</td>
                      <td>{fIN(p.rev)}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: p.ratio > 20 ? 'var(--rd)' : 'var(--gr)' }}>
                          {p.ratio}%
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: vsColor }}>
                          {p.vs > 0 ? '+' : ''}{p.vs}%
                        </span>
                      </td>
                      <td>
                        {p.topCat
                          ? <span className="pill o">{expLabel(p.topCat[0])}</span>
                          : <span style={{ color: 'var(--t3)' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}