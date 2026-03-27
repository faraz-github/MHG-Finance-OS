'use client';
// src/components/charts/CashFlowChart.tsx
//
// Line chart: Cash In vs Cash Out over up to 12 months.
// Used by the Cash Flow page (Run 7). Produced here so Run 7 can import it.
// Verbatim port of the cCF chart from rndCashflow() in the HTML.

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  CHART_DEFAULTS,
  ANIMATION,
  legendConfig,
  richTooltipCallbacks,
} from './chartUtils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

ChartJS.defaults.font.family = CHART_DEFAULTS.fontFamily;
ChartJS.defaults.color = CHART_DEFAULTS.color;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CashFlowTrendPoint {
  /** Month label, e.g. "Jan" */
  l: string;
  /** Cash in (revenue) in full rupees */
  ci: number;
  /** Cash out (expenses + commission) in full rupees */
  co: number;
}

interface CashFlowChartProps {
  trend: CashFlowTrendPoint[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CashFlowChart({ trend }: CashFlowChartProps) {
  const data = {
    labels: trend.map((t) => t.l),
    datasets: [
      {
        label: 'Cash In',
        data: trend.map((t) => t.ci),
        borderColor: '#16A34A',
        backgroundColor: 'rgba(22,163,74,.07)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
      },
      {
        label: 'Cash Out',
        data: trend.map((t) => t.co),
        borderColor: '#DC2626',
        backgroundColor: 'rgba(220,38,38,.05)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
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

  return <Line data={data} options={options as Parameters<typeof Line>[0]['options']} />;
}