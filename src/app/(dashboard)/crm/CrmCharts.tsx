'use client';
// src/app/(dashboard)/crm/CrmCharts.tsx
//
// Two charts for the Guest CRM page — dynamically imported.
//   cCrmPie : doughnut — Repeat vs New guests
//   cCrmBar : horizontal bar — Top 5 guests by spend
//
// Verbatim port of the cCrmPie / cCrmBar charts from rndCRM() in the HTML.

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

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);
ChartJS.defaults.font.family = CHART_DEFAULTS.fontFamily;
ChartJS.defaults.color = CHART_DEFAULTS.color;

interface CrmChartsProps {
  repeatCount: number;
  newCount: number;
  top5: Array<{ name: string; spend: number }>;
}

export function CrmCharts({ repeatCount, newCount, top5 }: CrmChartsProps) {
  // ── Repeat vs New doughnut ─────────────────────────────────────────────────
  const pieData = {
    labels: ['Repeat', 'New'],
    datasets: [{
      data: [repeatCount, newCount],
      backgroundColor: ['#16A34A', '#E5E2DA'],
      borderWidth: 0,
    }],
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: ANIMATION,
    cutout: '60%',
    plugins: {
      legend: legendConfig('bottom'),
      tooltip: {
        callbacks: {
          label: (ctx: { label?: string; raw?: unknown }) =>
            ` ${ctx.label}: ${ctx.raw}`,
        },
      },
    },
  };

  // ── Top 5 by spend horizontal bar ─────────────────────────────────────────
  const barData = {
    labels: top5.map((g) =>
      g.name.length > 12 ? g.name.slice(0, 10) + '…' : g.name,
    ),
    datasets: [{
      label: 'Spend',
      data: top5.map((g) => Math.round(g.spend / 1000)),
      backgroundColor: '#F4521E',
      borderRadius: 5,
    }],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: ANIMATION,
    indexAxis: 'y' as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { raw?: unknown }) => ` ₹${ctx.raw}K`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: '#F1F0EC' },
        ticks: { callback: (v: number | string) => '₹' + v + 'K' },
      },
      y: { grid: { display: false } },
    },
  };

  return (
    <>
      {/* cCrmPie */}
      <div className="cc" style={{ minHeight: '170px' }}>
        <Doughnut data={pieData} options={pieOptions} />
      </div>

      {/* cCrmBar */}
      {top5.length > 0 && (
        <div className="cc" style={{ minHeight: '170px' }}>
          <Bar data={barData} options={barOptions as Parameters<typeof Bar>[0]['options']} />
        </div>
      )}
    </>
  );
}