// src/app/(dashboard)/expenses/expUtils.ts
//
// Expense category helpers — verbatim port from the HTML.
// Used by ExpensesClient and ExpenseCharts.

// ---------------------------------------------------------------------------
// EXP_DEFAULT_CATS — verbatim from the HTML
// ---------------------------------------------------------------------------

export interface ExpCatDef {
  key: string;
  label: string;
  icon: string;
  color: string;
}

export const EXP_DEFAULT_CATS: ExpCatDef[] = [
  { key: 'electricity-bill', label: 'Electricity Bill',    icon: '⚡', color: '#F59E0B' },
  { key: 'rent',             label: 'Rent',                icon: '🏠', color: '#8B5CF6' },
  { key: 'cleaning-fees',    label: 'Cleaning Fees',       icon: '🧹', color: '#F4521E' },
  { key: 'utilities',        label: 'Utilities',           icon: '💡', color: '#2563EB' },
  { key: 'supplies',         label: 'Toiletries/Supplies', icon: '📦', color: '#16A34A' },
  { key: 'maintenance',      label: 'Maintenance',         icon: '🔧', color: '#D97706' },
  { key: 'platform-fees',    label: 'Platform Fees',       icon: '📱', color: '#6366F1' },
  { key: 'other',            label: 'Other',               icon: '📌', color: '#9CA3AF' },
];

// Extra colours for custom category keys not in the defaults
const EXP_EXTRA_COLORS = [
  '#EC4899', '#14B8A6', '#F97316',
  '#84CC16', '#06B6D4', '#A855F7',
];

// ---------------------------------------------------------------------------
// expLabel — verbatim from the HTML
// ---------------------------------------------------------------------------

export function expLabel(key: string): string {
  const d = EXP_DEFAULT_CATS.find((c) => c.key === key);
  if (d) return d.label;
  // Title-case the slug
  return key
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// expColor — verbatim from the HTML
// ---------------------------------------------------------------------------

export function expColor(key: string, customKeys: string[] = []): string {
  const d = EXP_DEFAULT_CATS.find((c) => c.key === key);
  if (d) return d.color;
  const idx = customKeys.indexOf(key);
  return EXP_EXTRA_COLORS[idx % EXP_EXTRA_COLORS.length] ?? '#9CA3AF';
}

// ---------------------------------------------------------------------------
// aggExpCats — verbatim from the HTML
// Aggregates expCats from multiple report rows into a single totals map.
// Works with any category key format (slug or legacy flat keys).
// ---------------------------------------------------------------------------

export function aggExpCats(
  rs: Array<{ expCats?: Record<string, number> }>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  rs.forEach((r) => {
    const ec = r.expCats;
    if (!ec || typeof ec !== 'object') return;
    Object.entries(ec).forEach(([k, v]) => {
      if (v > 0) totals[k] = (totals[k] ?? 0) + v;
    });
  });
  return totals;
}