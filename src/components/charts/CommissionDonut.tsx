'use client';
// src/components/charts/CommissionDonut.tsx
//
// Doughnut chart: MehmanGhar Commission % vs Investor Payout % of operating profit.
// Height 160 — matches the HTML canvas height attribute.
// Verbatim port of the cCommD chart from rndDashCharts() in the HTML.

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import {
  CHART_DEFAULTS,
  ANIMATION,
} from './chartUtils';

ChartJS.register(ArcElement, Tooltip, Legend);

ChartJS.defaults.font.family = CHART_DEFAULTS.fontFamily;
ChartJS.defaults.color = CHART_DEFAULTS.color;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommissionDonutProps {
  /** Commission as % of operating profit (e.g. 20.5) */
  commPct: number;
  /** Investor net as % of operating profit */
  invPct: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommissionDonut({ commPct, invPct }: CommissionDonutProps) {
  const data = {
    labels: ['MehmanGhar Commission', 'Investor Payout'],
    datasets: [
      {
        data: [commPct, invPct],
        backgroundColor: ['#F4521E', '#16A34A'],
        borderWidth: 0,
        hoverOffset: 5,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    animation: ANIMATION,
    cutout: '68%',
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: { usePointStyle: true, padding: 10, font: { size: 10.5 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { label?: string; raw?: unknown }) =>
            ` ${ctx.label}: ${ctx.raw}%`,
        },
      },
    },
  };

  return <Doughnut data={data} options={options} />;
}