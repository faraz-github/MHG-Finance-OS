// src/app/(dashboard)/expenses/expUtils.ts
//
// Expense category helpers.
// EXP_DEFAULT_CATS keys match DAILY_EXP_CATS values exactly so expLabel/expColor
// work correctly for all entries created via Daily Expenses or Monthly Entry.

// ---------------------------------------------------------------------------
// EXP_DEFAULT_CATS
// ---------------------------------------------------------------------------

export interface ExpCatDef {
  key: string;
  label: string;
  icon: string;
  color: string;
}

export const EXP_DEFAULT_CATS: ExpCatDef[] = [
  { key: 'cleaning',    label: 'Cleaning',      icon: '🧹', color: '#F4521E' },
  { key: 'electricity', label: 'Electricity',   icon: '⚡', color: '#F59E0B' },
  { key: 'water',       label: 'Water',          icon: '💧', color: '#2563EB' },
  { key: 'internet',    label: 'Internet/WiFi', icon: '📶', color: '#6366F1' },
  { key: 'rent',        label: 'Rent',           icon: '🏠', color: '#8B5CF6' },
  { key: 'maintenance', label: 'Maintenance',    icon: '🔧', color: '#D97706' },
  { key: 'supplies',    label: 'Supplies',       icon: '📦', color: '#16A34A' },
  { key: 'staff',       label: 'Staff Salary',   icon: '👤', color: '#14B8A6' },
  { key: 'laundry',     label: 'Laundry',        icon: '👕', color: '#EC4899' },
  { key: 'other',       label: 'Other',          icon: '📌', color: '#9CA3AF' },
];

// Extra colours for custom category keys not in the defaults
const EXP_EXTRA_COLORS = [
  '#84CC16', '#06B6D4', '#A855F7',
  '#F97316', '#10B981', '#EF4444',
];

// ---------------------------------------------------------------------------
// expLabel
// ---------------------------------------------------------------------------

export function expLabel(key: string): string {
  const d = EXP_DEFAULT_CATS.find((c) => c.key === key);
  if (d) return d.label;
  return key
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// expColor
// ---------------------------------------------------------------------------

export function expColor(key: string, customKeys: string[] = []): string {
  const d = EXP_DEFAULT_CATS.find((c) => c.key === key);
  if (d) return d.color;
  const idx = customKeys.indexOf(key);
  return EXP_EXTRA_COLORS[idx % EXP_EXTRA_COLORS.length] ?? '#9CA3AF';
}

// ---------------------------------------------------------------------------
// aggExpCats
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
