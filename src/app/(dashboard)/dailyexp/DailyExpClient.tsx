'use client';
// src/app/(dashboard)/dailyexp/DailyExpClient.tsx
//
// Client Component. Renders the full Daily Expenses page:
//   - 3 KPI cards (Period Expenses, Entries, Top Category)
//   - Table: Date, Property, Category pill, Amount, Notes, Actions
//   - Property + Category local filters (in addition to PeriodBar)
//   - Add/Edit modal (DailyExpModal)
//   - Delete confirmation
//
// Period filtering: uses matchesPeriod() from src/lib/period.ts with the
// current Zustand period state (client-side). See page.tsx for the
// architectural note on URL-sync (deferred to v2).
//
// HTML source: rndDailyExp(), saveDailyExp(), editDailyExp(), delDailyExp()
// Table limit: HTML shows 50 rows max then "Showing X of Y". We use
// Pagination component for a cleaner UX with the same PAGE_SIZE=50.

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePeriod } from '@/hooks/usePeriod';
import { usePageFilters } from '@/hooks/usePageFilters';
import { PageFilterBar } from '@/components/layout/PageFilterBar';
import type { FilterOption } from '@/components/layout/PageFilterBar';
import { matchesPeriod } from '@/lib/period';
import type { PeriodState } from '@/lib/period';
import { MetricCard, MetricCardGrid } from '@/components/ui/MetricCard';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { DailyExpModal } from './DailyExpModal';
import type { DailyExpFormValues, DailyExpSavePayload } from './DailyExpModal';
import { DAILY_EXP_CATS } from './DailyExpModal';
import type { SerializableProperty } from '../properties/page';

// ---------------------------------------------------------------------------
// Constants — verbatim from HTML (_dePage = 50)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

