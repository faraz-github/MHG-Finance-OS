'use client';
// src/app/(dashboard)/dashboard/PropertyRevBar.tsx
//
// Horizontal bar chart: top properties by revenue.
// Dynamically imported by DashboardClient.
// Verbatim port of the cPR chart from rndDashCharts() in the HTML.

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { CHART_DEFAULTS, ANIMATION } from '@/components/charts/chartUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
ChartJS.defaults.font.family = CHART_DEFAULTS.fontFamily;
ChartJS.defaults.color = CHART_DEFAULTS.color;

interface PropRev {
  name: string;
  rev: number;
}

interface PropertyRevBarProps {
  propRevs: PropRev[];
}

export function PropertyRevBar({ propRevs }: PropertyRevBarProps) {
  const data = {
    labels: propRevs.map((p) =>
      p.name.length > 18 ? p.name.slice(0, 16) + '…' : p.name,
    ),
    datasets: [{
      label: 'Revenue',
      data: propRevs.map((p) => Math.round(p.rev / 1000)),
      backgroundColor: '#F4521E',
      borderRadius: 4,
    }],
  };

  const options = {
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
      y: {
        grid: { display: false },
        ticks: { font: { size: 9.5 } },
      },
    },
  };

  return <Bar data={data} options={options as Parameters<typeof Bar>[0]['options']} />;
}