// src/components/charts/chartUtils.ts
//
// Shared Chart.js defaults and helpers. Verbatim port from the HTML.
// All chart components import from here — no duplication.

import type { TooltipItem, ChartData } from 'chart.js';

// ---------------------------------------------------------------------------
// Month name arrays — verbatim from the HTML
// ---------------------------------------------------------------------------

export const MN = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
export const MS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// Formatting helpers — full precision with 2 decimal places
// ---------------------------------------------------------------------------

/** Compact Indian format with 2dp: ₹12.45L, ₹5.23K, ₹999.00 */
export function fI(n: number): string {
  if (!n && n !== 0) return '₹0.00';
  const v = Math.abs(n);
  if (v >= 100000) return (n < 0 ? '-' : '') + '₹' + (v / 100000).toFixed(2) + 'L';
  if (v >= 1000)   return (n < 0 ? '-' : '') + '₹' + (v / 1000).toFixed(2) + 'K';
  return (n < 0 ? '-' : '') + '₹' + v.toFixed(2);
}

/** Full Indian locale format with 2dp: ₹1,23,456.00 */
export function fIN(n: number): string {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Chart.js default options — verbatim from the HTML
// Chart.defaults.font.family = 'Sora'
// Chart.defaults.color = '#6A6560'
// Chart.defaults.plugins.legend.display = false
// ---------------------------------------------------------------------------

export const CHART_DEFAULTS = {
  fontFamily: 'Sora',
  color: '#6A6560',
  legendDisplay: false,
} as const;

// ---------------------------------------------------------------------------
// richTooltip callbacks — verbatim port from mk() in the HTML
//
// Logic:
//   - Title: expand abbreviated month labels (e.g. "Jan" → "January")
//   - Label: detect currency vs % based on dataset label content
//     Currency keywords: '₹', 'revenue', 'expense', 'profit', 'payout', 'cash'
//     Percent keywords:  '%', 'occ', 'roi'
// ---------------------------------------------------------------------------

export const richTooltipCallbacks = {
  title(items: TooltipItem<'bar' | 'line' | 'doughnut'>[]) {
    const lbl = items[0]?.label ?? '';
    const fullMonth = MN[MS.indexOf(lbl)] ?? lbl;
    return fullMonth;
  },
  label(ctx: TooltipItem<'bar' | 'line' | 'doughnut'>) {
    const v = ctx.raw as number;
    const ds = (ctx.dataset.label ?? '');
    const isCurr =
      ds.includes('₹') ||
      /revenue|expense|profit|payout|cash/i.test(ds);
    const isPct =
      ds.includes('%') ||
      /occ|roi/i.test(ds);
    // Charts now receive full rupee values — no * 1000 conversion needed
    if (isCurr) return ` ${ds}: ${fIN(v ?? 0)}`;
    if (isPct)  return ` ${ds}: ${(v ?? 0).toFixed(1)}%`;
    return ` ${ds}: ${fIN(v ?? 0)}`;
  },
};

// ---------------------------------------------------------------------------
// Shared animation duration (verbatim: animation: { duration: 400 })
// ---------------------------------------------------------------------------

export const ANIMATION = { duration: 400 } as const;

// ---------------------------------------------------------------------------
// Shared legend config — for charts that show legend (opts.leg = true)
// ---------------------------------------------------------------------------

export function legendConfig(position: 'top' | 'bottom' = 'top') {
  return {
    display: true,
    position,
    labels: { usePointStyle: true, padding: 12, font: { size: 10.5 } },
  };
}