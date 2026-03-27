'use client';
// src/app/(dashboard)/investors/InvCharts.tsx
//
// Two charts for the Investors page — dynamically imported by InvestorsClient.
//   cIR : bar chart  — Payout by Investor (₹K)
//   cIS : doughnut   — Payout Distribution %
//
// Verbatim port of the cIR / cIS charts from rndInvs() in the HTML.

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  CHART_DEFAULTS,
  ANIMATION,
  legendConfig,
} from '@/components/charts/chartUtils';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend,
);
ChartJS.defaults.font.family = CHART_DEFAULTS.fontFamily;
ChartJS.defaults.color = CHART_DEFAULTS.color;

// Verbatim colour palette from the HTML
const COLORS = ['#F4521E', '#16A34A', '#2563EB', '#D97706', '#8B5CF6'];

interface InvChartData {
  name: string;
  pay: number;
}

interface InvChartsProps {
  data: InvChartData[];
}

export function InvCharts({ data }: InvChartsProps) {
  const payK    = data.map((d) => Math.round(d.pay / 1000));
  const totalK  = payK.reduce((a, v) => a + v, 0);
  const colors  = COLORS.slice(0, data.length);

  // ── Bar: Payout by Investor ───────────────────────────────────────────────
  const barData = {
    labels: data.map((d) => d.name),
    datasets: [{
      label: 'Payout',
      data: payK,
      backgroundColor: colors,
      borderRadius: 7,
    }],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: ANIMATION,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { raw?: unknown }) => ` ₹${ctx.raw}K`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: '#F1F0EC' },
        ticks: { callback: (v: number | string) => '₹' + v + 'K' },
      },
    },
  };

  // ── Doughnut: Payout Distribution ────────────────────────────────────────
  const donutData = {
    labels: data.map((d) => d.name),
    datasets: [{
      data: payK,
      backgroundColor: colors,
      borderWidth: 0,
      hoverOffset: 4,
    }],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: ANIMATION,
    cutout: '60%',
    plugins: {
      legend: legendConfig('bottom'),
      tooltip: {
        callbacks: {
          label: (ctx: { label?: string; raw?: unknown }) => {
            const pct = totalK > 0
              ? ((Number(ctx.raw) / totalK) * 100).toFixed(1)
              : '0';
            return ` ${ctx.label}: ${pct}%`;
          },
        },
      },
    },
  };

  return (
    <>
      {/* cIR */}
      <div className="cc">
        <div className="ch">
          <div><div className="ct">ROI by Investor</div></div>
        </div>
        <Bar
          data={barData}
          options={barOptions as Parameters<typeof Bar>[0]['options']}
        />
      </div>

      {/* cIS */}
      <div className="cc">
        <div className="ch">
          <div><div className="ct">Payout Distribution</div></div>
        </div>
        <Doughnut data={donutData} options={donutOptions} />
      </div>
    </>
  );
}