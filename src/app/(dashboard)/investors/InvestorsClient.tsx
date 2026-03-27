'use client';
// src/app/(dashboard)/investors/InvestorsClient.tsx
//
// Client Component. Renders:
//   - Investor table (name, property pill, capital, equity, net payout, ROI)
//   - ROI displayed via values pre-computed server-side with calcROI()
//   - Add/Edit modal (InvModal)
//   - Detail panel (DetailPanel from Run 4) with all-time KPIs + history
//   - Two charts: Payout bar + Payout Distribution donut (InvCharts)
//
// HTML source: rndInvs(), editInv(), saveInv(), delInv(), computeInvestorROI()

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { usePeriod } from '@/hooks/usePeriod';
import { usePageFilters } from '@/hooks/usePageFilters';
import { PageFilterBar } from '@/components/layout/PageFilterBar';
import type { FilterOption } from '@/components/layout/PageFilterBar';
import { aggReps, withD } from '@/lib/period';
import type { RepRow } from '@/lib/period';
import { formatROI } from '@/lib/finance';
import { DetailPanel } from '@/components/ui/DetailPanel';
import { useToast } from '@/components/ui/Toast';
import { InvModal } from './InvModal';
import type { InvestorFormValues, InvestorSavePayload } from './InvModal';
import type { SerializableInvestor } from './page';
import type { SerializableProperty } from '../properties/page';
import type { SerializableReport } from '../dashboard/page';

