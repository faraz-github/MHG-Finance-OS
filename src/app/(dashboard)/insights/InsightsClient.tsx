'use client';
// src/app/(dashboard)/insights/InsightsClient.tsx
//
// Client Component. Re-derives all insight data whenever the period/filter
// state changes.
//
// Renders (pixel-matched to HTML #page-insights):
//   1. Empty state when no revenue data
//   2. Targets panel — four fields, saved to UtilsSetting via /api/targets
//   3. Property performance vs targets cards (when targets set)
//   4. Smart Insights Engine grid (.isg) — genInsights() verbatim port
//   5. .crow.re: Portfolio Performance Radar + ADR vs RevPAR Trend
//
// HTML source: rndInsights(), genInsights(), saveTargets()
//
// Targets storage: HTML used localStorage keyed by `mhg_targets_${cY}_${cM}`.
// Full-stack uses UtilsSetting table (key = `targets_${year}_${month}`) via
// POST /api/targets. No schema change needed — UtilsSetting is already in schema.

import { useState, useMemo, useEffect, useTransition } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePeriod } from '@/hooks/usePeriod';
import { usePageFilters } from '@/hooks/usePageFilters';
import { PageFilterBar } from '@/components/layout/PageFilterBar';
import type { FilterOption } from '@/components/layout/PageFilterBar';
import { aggReps, withD, getFYMonths } from '@/lib/period';
import type { RepRow, PeriodState } from '@/lib/period';
import { useToast } from '@/components/ui/Toast';
import styles from '@/components/ui/ui.module.css';
import type { SerializableReport } from '../dashboard/page';

// ---------------------------------------------------------------------------
// Minimal property type — insights needs id, name, city, comm, capital
// ---------------------------------------------------------------------------

export interface InsightsProperty {
  id:      string;
  name:    string;
  city:    string;
  comm:    number;
  capital: number;
}

