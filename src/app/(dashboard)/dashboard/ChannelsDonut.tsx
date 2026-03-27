'use client';
// src/app/(dashboard)/dashboard/ChannelsDonut.tsx
//
// Booking Channels doughnut chart. Dynamically imported by DashboardClient.
// Verbatim port of the cChan chart from rndDashCharts() in the HTML.

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { CHART_DEFAULTS, ANIMATION } from '@/components/charts/chartUtils';

ChartJS.register(ArcElement, Tooltip, Legend);
ChartJS.defaults.font.family = CHART_DEFAULTS.fontFamily;
ChartJS.defaults.color = CHART_DEFAULTS.color;

// Verbatim channel colour palette from the HTML
const CHAN_COLORS = [
  '#FF5A5F', '#003580', '#F4521E', '#E31E24',
  '#16A34A', '#8B5CF6', '#F59E0B', '#9CA3AF',
];

interface ChannelsDonutProps {
  /** { channelName: totalRevenue } from filtered reps */
  chanAgg: Record<string, number>;
}

export function ChannelsDonut({ chanAgg }: ChannelsDonutProps) {
  const tot = Object.values(chanAgg).reduce((a, b) => a + b, 0);
  const labs = Object.keys(chanAgg);
  const vals = labs.map((k) => (tot > 0 ? +((chanAgg[k] / tot) * 100).toFixed(1) : 0));

  const data = {
    labels: labs,
    datasets: [{
      data: vals,
      backgroundColor: CHAN_COLORS.slice(0, labs.length),
      borderWidth: 0,
      hoverOffset: 4,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    animation: ANIMATION,
    cutout: '60%',
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: { usePointStyle: true, padding: 7, font: { size: 10 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { label?: string; raw?: unknown }) => ` ${ctx.label}: ${ctx.raw}%`,
        },
      },
    },
  };

  return <Doughnut data={data} options={options} />;
}