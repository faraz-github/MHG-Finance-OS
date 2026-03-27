'use client';
// src/app/(dashboard)/insights/InsightCharts.tsx
//
// Two charts for the Smart Insights page — dynamically imported.
//   cRad : radar chart  — Portfolio Performance Radar (6 dimensions)
//   cAdr : line chart   — ADR vs RevPAR Trend (6-month rolling)
//
// Verbatim port of the cRad / cAdr charts from rndInsights() in the HTML.

import {
  Chart as ChartJS,
  RadarController,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar, Line } from 'react-chartjs-2';
import { CHART_DEFAULTS, ANIMATION, legendConfig } from '@/components/charts/chartUtils';

ChartJS.register(
  RadarController, RadialLinearScale,
  CategoryScale, LinearScale,
  PointElement, LineElement,
  Filler, Tooltip, Legend,
);
ChartJS.defaults.font.family = CHART_DEFAULTS.fontFamily;
ChartJS.defaults.color = CHART_DEFAULTS.color;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RadarRaw {
  occRaw: number;
  roiRaw: number;
  margRaw: number;
  expCtrlRaw: number;
  propsWithRev: number;
  totalProps: number;
}

export interface AdrTrendPoint {
  l: string;
  adr: number;
  rv: number;
}

interface InsightChartsProps {
  /** Normalised scores 0–100 for each radar dimension */
  radarData: number[];
  /** Raw values for tooltip label display */
  radarRaw: RadarRaw;
  adrTrend: AdrTrendPoint[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InsightCharts({ radarData, radarRaw, adrTrend }: InsightChartsProps) {
  // ── Radar: Portfolio Performance ─────────────────────────────────────────
  const radarChartData = {
    labels: ['Occupancy', 'ROI', 'Margin', 'Expense Ctrl', 'Growth', 'Diversification'],
    datasets: [{
      label: 'Portfolio Score',
      data: radarData,
      backgroundColor: 'rgba(244,82,30,.13)',
      borderColor: '#F4521E',
      pointBackgroundColor: '#F4521E',
      borderWidth: 2,
      pointRadius: 4,
    }],
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: ANIMATION,
    scales: {
      r: {
        min: 0,
        max: 100,
        grid:   { color: '#F1F0EC' },
        ticks:  { display: false, backdropColor: 'transparent', stepSize: 25 },
        pointLabels: { font: { size: 10.5, weight: 600 } },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          // Verbatim tooltip labels from rndInsights()
          label: (ctx: { dataIndex: number; raw: unknown }) => {
            const { occRaw, roiRaw, margRaw, expCtrlRaw, propsWithRev, totalProps } = radarRaw;
            const labels: Record<number, string> = {
              0: `Occupancy: ${occRaw.toFixed(1)}%`,
              1: `ROI: ${roiRaw.toFixed(1)}%`,
              2: `Margin: ${margRaw.toFixed(1)}%`,
              3: `Expense Control: ${expCtrlRaw.toFixed(1)}%`,
              4: `Growth Score`,
              5: `Diversification: ${propsWithRev}/${totalProps} properties`,
            };
            return labels[ctx.dataIndex] ?? String(ctx.raw);
          },
        },
      },
    },
  };

  // ── Line: ADR vs RevPAR Trend ─────────────────────────────────────────────
  const lineData = {
    labels: adrTrend.map((t) => t.l),
    datasets: [
      {
        label: 'ADR (₹)',
        data: adrTrend.map((t) => t.adr),
        borderColor: '#F4521E',
        backgroundColor: 'rgba(244,82,30,.07)',
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
      {
        label: 'RevPAR (₹)',
        data: adrTrend.map((t) => t.rv),
        borderColor: '#2563EB',
        backgroundColor: 'rgba(37,99,235,.04)',
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: ANIMATION,
    plugins: {
      legend: legendConfig('top'),
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; raw?: unknown }) =>
            ` ${ctx.dataset.label}: ₹${Number(ctx.raw ?? 0).toLocaleString('en-IN')}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: '#F1F0EC' },
        beginAtZero: true,
        ticks: {
          callback: (v: number | string) =>
            '₹' + Number(v).toLocaleString('en-IN'),
        },
      },
    },
  };

  return (
    <div className="crow re">
      {/* cRad */}
      <div className="cc">
        <div className="ch">
          <div><div className="ct">Portfolio Performance Radar</div></div>
        </div>
        <Radar
          data={radarChartData}
          options={radarOptions as Parameters<typeof Radar>[0]['options']}
        />
      </div>

      {/* cAdr */}
      <div className="cc">
        <div className="ch">
          <div><div className="ct">ADR vs RevPAR Trend</div></div>
        </div>
        <Line
          data={lineData}
          options={lineOptions as Parameters<typeof Line>[0]['options']}
        />
      </div>
    </div>
  );
}