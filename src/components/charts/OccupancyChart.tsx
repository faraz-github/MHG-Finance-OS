'use client';
// src/components/charts/OccupancyChart.tsx
//
// Line chart: occupancy % trend with a dashed 75% target line.
// 6-month rolling window.
// Verbatim port of the cOcc chart from rndDashCharts() in the HTML.

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

export interface OccupancyTrendPoint {
  /** Month label, e.g. "Jan" */
  l: string;
  /** Occupancy % (0–100) */
  occ: number;
}

interface OccupancyChartProps {
  trend: OccupancyTrendPoint[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OccupancyChart({ trend }: OccupancyChartProps) {
  const data = {
    labels: trend.map((t) => t.l),
    datasets: [
      {
        label: 'Occupancy %',
        data: trend.map((t) => t.occ),
        borderColor: '#F4521E',
        backgroundColor: 'rgba(244,82,30,.07)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#F4521E',
        pointRadius: 4,
      },
      {
        label: 'Target 75%',
        data: trend.map(() => 75),
        borderColor: '#ccc',
        borderDash: [4, 3],
        borderWidth: 1.5,
        pointRadius: 0,
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
        min: 0,
        max: 100,
        ticks: { callback: (v: number | string) => v + '%' },
      },
    },
  };

  return <Line data={data} options={options as Parameters<typeof Line>[0]['options']} />;
}