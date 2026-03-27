'use client';
// src/components/charts/RevenueChart.tsx
//
// Bar chart: Revenue vs Expenses vs Operating Profit.
// 6-month rolling window (or period months for quarterly/FY/custom).
// Verbatim port of the cRev chart from rndDashCharts() in the HTML.

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import {
  CHART_DEFAULTS,
  ANIMATION,
  legendConfig,
  richTooltipCallbacks,
} from './chartUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// Apply global defaults — verbatim from the HTML
ChartJS.defaults.font.family = CHART_DEFAULTS.fontFamily;
ChartJS.defaults.color = CHART_DEFAULTS.color;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenueTrendPoint {
  /** Month label, e.g. "Jan" */
  l: string;
  /** Revenue in INR */
  rev: number;
  /** Expenses in INR */
  exp: number;
  /** Operating profit in INR */
  op: number;
}

interface RevenueChartProps {
  trend: RevenueTrendPoint[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RevenueChart({ trend }: RevenueChartProps) {
  const data = {
    labels: trend.map((t) => t.l),
    datasets: [
      {
        label: 'Revenue',
        data: trend.map((t) => t.rev),
        backgroundColor: 'rgba(244,82,30,.85)',
        borderRadius: 5,
      },
      {
        label: 'Expenses',
        data: trend.map((t) => t.exp),
        backgroundColor: 'rgba(220,38,38,.75)',
        borderRadius: 5,
      },
      {
        label: 'Op.Profit',
        data: trend.map((t) => t.op),
        backgroundColor: 'rgba(22,163,74,.8)',
        borderRadius: 5,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    animation: ANIMATION,
    plugins: {
      legend: legendConfig('top'),
      tooltip: { callbacks: richTooltipCallbacks },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: '#F1F0EC' },
        ticks: {
          callback: (v: number | string) => {
            const n = Number(v);
            if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
            if (n >= 1000)   return '₹' + (n / 1000).toFixed(0) + 'K';
            return '₹' + n;
          },
        },
      },
    },
  };

  return <Bar data={data} options={options as Parameters<typeof Bar>[0]['options']} />;
}