// EXP_CATS_DAILY map — verbatim from the HTML
const EXP_CATS_DAILY: Record<string, string> = Object.fromEntries(
  DAILY_EXP_CATS.map((c) => [c.value, c.label]),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SerializableDailyExp {
  id: string;
  pid: string;
  date: string;        // YYYY-MM-DD
  category: string;
  amount: number;
  note: string;
  invoicePath: string | null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const fIN = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fI  = (n: number) => {
  const v = Math.abs(n);
  if (v >= 100000) return (n < 0 ? '-' : '') + '₹' + (v / 100000).toFixed(2) + 'L';
  if (v >= 1000)   return (n < 0 ? '-' : '') + '₹' + (v / 1000).toFixed(2) + 'K';
  return (n < 0 ? '-' : '') + '₹' + v.toFixed(2);
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DailyExpClientProps {
  expenses: SerializableDailyExp[];
  properties: SerializableProperty[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DailyExpClient({
  expenses,
  properties,
  canCreate,
  canEdit,
  canDelete,
}: DailyExpClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  // ── Local state ───────────────────────────────────────────────────────────
  const [page, setPage]             = useState(1);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<DailyExpFormValues>>();
  const [isSaving, setIsSaving]     = useState(false);

  // ── Period store + per-page filters ───────────────────────────────────────
  const periodState = usePeriod();
  const filters = usePageFilters({ city: true, property: true, category: true });

  // ── Property lookup ───────────────────────────────────────────────────────
  const propMap = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p])),
    [properties],
  );

  const cityOptions: FilterOption[] = useMemo(
    () => [...new Set(properties.map((p) => p.city).filter(Boolean))].sort().map((c) => ({ value: c, label: c })),
    [properties],
  );
  const propOptions: FilterOption[] = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );
  const categoryOptions: FilterOption[] = DAILY_EXP_CATS.map((c) => ({ value: c.value, label: c.label }));

  // ── Filter expenses: period + URL filters ─────────────────────────────────
  const filtered = useMemo(() => {
    let exps = expenses.filter((e) =>
      matchesPeriod(e.date, periodState as PeriodState),
    );
    if (filters.city     !== 'all') exps = exps.filter((e) => propMap[e.pid]?.city === filters.city);
    if (filters.property !== 'all') exps = exps.filter((e) => e.pid === filters.property);
    if (filters.category !== 'all') exps = exps.filter((e) => e.category === filters.category);
    return [...exps].sort((a, b) => b.date.localeCompare(a.date));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, filters.city, filters.property, filters.category, propMap,
      periodState.cPType, periodState.cM, periodState.cY, periodState.cQ,
      periodState.cFY, periodState.cDateFrom, periodState.cDateTo,
      periodState.cDay, periodState.cWeek]);

  // ── KPI derivation ────────────────────────────────────────────────────────
  const total    = filtered.reduce((s, e) => s + e.amount, 0);
  const catTotals: Record<string, number> = {};
  filtered.forEach((e) => { catTotals[e.category] = (catTotals[e.category] ?? 0) + e.amount; });
  const topCatEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const overflow   = filtered.length > PAGE_SIZE;

  // ── Add / edit ────────────────────────────────────────────────────────────
  function handleAdd() {
    setEditId(null);
    setEditValues(undefined);
    setModalOpen(true);
  }

  function handleEdit(e: SerializableDailyExp) {
    setEditId(e.id);
    setEditValues({
      pid:                 e.pid,
      date:                e.date,
      category:            e.category,
      amount:              String(e.amount),
      note:                e.note,
      existingInvoicePath: e.invoicePath,
    });
    setModalOpen(true);
  }

  async function handleSave(payload: DailyExpSavePayload, id: string | null) {
    setIsSaving(true);
    try {
      const res = await fetch(
        id ? `/api/daily-expenses/${id}` : '/api/daily-expenses',
        {
          method:  id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            invoice_path: payload.invoicePath ?? undefined,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Failed to save expense', 'er');
        return;
      }
      toast(`✓ Expense ${fIN(payload.amount)} saved for ${payload.expenseDate}`, 'ok');
      setModalOpen(false);
      startTransition(() => router.refresh());
    } catch {
      toast('Network error — please try again', 'er');
    } finally {
      setIsSaving(false);
    }
  }

  // ── View invoice — fetch signed URL on click, open in new tab ─────────────
  async function handleViewInvoice(invoicePath: string) {
    try {
      const res = await fetch('/api/files/signed-url', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'mg-finance-os', path: invoicePath, expiresIn: 120 }),
      });
      if (!res.ok) { toast('Could not load invoice — please try again', 'er'); return; }
      const { url } = await res.json();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast('Network error loading invoice', 'er');
    }
  }

  async function handleDelete(e: SerializableDailyExp) {
    if (!window.confirm('Delete this expense?')) return;
    try {
      const res = await fetch(`/api/daily-expenses/${e.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Failed to delete expense', 'er');
        return;
      }
      toast('Expense deleted', 'ok');
      startTransition(() => router.refresh());
    } catch {
      toast('Network error — please try again', 'er');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-hdr">
        <div className="stl" style={{ marginBottom: 0 }}>
          <div className="d" />Daily Expenses
        </div>
        {canCreate && (
          <button className="btn btn-or btn-sm" onClick={handleAdd}>
            + Add Expense
          </button>
        )}
      </div>

      <PageFilterBar
        filters={filters}
        config={{ city: true, property: true, category: true }}
        cities={cityOptions}
        properties={propOptions}
        categories={categoryOptions}
      />

      {/* ── 3 KPI cards ──────────────────────────────────────────────────── */}
      <MetricCardGrid>
        <MetricCard label="Period Expenses" value={fI(total)} sub="Total this period" iconText="↓" iconVariant="r" />
        <MetricCard label="Entries" value={String(filtered.length)} sub="Expense records" iconText="#" iconVariant="o" />
        <MetricCard
          label="Top Category"
          value={topCatEntry ? (EXP_CATS_DAILY[topCatEntry[0]] ?? topCatEntry[0]) : '—'}
          sub={topCatEntry ? fIN(topCatEntry[1]) + ' spent' : 'No expenses yet'}
          iconText="📂"
          iconVariant="b"
        />
      </MetricCardGrid>

      {/* ── Table card ───────────────────────────────────────────────────── */}
      <div className="tw">
        <div className="th">
          <div className="ct" id="dexpTitle">Expense Log</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t3)' }}>
            No expenses for this period. Change the View By filter or add an expense.
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              {/* Table columns — verbatim from HTML thead */}
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Property</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Notes</th>
                    {/* Invoice column — icon only, actual load on click (future) */}
                    <th>Invoice</th>
                    {(canEdit || canDelete) && <th />}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((e) => {
                    const prop = propMap[e.pid];
                    return (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td>{prop?.name ?? '?'}</td>
                        <td>
                          <span className="pill o">
                            {EXP_CATS_DAILY[e.category] ?? e.category}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--rd)' }}>
                          {fIN(e.amount)}
                        </td>
                        <td style={{ fontSize: '11px', color: 'var(--t3)' }}>
                          {e.note || ''}
                        </td>
                        {/* Invoice icon — clicks fetch signed URL and open in new tab */}
                        <td>
                          {e.invoicePath ? (
                            <button
                              className="btn btn-g btn-sm"
                              title="View invoice"
                              onClick={() => handleViewInvoice(e.invoicePath!)}
                            >
                              🧾
                            </button>
                          ) : (
                            <span style={{ color: 'var(--t3)', fontSize: '11px' }}>—</span>
                          )}
                        </td>
                        {(canEdit || canDelete) && (
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {canEdit && (
                              <button
                                className="btn btn-g btn-sm"
                                onClick={() => handleEdit(e)}
                              >
                                ✏️
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="btn btn-rd btn-sm"
                                onClick={() => handleDelete(e)}
                                style={{ marginLeft: '4px' }}
                              >
                                🗑
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Overflow notice or pagination */}
            {overflow && totalPages > 1 ? (
              <Pagination
                total={filtered.length}
                page={safePage}
                pageSize={PAGE_SIZE}
                onChange={(p) => setPage(p)}
              />
            ) : overflow ? (
              <div style={{ padding: '10px 16px', fontSize: '11.5px', color: 'var(--t3)', textAlign: 'center', borderTop: '1px solid var(--bdr)' }}>
                Showing {PAGE_SIZE} of {filtered.length} expenses. Use filters to narrow results.
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* ── Add/Edit modal ─────────────────────────────────────────────────── */}
      <DailyExpModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editId={editId}
        initialValues={editValues}
        properties={properties}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </>
  );
}