'use client';
// src/app/(dashboard)/expenses/ExpenseCharts.tsx
//
// Two charts for the Expense Intelligence page — dynamically imported.
//   cExpCat   : doughnut — Category Breakdown (% of total expenses)
//   cExpTrend : bar      — Expense vs Revenue (total or stacked by category)
//
// Verbatim port of the cExpCat / cExpTrend charts from rndExpenses() in HTML.

import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { CHART_DEFAULTS, ANIMATION, legendConfig } from '@/components/charts/chartUtils';
import { expLabel, expColor, EXP_DEFAULT_CATS } from './expUtils';

ChartJS.register(
  ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
);
ChartJS.defaults.font.family = CHART_DEFAULTS.fontFamily;
ChartJS.defaults.color = CHART_DEFAULTS.color;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpTrendPoint {
  l: string;
  rev: number;   // ₹K
  exp: number;   // ₹K
  cats: Record<string, number>;  // raw ₹ per category
}

interface ExpenseChartsProps {
  /** Sorted non-zero cats: [key, totalINR][] */
  sortedCats: Array<[string, number]>;
  /** All custom key names (for colour mapping) */
  customKeys: string[];
  trendPoints: ExpTrendPoint[];
  trendMode: 'total' | 'category';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpenseCharts({
  sortedCats,
  customKeys,
  trendPoints,
  trendMode,
}: ExpenseChartsProps) {
  const hasCatData = sortedCats.length > 0;

  // ── Category doughnut ─────────────────────────────────────────────────────
  const donutData = {
    labels: sortedCats.map(([k]) => expLabel(k)),
    datasets: [{
      data: sortedCats.map(([, v]) => v),
      backgroundColor: sortedCats.map(([k]) => expColor(k, customKeys)),
      borderWidth: 0,
      hoverOffset: 5,
    }],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: ANIMATION,
    cutout: '62%',
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: { usePointStyle: true, padding: 9, font: { size: 10 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { label?: string; raw?: unknown; dataset: { data: number[] } }) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const v = Number(ctx.raw ?? 0);
            const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
            return ` ${ctx.label}: ₹${(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)`;
          },
        },
      },
    },
  };

  // ── Trend bar (total mode) ─────────────────────────────────────────────────
  const totalTrendData = {
    labels: trendPoints.map((t) => t.l),
    datasets: [
      {
        label: 'Revenue',
        data: trendPoints.map((t) => t.rev),
        backgroundColor: 'rgba(22,163,74,.18)',
        borderColor: 'rgba(22,163,74,.6)',
        borderWidth: 1.5,
        borderRadius: 4,
      },
      {
        label: 'Expenses',
        data: trendPoints.map((t) => t.exp),
        backgroundColor: 'rgba(220,38,38,.75)',
        borderRadius: 4,
      },
    ],
  };

  // ── Trend bar (category stacked mode) ────────────────────────────────────
  const stackKeys = Array.from(
    new Set(trendPoints.flatMap((t) => Object.keys(t.cats).filter((k) => (t.cats[k] ?? 0) > 0))),
  );

  const stackedTrendData = {
    labels: trendPoints.map((t) => t.l),
    datasets: stackKeys.map((k) => ({
      label: expLabel(k),
      data: trendPoints.map((t) => Math.round((t.cats[k] ?? 0) / 1000)),
      backgroundColor: expColor(k, customKeys),
      borderRadius: 3,
      stack: 'expenses',
    })),
  };

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: ANIMATION,
    plugins: {
      legend: legendConfig('top'),
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; raw?: unknown }) =>
            ` ${ctx.dataset.label}: ₹${ctx.raw}K`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: '#F1F0EC' },
        ...(trendMode === 'category' ? { stacked: true } : {}),
        ticks: { callback: (v: number | string) => '₹' + v + 'K' },
      },
    },
  };

  return (
    <>
      {/* cExpCat */}
      <div className="cc">
        <div className="ch">
          <div>
            <div className="ct">Category Breakdown</div>
            <div className="cs">% of total expenses</div>
          </div>
        </div>
        {hasCatData ? (
          <Doughnut data={donutData} options={donutOptions} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '160px', flexDirection: 'column', gap: '6px', color: 'var(--t3)' }}>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>No expense categories yet</div>
            <div style={{ fontSize: '12px' }}>Enter categories when uploading a report</div>
          </div>
        )}
      </div>

      {/* cExpTrend — spans 2 columns (grid-column: span 2) */}
      <div className="cc" style={{ gridColumn: 'span 2' }}>
        <div className="ch">
          <div>
            <div className="ct">Expense vs Revenue</div>
            <div className="cs">Monthly comparison</div>
          </div>
          {/* Trend mode toggle handled by parent */}
        </div>
        <Bar
          data={trendMode === 'total' ? totalTrendData : stackedTrendData}
          options={trendOptions as Parameters<typeof Bar>[0]['options']}
        />
      </div>
    </>
  );
}