const InsightCharts = dynamic(
  () => import('./InsightCharts').then((m) => ({ default: m.InsightCharts })),
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
// getPeriodMonths — verbatim port (same pattern as DashboardClient)
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
// genInsights — verbatim port of genInsights() from the HTML
// ---------------------------------------------------------------------------

interface InsightItem {
  c: string;
  t: string;
}

type AggResult = NonNullable<ReturnType<typeof withD>>;

function genInsights(
  rs: RepRow[],
  a: AggResult,
  propMap: Record<string, InsightsProperty>,
): InsightItem[] {
  const ins: InsightItem[] = [];

  // Occupancy vs 75% target
  if (a.occ < 75)
    ins.push({ c: '#D97706', t: `<strong>⚠ Occupancy below target</strong> — ${a.occ}% vs 75% target. Dynamic pricing recommended.` });
  else
    ins.push({ c: '#16A34A', t: `<strong>✓ Occupancy on target</strong> — ${a.occ}% meets 75% benchmark.` });

  // Expense ratio vs 20% benchmark
  const er = a.rev > 0 ? (a.exp / a.rev * 100).toFixed(1) : '0';
  if (Number(er) > 20)
    ins.push({ c: '#DC2626', t: `<strong>⚠ Expenses high</strong> — ${er}% of revenue exceeds 20% benchmark.` });
  else
    ins.push({ c: '#16A34A', t: `<strong>✓ Expenses healthy</strong> — ${er}% within 20% benchmark.` });

  // ROI vs 25% target
  if (a.roi >= 25)
    ins.push({ c: '#16A34A', t: `<strong>✓ Strong ROI ${a.roi}%</strong> — Outperforming market 22% benchmark.` });
  else
    ins.push({ c: '#D97706', t: `<strong>⚠ ROI ${a.roi}%</strong> — Below 25% target. Review pricing.` });

  // Top performer (by revenue)
  const sorted = [...rs].sort((a, b) => b.rev - a.rev);
  const top = sorted[0];
  if (top) {
    const p = propMap[top.pid];
    ins.push({ c: '#16A34A', t: `<strong>🏆 Top Property: ${p?.name ?? '—'}</strong> — ${fI(top.rev)} revenue this period.` });
  }

  // Underperformer (by ROI, only if multiple properties)
  if (rs.length > 1) {
    const low = [...rs].sort((a, b) => (a.roi ?? 0) - (b.roi ?? 0))[0];
    if (low) {
      const p = propMap[low.pid];
      ins.push({ c: '#DC2626', t: `<strong>⬇ Underperforming: ${p?.name ?? '—'}</strong> — ROI ${low.roi ?? 0}%.` });
    }
  }

  // Commission split
  ins.push({ c: '#2563EB', t: `<strong>Commission:</strong> ${a.commPct}% of op. profit to MehmanGhar, ${a.invPct}% to investors.` });

  return ins;
}

// ---------------------------------------------------------------------------
// Targets type
// ---------------------------------------------------------------------------

interface Targets {
  revenue: number;
  occupancy: number;
  roi: number;
  expense_limit: number;
}

const BLANK_TARGETS: Targets = { revenue: 0, occupancy: 0, roi: 0, expense_limit: 0 };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InsightsClientProps {
  reports: SerializableReport[];
  properties: InsightsProperty[];
  /** Server-fetched targets for current month/year. Empty object if none. */
  initialTargets: Partial<Targets>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InsightsClient({
  reports,
  properties,
  initialTargets,
}: InsightsClientProps) {
  const { toast } = useToast();
  const [isSavingTargets, setIsSavingTargets] = useTransition();

  // ── Period store ──────────────────────────────────────────────────────────
  const { getFilteredReps, getFilteredRepsForMonth, ...periodState } = usePeriod();
  const { cM, cY } = periodState;
  const filters = usePageFilters({ city: true, property: true });

  const allReps = reports as RepRow[];

  // ── Targets form state ────────────────────────────────────────────────────
  const [targets, setTargets] = useState<Targets>({
    ...BLANK_TARGETS,
    ...initialTargets,
  });

  useEffect(() => {
    setTargets({ ...BLANK_TARGETS, ...initialTargets });
  }, [initialTargets]);

  // ── Property lookup ───────────────────────────────────────────────────────
  const propMap = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p])),
    [properties],
  );

  const propById = useMemo(
    () => (pid: string) =>
      propMap[pid] ? { id: pid, city: propMap[pid].city, comm: propMap[pid].comm } : null,
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

  // ── Filtered reps for current period ──────────────────────────────────────
  const filteredReps = useMemo(
    () => getFilteredReps(allReps, propById, pageFilterState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allReps, propById, pageFilterState, periodState.cPType, periodState.cM, periodState.cY,
     periodState.cQ, periodState.cFY, periodState.cDateFrom, periodState.cDateTo,
     periodState.cDay, periodState.cWeek],
  );

  // capital lookup for aggReps — ensures ROI is calculated correctly
  const getCapital = useMemo(
    () => (pid: string) => propMap[pid]?.capital ?? 0,
    [propMap],
  );

  const agg = useMemo(
    () => withD(aggReps(filteredReps, getCapital)),
    [filteredReps, getCapital],
  );

  // ── Trend periods for charts ──────────────────────────────────────────────
  const trendPeriods = useMemo(
    () => getPeriodMonths(6, periodState as PeriodState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodState.cPType, periodState.cM, periodState.cY, periodState.cQ,
     periodState.cFY, periodState.cDateFrom, periodState.cDateTo],
  );

  // ADR vs RevPAR trend — verbatim from rndInsights() tAdr block
  const adrTrend = useMemo(() => {
    return trendPeriods.map(({ m, y, l }) => {
      const rs = getFilteredRepsForMonth(allReps, propById, m, y, pageFilterState);
      const totalRoomRev = rs.reduce((s, r) => s + (r.roomRev ?? r.rev ?? 0), 0);
      const totalNights  = rs.reduce((s, r) => s + (r.nights ?? 0), 0);
      const totalDays    = rs.reduce((s, r) => s + (r.days   ?? 0), 0);
      const adr    = totalNights > 0 ? totalRoomRev / totalNights : 0;
      const revpar = totalDays   > 0 ? totalRoomRev / totalDays   : 0;
      const lbl = l + (y !== cY ? ' ' + String(y).slice(2) : '');
      return { l: lbl, adr, rv: revpar };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendPeriods, allReps, propMap, pageFilterState]);

  // Radar scores — verbatim normalisation from rndInsights()
  const radarScores = useMemo(() => {
    if (!agg) return null;
    const occRaw     = agg.days > 0 ? (agg.nights / agg.days) * 100 : 0;
    const occS       = Math.min(Math.max(0, occRaw), 100);
    const roiRaw     = agg._hasCapital ? agg.roi : 0;
    const roiS       = Math.min(100, Math.max(0, ((roiRaw + 10) / 40) * 100));
    const margRaw    = agg.rev > 0 ? (agg.opProfit / agg.rev) * 100 : 0;
    const margS      = Math.min(100, Math.max(0, margRaw));
    const expCtrlRaw = agg.rev > 0 ? (1 - agg.exp / agg.rev) * 100 : 0;
    const expS       = Math.min(100, Math.max(0, expCtrlRaw));

    // Growth: compare to previous month
    let growthS = 50;
    {
      let pm = cM - 1; let py = cY;
      if (pm <= 0) { pm += 12; py--; }
      const prevRs  = getFilteredRepsForMonth(allReps, propById, pm, py, pageFilterState);
      const prevA   = aggReps(prevRs, getCapital);
      if (prevA && prevA.rev > 0) {
        const growthRaw = ((agg.rev - prevA.rev) / prevA.rev) * 100;
        growthS = Math.min(100, Math.max(0, (growthRaw + 50) / 100 * 100));
      }
    }

    const propsWithRev = new Set(filteredReps.filter((r) => r.rev > 0).map((r) => r.pid)).size;
    const totalProps   = properties.length || 1;
    const divS         = Math.min(100, (propsWithRev / totalProps) * 100);

    return {
      data: [
        +occS.toFixed(1), +roiS.toFixed(1), +margS.toFixed(1),
        +expS.toFixed(1), +growthS.toFixed(1), +divS.toFixed(1),
      ],
      raw: { occRaw, roiRaw, margRaw, expCtrlRaw, propsWithRev, totalProps },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agg, filteredReps, allReps, propMap, getCapital, cM, cY]);

  // ── Insight cards ─────────────────────────────────────────────────────────
  const insights = useMemo(
    () => agg ? genInsights(filteredReps, agg, propMap) : [],
    [filteredReps, agg, propMap],
  );

  // ── Target save — POST /api/targets ──────────────────────────────────────
  async function handleSaveTargets() {
    try {
      const res = await fetch('/api/targets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: cY, month: cM, targets }),
      });
      if (!res.ok) {
        toast('Failed to save targets', 'er');
        return;
      }
      toast(`✓ Targets saved for ${MS[cM]} ${cY}`, 'ok');
    } catch {
      toast('Network error — please try again', 'er');
    }
  }

  // ── Targets set? ──────────────────────────────────────────────────────────
  const targetsSet = targets.revenue > 0 || targets.occupancy > 0 ||
                     targets.roi > 0 || targets.expense_limit > 0;

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!agg || (!agg.rev && !agg.exp)) {
    return (
      <>
        <PageFilterBar filters={filters} config={{ city: true, property: true }} cities={cityOptions} properties={propOptions} />
        <div id="ins-empty" className="es">
          <div className="es-ico">💡</div>
          <div className="es-t">No Insights Yet</div>
          <div className="es-s">Add bookings and expenses to generate insights.</div>
          <Link href="/bookings" className="btn btn-or">+ Add Booking</Link>
        </div>
      </>
    );
  }

  const propPids = [...new Set(filteredReps.map((r) => r.pid))];

  return (
    <div id="ins-content">
      <PageFilterBar filters={filters} config={{ city: true, property: true }} cities={cityOptions} properties={propOptions} />
      <div className="cc" style={{ marginBottom: '16px', border: '1.5px solid var(--or)', background: 'var(--orp)' }}>
        <div className="ch">
          <div>
            <div className="ct" style={{ color: 'var(--or)' }}>
              🎯 Monthly Targets — {MS[cM]} {cY}
            </div>
            <div className="cs">Set targets and track property performance</div>
          </div>
          <button
            className="btn btn-or btn-sm"
            onClick={handleSaveTargets}
            disabled={isSavingTargets}
          >
            Save Targets
          </button>
        </div>
        <div className="rg4" style={{ marginTop: '8px' }}>
          <div className={styles.fl}>
            <label>Revenue Target (₹)</label>
            <input
              className={styles.fi}
              type="number"
              value={targets.revenue || ''}
              onChange={(e) => setTargets((t) => ({ ...t, revenue: +e.target.value || 0 }))}
              placeholder="e.g. 1000000"
              style={{ fontSize: '12px' }}
            />
          </div>
          <div className={styles.fl}>
            <label>Occupancy Target (%)</label>
            <input
              className={styles.fi}
              type="number"
              value={targets.occupancy || ''}
              onChange={(e) => setTargets((t) => ({ ...t, occupancy: +e.target.value || 0 }))}
              placeholder="e.g. 80"
              min={0} max={100}
              style={{ fontSize: '12px' }}
            />
          </div>
          <div className={styles.fl}>
            <label>ROI Target (%)</label>
            <input
              className={styles.fi}
              type="number"
              value={targets.roi || ''}
              onChange={(e) => setTargets((t) => ({ ...t, roi: +e.target.value || 0 }))}
              placeholder="e.g. 12"
              style={{ fontSize: '12px' }}
            />
          </div>
          <div className={styles.fl}>
            <label>Expense Limit (₹)</label>
            <input
              className={styles.fi}
              type="number"
              value={targets.expense_limit || ''}
              onChange={(e) => setTargets((t) => ({ ...t, expense_limit: +e.target.value || 0 }))}
              placeholder="e.g. 300000"
              style={{ fontSize: '12px' }}
            />
          </div>
        </div>
      </div>

      {/* ── Property performance vs targets (only when targets are set) ─── */}
      {targetsSet && (
        <div style={{ marginBottom: '16px' }}>
          <div className="stl"><div className="d" />Property Performance vs Targets</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '10px', marginBottom: '6px' }}>
            {propPids.map((pid) => {
              const prop = propMap[pid];
              if (!prop) return null;
              const pReps = filteredReps.filter((r) => r.pid === pid);
              const pa = withD(aggReps(pReps, getCapital));
              if (!pa) return null;

              // Build status rows — same logic as HTML tgtHtml block
              const statuses: Array<{
                label: string; val: string; target: string;
                pct: number; met: boolean;
              }> = [];

              if (targets.revenue > 0) {
                const met = pa.rev >= targets.revenue;
                statuses.push({
                  label: 'Revenue', val: fIN(pa.rev), target: fIN(targets.revenue),
                  pct: Math.min(100, Math.round(pa.rev / targets.revenue * 100)), met,
                });
              }
              if (targets.occupancy > 0) {
                const met = (pa.occ ?? 0) >= targets.occupancy;
                statuses.push({
                  label: 'Occupancy', val: (pa.occ ?? 0) + '%', target: targets.occupancy + '%',
                  pct: Math.min(100, Math.round((pa.occ ?? 0) / targets.occupancy * 100)), met,
                });
              }
              if (targets.roi > 0 && pa._hasCapital) {
                const met = (pa.roi ?? 0) >= targets.roi;
                statuses.push({
                  label: 'ROI', val: pa._hasCapital ? (pa.roi ?? 0).toFixed(2) + '%' : 'N/A', target: targets.roi + '%',
                  pct: Math.min(100, Math.round(Math.max(0, pa.roi ?? 0) / targets.roi * 100)), met,
                });
              }
              if (targets.expense_limit > 0) {
                const met = pa.exp <= targets.expense_limit;
                statuses.push({
                  label: 'Expenses', val: fIN(pa.exp), target: '≤' + fIN(targets.expense_limit),
                  pct: Math.min(100, Math.round(pa.exp / targets.expense_limit * 100)), met,
                });
              }

              const allMet = statuses.length > 0 && statuses.every((s) => s.met);

              return (
                <div key={pid} className="cc" style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--or)' }}>{prop.name}</div>
                    {allMet
                      ? <span style={{ background: 'var(--grp)', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 700 }}>✅ Target Achieved</span>
                      : <span style={{ background: 'var(--rdp)', color: '#991B1B', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 700 }}>⚠ Needs Attention</span>
                    }
                  </div>
                  {statuses.map((s) => (
                    <div key={s.label} style={{ marginBottom: '7px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--t2)' }}>{s.label}</span>
                        <span style={{ color: 'var(--t3)' }}>{s.val} / {s.target}</span>
                      </div>
                      <div style={{ height: '6px', background: 'var(--s2)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${s.pct}%`,
                          background: s.met ? 'var(--gr)' : 'var(--rd)',
                          borderRadius: '3px', transition: 'width .3s',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Smart Insights Engine grid ────────────────────────────────────── */}
      <div className="stl"><div className="d" />Smart Insights Engine</div>

      <div className="isg" id="insGrid">
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

      {/* ── .crow.re: Radar + ADR/RevPAR charts ──────────────────────────── */}
      {radarScores && (
        <InsightCharts
          radarData={radarScores.data}
          radarRaw={radarScores.raw}
          adrTrend={adrTrend}
        />
      )}

    </div>
  );
}