// Lazy-load charts (Chart.js is ~200KB)
const InvCharts = dynamic(
  () => import('./InvCharts').then((m) => ({ default: m.InvCharts })),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fI(n: number): string {
  if (!n && n !== 0) return '₹0.00';
  const v = Math.abs(n);
  if (v >= 100000) return (n < 0 ? '-' : '') + '₹' + (v / 100000).toFixed(2) + 'L';
  if (v >= 1000)   return (n < 0 ? '-' : '') + '₹' + (v / 1000).toFixed(2) + 'K';
  return (n < 0 ? '-' : '') + '₹' + v.toFixed(2);
}
const fF = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MN = ['','January','February','March','April','May','June',
            'July','August','September','October','November','December'];
const MS = ['','Jan','Feb','Mar','Apr','May','Jun',
            'Jul','Aug','Sep','Oct','Nov','Dec'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InvestorsClientProps {
  investors: SerializableInvestor[];
  properties: SerializableProperty[];
  reports: SerializableReport[];
  /** ROI pre-computed server-side via calcROI(): invId → roi% | null */
  investorRoi: Record<string, number | null>;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvestorsClient({
  investors,
  properties,
  reports,
  investorRoi,
  canCreate,
  canEdit,
  canDelete,
}: InvestorsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  // ── Local state ───────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]   = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<InvestorFormValues>>();
  const [isSaving, setIsSaving]     = useState(false);
  const [panelOpen, setPanelOpen]   = useState(false);
  const [panelInv, setPanelInv]     = useState<SerializableInvestor | null>(null);

  // ── Period store + per-page filters ───────────────────────────────────────
  const { getFilteredReps } = usePeriod();
  const filters = usePageFilters({ city: true, property: true });
  const allReps = reports as RepRow[];

  // ── Property lookup ───────────────────────────────────────────────────────
  const propMap = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p])),
    [properties],
  );

  const propById = useMemo(
    () => (pid: string) => propMap[pid]
      ? { id: pid, city: propMap[pid].city, comm: propMap[pid].comm }
      : null,
    [propMap],
  );

  const pageFilterState = useMemo(
    () => ({ cCi: filters.city, cPid: filters.property, cComm: 'all' }),
    [filters.city, filters.property],
  );

  const cityOptions: FilterOption[] = useMemo(
    () => [...new Set(properties.map((p) => p.city).filter(Boolean))].sort().map((c) => ({ value: c, label: c })),
    [properties],
  );
  const propOptions: FilterOption[] = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  const filteredReps = useMemo(
    () => getFilteredReps(allReps, propById, pageFilterState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allReps, propById, pageFilterState],
  );

  // ── Per-investor net payout for current period ────────────────────────────
  const invPayoutMap = useMemo(() => {
    const m: Record<string, number> = {};
    investors.forEach((inv) => {
      const invReps = filteredReps.filter((r) => r.pid === inv.propertyId);
      m[inv.id] = invReps.reduce((s, r) => s + r.invProfit, 0);
    });
    return m;
  }, [filteredReps, investors]);

  // ── Chart data: investors with positive payout ────────────────────────────
  const chartData = useMemo(
    () => investors
      .map((inv) => ({ name: inv.name, pay: invPayoutMap[inv.id] ?? 0 }))
      .filter((d) => d.pay > 0),
    [investors, invPayoutMap],
  );

  // ── Add / edit handlers ───────────────────────────────────────────────────
  function handleAdd() {
    setEditId(null);
    setEditValues(undefined);
    setModalOpen(true);
  }

  function handleEdit(inv: SerializableInvestor) {
    setEditId(inv.id);
    setEditValues({
      name:       inv.name,
      contact:    inv.contact,
      capital:    inv.capital ? String(inv.capital) : '',
      equity:     inv.sharePct ? String(inv.sharePct) : '',
      propertyId: inv.propertyId,
    });
    setModalOpen(true);
  }

  async function handleSave(payload: InvestorSavePayload, id: string | null) {
    setIsSaving(true);
    try {
      const res = await fetch(
        id ? `/api/investors/${id}` : '/api/investors',
        {
          method:  id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Failed to save investor', 'er');
        return;
      }
      toast(`✓ Investor "${payload.name}" ${id ? 'updated' : 'added'}`, 'ok');
      setModalOpen(false);
      startTransition(() => router.refresh());
    } catch {
      toast('Network error — please try again', 'er');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(inv: SerializableInvestor) {
    if (!window.confirm(
      `Delete investor "${inv.name}" and all their payout records?`,
    )) return;
    try {
      const res = await fetch(`/api/investors/${inv.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Failed to delete investor', 'er');
        return;
      }
      toast('Investor and payouts removed', 'er');
      if (panelInv?.id === inv.id) setPanelOpen(false);
      startTransition(() => router.refresh());
    } catch {
      toast('Network error — please try again', 'er');
    }
  }

  // ── Detail panel ──────────────────────────────────────────────────────────
  function openDetail(inv: SerializableInvestor) {
    setPanelInv(inv);
    setPanelOpen(true);
  }

  const panelAllReps = useMemo(() => {
    if (!panelInv) return [];
    return allReps
      .filter((r) => r.pid === panelInv.propertyId)
      .sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month));
  }, [panelInv, allReps]);

  const panelAgg = useMemo(
    () => (panelAllReps.length
      ? withD(aggReps(panelAllReps, (pid) => propMap[pid]?.capital ?? 0))
      : null),
    [panelAllReps, propMap],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <PageFilterBar filters={filters} config={{ city: true, property: true }} cities={cityOptions} properties={propOptions} />
      {/* ── Table card ────────────────────────────────────────────────────── */}
      <div className="tw">
        <div className="th">
          <div className="ct">Investor Analytics</div>
          {canCreate && (
            <button className="btn btn-or btn-sm" onClick={handleAdd}>
              + Add Investor
            </button>
          )}
        </div>

        {investors.length === 0 ? (
          <div className="es" style={{ margin: '16px', borderRadius: 'var(--r)' }}>
            <div className="es-ico">👤</div>
            <div className="es-t">No Investors</div>
            <div className="es-s">Add investors.</div>
            {canCreate && (
              <button className="btn btn-or" onClick={handleAdd}>Add Investor</button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {/* Table — columns verbatim from HTML thead */}
            <table>
              <thead>
                <tr>
                  <th>Investor</th>
                  <th>Properties</th>
                  <th>Capital</th>
                  <th>Equity%</th>
                  <th>Net Payout</th>
                  <th>ROI</th>
                  {(canEdit || canDelete) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {investors.map((inv) => {
                  const prop   = propMap[inv.propertyId];
                  const payout = invPayoutMap[inv.id] ?? 0;
                  const roi    = investorRoi[inv.id] ?? null;

                  return (
                    <tr key={inv.id}>
                      {/* Name + contact */}
                      <td>
                        <div
                          style={{ fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                          onClick={() => openDetail(inv)}
                        >
                          {inv.name}
                        </div>
                        {inv.contact && (
                          <div style={{ fontSize: '10.5px', color: 'var(--t3)' }}>
                            {inv.contact}
                          </div>
                        )}
                      </td>

                      {/* Linked property pill */}
                      <td style={{ maxWidth: '200px' }}>
                        {prop
                          ? <span className="pill b" style={{ margin: '1px 2px', display: 'inline-block' }}>{prop.name}</span>
                          : <span style={{ color: 'var(--t3)' }}>—</span>}
                      </td>

                      {/* Capital */}
                      <td>{inv.capital ? fF(inv.capital) : '—'}</td>

                      {/* Equity % */}
                      <td>{inv.sharePct ? inv.sharePct + '%' : '—'}</td>

                      {/* Net payout (period-filtered) */}
                      <td style={{ fontWeight: 800, color: 'var(--gr)' }}>
                        {fI(payout)}
                      </td>

                      {/* ROI — verbatim colour logic from HTML */}
                      <td style={{
                        fontWeight: 800,
                        color: roi !== null
                          ? roi >= 20 ? 'var(--gr)' : 'var(--go)'
                          : 'var(--t3)',
                      }}>
                        {roi !== null ? (
                          roi + '%'
                        ) : (
                          <span
                            title="Capital not entered for linked properties"
                            style={{ cursor: 'help', textDecoration: 'underline dotted', color: 'var(--t3)' }}
                          >
                            N/A
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      {(canEdit || canDelete) && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {canEdit && (
                            <button
                              className="btn btn-g btn-sm"
                              title="Edit"
                              onClick={() => handleEdit(inv)}
                            >
                              ✏️
                            </button>
                          )}
                          {canDelete && (
                            <button
                              className="btn btn-rd btn-sm"
                              title="Delete"
                              onClick={() => handleDelete(inv)}
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
        )}
      </div>

      {/* ── Charts row — shown when payout data exists ───────────────────── */}
      {chartData.length > 0 && (
        <div className="crow re" id="iCharts">
          <InvCharts data={chartData} />
        </div>
      )}

      {/* ── Add/Edit modal ─────────────────────────────────────────────────── */}
      <InvModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editId={editId}
        initialValues={editValues}
        properties={properties}
        onSave={handleSave}
        isSaving={isSaving}
      />

      {/* ── Detail panel ──────────────────────────────────────────────────── */}
      <DetailPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={panelInv?.name ?? ''}
        sub={
          panelInv
            ? [
                panelInv.contact || null,
                panelInv.capital ? `Capital: ${fF(panelInv.capital)}` : null,
                panelInv.sharePct ? `Equity: ${panelInv.sharePct}%` : null,
              ].filter(Boolean).join(' · ')
            : ''
        }
      >
        {panelInv && (
          <>
            {/* Linked property */}
            {propMap[panelInv.propertyId] && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '6px' }}>
                  Linked Property
                </div>
                <span className="pill b">{propMap[panelInv.propertyId].name}</span>
              </div>
            )}

            {/* All-time aggregate KPIs */}
            {panelAgg ? (
              <>
                <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '9px' }}>
                  All-Time Performance
                </div>
                <div className="dp-kpi">
                  <div className="dp-k"><div className="dp-kl">Total Revenue</div><div className="dp-kv">{fI(panelAgg.rev)}</div></div>
                  <div className="dp-k"><div className="dp-kl">Total Expenses</div><div className="dp-kv" style={{ color: 'var(--rd)' }}>{fI(panelAgg.exp)}</div></div>
                  <div className="dp-k"><div className="dp-kl">Op. Profit</div><div className="dp-kv" style={{ color: 'var(--gr)' }}>{fI(panelAgg.opProfit)}</div></div>
                  <div className="dp-k"><div className="dp-kl">Commission</div><div className="dp-kv" style={{ color: 'var(--or)' }}>{fI(panelAgg.commission)}</div></div>
                  <div className="dp-k"><div className="dp-kl">Investor Net</div><div className="dp-kv" style={{ color: 'var(--bl)' }}>{fI(panelAgg.invProfit)}</div></div>
                  <div className="dp-k">
                    <div className="dp-kl">ROI</div>
                    <div className="dp-kv" style={{
                      color: investorRoi[panelInv.id] !== null
                        ? (investorRoi[panelInv.id]! >= 20 ? 'var(--gr)' : 'var(--go)')
                        : 'var(--t3)',
                    }}>
                      {/* formatROI from finance.ts — never recalculate inline */}
                      {formatROI(panelAgg.invProfit, panelInv.capital ?? 0)}
                    </div>
                  </div>
                </div>

                {panelAllReps.length > 0 && (
                  <InvReportHistory reps={panelAllReps} MS={MS} />
                )}
              </>
            ) : (
              <div className="es" style={{ margin: '0 0 16px' }}>
                <div className="es-ico">📊</div>
                <div className="es-t">No Data</div>
                <div className="es-s">No reports for this investor's property yet.</div>
              </div>
            )}
          </>
        )}
      </DetailPanel>
    </>
  );
}

// ---------------------------------------------------------------------------
// InvReportHistory — collapsible period-by-period table
// ---------------------------------------------------------------------------

function InvReportHistory({
  reps, MS,
}: {
  reps: SerializableReport[];
  MS: string[];
}) {
  const [open, setOpen] = useState(false);
  const fI = (n: number) => {
    const v = Math.abs(n);
    if (v >= 100000) return (n < 0 ? '-' : '') + '₹' + (v / 100000).toFixed(2) + 'L';
    if (v >= 1000)   return (n < 0 ? '-' : '') + '₹' + (v / 1000).toFixed(2) + 'K';
    return (n < 0 ? '-' : '') + '₹' + v.toFixed(2);
  };

  return (
    <div style={{ marginTop: '8px' }}>
      <div
        style={{ cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, marginBottom: '7px', display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? '▼' : '▶'}</span>
        Period History ({reps.length})
      </div>
      {open && (
        <div style={{ overflow: 'auto', border: '1px solid var(--bdr)', borderRadius: '8px' }}>
          <table style={{ width: '100%', fontSize: '11px' }}>
            <thead>
              <tr>
                <th>Period</th>
                <th>Revenue</th>
                <th>Op.Profit</th>
                <th>Commission</th>
                <th>Investor Net</th>
                <th>Occ</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r) => (
                <tr key={r.id}>
                  <td>{MS[r.month]} {r.year}</td>
                  <td>{fI(r.rev)}</td>
                  <td style={{ color: 'var(--gr)' }}>{fI(r.opProfit)}</td>
                  <td style={{ color: 'var(--or)' }}>{fI(r.commission)}</td>
                  <td style={{ color: 'var(--bl)' }}>{fI(r.invProfit)}</td>
                  <td>{r.occ ?? 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}