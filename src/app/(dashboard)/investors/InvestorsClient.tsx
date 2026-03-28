'use client';
// src/app/(dashboard)/investors/InvestorsClient.tsx
//
// Client Component. Renders:
//   - Investor table (name, property pill, capital, profit share%, net payout, ROI)
//   - Net payout = property invProfit × (investor sharePct / 100)
//   - ROI pre-computed server-side with calcROI() on investor's actual share
//   - Add/Edit modal (InvModal)
//   - Detail panel with all-time KPIs + period history (investor's share only)
//   - Charts: Payout bar + Payout Distribution donut (InvCharts)

import React, { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { usePeriod } from '@/hooks/usePeriod';
import { usePageFilters } from '@/hooks/usePageFilters';
import { downloadCsv } from '@/lib/csvDownload';
import { PageFilterBar } from '@/components/layout/PageFilterBar';
import type { FilterOption } from '@/components/layout/PageFilterBar';
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
  const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set());

  function toggleExpand(name: string) {
    setExpandedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

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
      ? { id: pid, city: propMap[pid].city, comm: propMap[pid].effectiveComm ?? propMap[pid].comm }
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
  // Each investor's payout = property invProfit × (their sharePct / 100).
  const invPayoutMap = useMemo(() => {
    const m: Record<string, number> = {};
    investors.forEach((inv) => {
      const invReps = filteredReps.filter((r) => r.pid === inv.propertyId);
      m[inv.id] = invReps.reduce((s, r) => s + r.invProfit * (inv.sharePct / 100), 0);
    });
    return m;
  }, [filteredReps, investors]);

  // ── Group investors by name+contact for accordion table ─────────────────
  // Key = name + contact so two different people with the same name
  // are not incorrectly merged. Same person across multiple properties
  // will share the same name AND contact, so they group correctly.
  const groupedInvestors = useMemo(() => {
    const map = new Map<string, SerializableInvestor[]>();
    investors.forEach((inv) => {
      const key = `${inv.name.trim()}||${(inv.contact ?? '').trim()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    });
    return [...map.entries()].map(([, rows]) => {
      const totalCapital = rows.reduce((s, r) => s + (r.capital ?? 0), 0);
      const totalPayout  = rows.reduce((s, r) => s + (invPayoutMap[r.id] ?? 0), 0);
      // Combined ROI = period payout / total capital — NOT an average of individual %s
      // Averaging 5.1% + 0% = 2.6% is wrong; ₹2,300 / ₹11,00,000 = 0.2% is correct
      const combinedRoi  = totalCapital > 0
        ? Math.round((totalPayout / totalCapital) * 10000) / 100  // 2 decimal %
        : null;
      const groupKey = `${rows[0].name.trim()}||${(rows[0].contact ?? '').trim()}`;
      return { name: rows[0].name, groupKey, rows, totalCapital, totalPayout, combinedRoi };
    });
  }, [investors, invPayoutMap]);

  // ── Period ROI per investor — payout / capital for current period ──────────
  // investorRoi (from server) is all-time. periodRoi respects the period filter.
  const periodRoi = useMemo(() => {
    const m: Record<string, number | null> = {};
    investors.forEach((inv) => {
      const payout = invPayoutMap[inv.id] ?? 0;
      const cap    = inv.capital ?? 0;
      m[inv.id]    = cap > 0 ? Math.round((payout / cap) * 10000) / 100 : null;
    });
    return m;
  }, [investors, invPayoutMap]);

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

  // All investment records for this investor (same name + contact = same person)
  const panelGroupInvs = useMemo(() => {
    if (!panelInv) return [];
    const key = `${panelInv.name.trim()}||${(panelInv.contact ?? '').trim()}`;
    return investors.filter((inv) =>
      `${inv.name.trim()}||${(inv.contact ?? '').trim()}` === key
    );
  }, [panelInv, investors]);

  // All report rows across all properties this investor is in
  const panelAllReps = useMemo(() => {
    if (!panelInv) return [];
    const pids = new Set(panelGroupInvs.map((inv) => inv.propertyId));
    return allReps
      .filter((r) => pids.has(r.pid))
      .sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month));
  }, [panelInv, panelGroupInvs, allReps]);

  // Aggregate across all properties, respecting each investment's sharePct
  const panelAgg = useMemo(() => {
    if (!panelGroupInvs.length || !panelAllReps.length) return null;
    // Build a pid → shareFraction map
    const shareMap: Record<string, number> = {};
    panelGroupInvs.forEach((inv) => {
      shareMap[inv.propertyId] = (inv.sharePct || 0) / 100;
    });
    return {
      rev:       panelAllReps.reduce((s, r) => s + r.rev, 0),
      exp:       panelAllReps.reduce((s, r) => s + r.exp, 0),
      opProfit:  panelAllReps.reduce((s, r) => s + r.opProfit, 0),
      commission:panelAllReps.reduce((s, r) => s + r.commission, 0),
      invProfit: panelAllReps.reduce((s, r) => s + r.invProfit * (shareMap[r.pid] ?? 0), 0),
    };
  }, [panelGroupInvs, panelAllReps]);

  // Total capital across all investments for this person
  const panelTotalCapital = useMemo(
    () => panelGroupInvs.reduce((s, inv) => s + (inv.capital ?? 0), 0),
    [panelGroupInvs],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <PageFilterBar filters={filters} config={{ city: true, property: true }} cities={cityOptions} properties={propOptions} />
      {/* ── Table card ────────────────────────────────────────────────────── */}
      <div className="tw">
        <div className="th">
          <div className="ct">Investor Analytics</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button className="btn btn-g btn-sm" onClick={() => {
              downloadCsv(
                ['Investor', 'Contact', 'Property', 'Capital', 'Pool Share%', 'Net Payout (Period)', 'ROI'],
                investors.map((inv) => {
                  const prop   = propMap[inv.propertyId];
                  const payout = invPayoutMap[inv.id] ?? 0;
                  const roi    = periodRoi[inv.id];
                  return [
                    inv.name, inv.contact || '',
                    prop?.name || '',
                    inv.capital ? String(inv.capital) : '',
                    inv.sharePct ? `${inv.sharePct}%` : '',
                    String(payout),
                    roi !== null && roi !== undefined ? `${roi}%` : 'N/A',
                  ];
                }),
                `mg-investors-${new Date().toISOString().slice(0, 10)}.csv`,
              );
            }}>↓ CSV</button>
            <button className="btn btn-g btn-sm" onClick={async () => {
              const { exportTablePdf } = await import('@/components/layout/exportPdf');
              await exportTablePdf({
                title: 'Investor Ledger',
                headers: ['Investor', 'Property', 'Capital', 'Pool Share%', 'Net Payout', 'ROI'],
                rows: investors.map((inv) => {
                  const prop   = propMap[inv.propertyId];
                  const payout = invPayoutMap[inv.id] ?? 0;
                  const roi    = periodRoi[inv.id];
                  return [
                    inv.name,
                    prop?.name || '—',
                    inv.capital ? 'Rs. ' + Number(inv.capital).toLocaleString('en-IN') : '—',
                    inv.sharePct ? `${inv.sharePct}%` : '—',
                    'Rs. ' + payout.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                    roi !== null && roi !== undefined ? `${roi}%` : 'N/A',
                  ];
                }),
                filename: `mg-investors-${new Date().toISOString().slice(0, 10)}.pdf`,
              });
            }}>↓ PDF</button>
            {canCreate && (
              <button className="btn btn-or btn-sm" onClick={handleAdd}>
                + Add Investor
              </button>
            )}
          </div>
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
            {/* Table — grouped by investor name, accordion for multi-property investors */}
            <table>
              <thead>
                <tr>
                  <th style={{ width: '28px' }} />
                  <th>Investor</th>
                  <th>Properties</th>
                  <th>Capital</th>
                  <th title="% of investor pool (not total profit)">Pool Share%</th>
                  <th>Net Payout</th>
                  <th>ROI</th>
                  {(canEdit || canDelete) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {groupedInvestors.map(({ name, groupKey, rows, totalCapital, totalPayout, combinedRoi }) => {
                  const isMulti    = rows.length > 1;
                  const isExpanded = expandedNames.has(groupKey);
                  const singleInv  = rows[0];

                  return (
                    <React.Fragment key={groupKey}>
                      {/* ── Summary row ─────────────────────────────────── */}
                      <tr
                        style={{ background: isExpanded ? 'var(--bg2)' : undefined, cursor: isMulti ? 'pointer' : undefined }}
                        onClick={isMulti ? () => toggleExpand(groupKey) : undefined}
                      >
                        {/* Expand toggle */}
                        <td style={{ textAlign: 'center', color: 'var(--t3)', fontSize: '10px', userSelect: 'none' }}>
                          {isMulti ? (isExpanded ? '▼' : '▶') : ''}
                        </td>

                        {/* Name + contact */}
                        <td>
                          <div style={{ fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); openDetail(singleInv); }}
                          >
                            {name}
                          </div>
                          {!isMulti && singleInv.contact && (
                            <div style={{ fontSize: '10.5px', color: 'var(--t3)' }}>{singleInv.contact}</div>
                          )}
                          {isMulti && (
                            <div style={{ fontSize: '10.5px', color: 'var(--t3)' }}>
                              {rows.length} properties
                            </div>
                          )}
                        </td>

                        {/* Property pills */}
                        <td style={{ maxWidth: '220px' }}>
                          {rows.map((inv) => {
                            const p = propMap[inv.propertyId];
                            return p
                              ? <span key={inv.id} className="pill b" style={{ margin: '1px 2px', display: 'inline-block' }}>{p.name}</span>
                              : null;
                          })}
                        </td>

                        {/* Capital — total when grouped */}
                        <td>{totalCapital > 0 ? fF(totalCapital) : '—'}</td>

                        {/* Pool Share% — show only when single */}
                        <td>{!isMulti ? (singleInv.sharePct ? singleInv.sharePct + '%' : '—') : <span style={{ color: 'var(--t3)', fontSize: '11px' }}>—</span>}</td>

                        {/* Net payout — total */}
                        <td style={{ fontWeight: 800, color: 'var(--gr)' }}>{fF(totalPayout)}</td>

                        {/* ROI — avg when grouped */}
                        <td style={{
                          fontWeight: 800,
                          color: combinedRoi !== null ? (combinedRoi >= 20 ? 'var(--gr)' : 'var(--go)') : 'var(--t3)',
                        }}>
                          {combinedRoi !== null ? combinedRoi + '%' : (
                            <span title="Capital not entered" style={{ cursor: 'help', textDecoration: 'underline dotted', color: 'var(--t3)' }}>N/A</span>
                          )}
                        </td>

                        {/* Actions — single investor only */}
                        {(canEdit || canDelete) && (
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {!isMulti && canEdit && (
                              <button className="btn btn-g btn-sm" title="Edit" onClick={(e) => { e.stopPropagation(); handleEdit(singleInv); }}>✏️</button>
                            )}
                            {!isMulti && canDelete && (
                              <button className="btn btn-rd btn-sm" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(singleInv); }} style={{ marginLeft: '4px' }}>🗑</button>
                            )}
                            {isMulti && (
                              <span style={{ fontSize: '10.5px', color: 'var(--t3)' }}>expand ↑↓</span>
                            )}
                          </td>
                        )}
                      </tr>

                      {/* ── Expanded child rows ──────────────────────────── */}
                      {isMulti && isExpanded && rows.map((inv) => {
                        const prop   = propMap[inv.propertyId];
                        const payout = invPayoutMap[inv.id] ?? 0;
                        const roi    = periodRoi[inv.id] ?? null;
                        return (
                          <tr key={inv.id} style={{ background: 'var(--bg2)', borderLeft: '3px solid var(--or)' }}>
                            {/* indent */}
                            <td />
                            {/* name — indented sub-row indicator */}
                            <td style={{ paddingLeft: '22px' }}>
                              <div style={{ fontSize: '11.5px', color: 'var(--t2)', fontStyle: 'italic' }}>
                                {inv.contact || '—'}
                              </div>
                            </td>
                            {/* property */}
                            <td>
                              {prop
                                ? <span className="pill b" style={{ display: 'inline-block' }}>{prop.name}</span>
                                : <span style={{ color: 'var(--t3)' }}>—</span>}
                            </td>
                            {/* capital */}
                            <td>{inv.capital ? fF(inv.capital) : '—'}</td>
                            {/* pool share */}
                            <td>{inv.sharePct ? inv.sharePct + '%' : '—'}</td>
                            {/* payout */}
                            <td style={{ fontWeight: 700, color: 'var(--gr)' }}>{fF(payout)}</td>
                            {/* roi */}
                            <td style={{
                              fontWeight: 700,
                              color: roi !== null ? (roi >= 20 ? 'var(--gr)' : 'var(--go)') : 'var(--t3)',
                            }}>
                              {roi !== null ? roi + '%' : <span title="Capital not entered" style={{ cursor: 'help', textDecoration: 'underline dotted', color: 'var(--t3)' }}>N/A</span>}
                            </td>
                            {/* actions */}
                            {(canEdit || canDelete) && (
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {canEdit && (
                                  <button className="btn btn-g btn-sm" title="Edit" onClick={() => handleEdit(inv)}>✏️</button>
                                )}
                                {canDelete && (
                                  <button className="btn btn-rd btn-sm" title="Delete" onClick={() => handleDelete(inv)} style={{ marginLeft: '4px' }}>🗑</button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
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
        sub={panelInv?.contact ? panelInv.contact : ''}
      >
        {panelInv && (
          <>
            {/* ── Investor Info ──────────────────────────────────────────── */}
            <div style={{ marginBottom: '18px' }}>
              <div className="dp-sl">Investor Profile</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div className="dp-k" style={{ gridColumn: '1 / -1' }}>
                  <div className="dp-kl">Name</div>
                  <div className="dp-kv" style={{ color: 'var(--tx)', fontWeight: 700 }}>{panelInv.name}</div>
                </div>
                {panelInv.contact && (
                  <div className="dp-k" style={{ gridColumn: '1 / -1' }}>
                    <div className="dp-kl">Contact</div>
                    <div className="dp-kv" style={{ color: 'var(--tx)' }}>{panelInv.contact}</div>
                  </div>
                )}
                <div className="dp-k">
                  <div className="dp-kl">Total Capital</div>
                  <div className="dp-kv" style={{ color: 'var(--tx)' }}>{fF(panelTotalCapital)}</div>
                </div>
                <div className="dp-k">
                  <div className="dp-kl">Properties</div>
                  <div className="dp-kv" style={{ color: 'var(--tx)' }}>{panelGroupInvs.length}</div>
                </div>
              </div>
            </div>

            {/* ── Linked Properties ──────────────────────────────────────── */}
            <div style={{ marginBottom: '18px' }}>
              <div className="dp-sl">
                {panelGroupInvs.length > 1 ? 'Linked Properties' : 'Linked Property'}
              </div>
              {panelGroupInvs.map((inv) => {
                const prop = propMap[inv.propertyId];
                return prop ? (
                  <div key={inv.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--bg2)', borderRadius: '7px',
                    padding: '8px 12px', marginBottom: '6px',
                    border: '1px solid var(--bdr)',
                  }}>
                    <div>
                      <span className="pill b" style={{ marginRight: '8px' }}>{prop.name}</span>
                      {prop.city && <span style={{ fontSize: '11px', color: 'var(--t3)' }}>{prop.city}</span>}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '11.5px' }}>
                      <span style={{ color: 'var(--t2)', fontWeight: 600 }}>{fF(inv.capital)}</span>
                      <span style={{ color: 'var(--t3)', marginLeft: '8px' }}>{inv.sharePct}% pool</span>
                    </div>
                  </div>
                ) : null;
              })}
            </div>

            {/* ── All-time aggregate KPIs ─────────────────────────────────── */}
            {panelAgg ? (
              <>
                <div className="dp-sl">All-Time Performance</div>
                <div className="dp-kpi">
                  <div className="dp-k">
                    <div className="dp-kl">Total Revenue</div>
                    <div className="dp-kv">{fF(panelAgg.rev)}</div>
                  </div>
                  <div className="dp-k">
                    <div className="dp-kl">Total Expenses</div>
                    <div className="dp-kv" style={{ color: 'var(--rd)' }}>{fF(panelAgg.exp)}</div>
                  </div>
                  <div className="dp-k">
                    <div className="dp-kl">Op. Profit</div>
                    <div className="dp-kv" style={{ color: 'var(--gr)' }}>{fF(panelAgg.opProfit)}</div>
                  </div>
                  <div className="dp-k">
                    <div className="dp-kl">Commission</div>
                    <div className="dp-kv" style={{ color: 'var(--or)' }}>{fF(panelAgg.commission)}</div>
                  </div>
                  <div className="dp-k">
                    <div className="dp-kl">Investor Net</div>
                    <div className="dp-kv" style={{ color: 'var(--bl)' }}>{fF(panelAgg.invProfit)}</div>
                  </div>
                  <div className="dp-k">
                    <div className="dp-kl">ROI</div>
                    <div className="dp-kv" style={{
                      color: panelTotalCapital > 0
                        ? (panelAgg.invProfit / panelTotalCapital * 100 >= 20 ? 'var(--gr)' : 'var(--go)')
                        : 'var(--t3)',
                    }}>
                      {panelTotalCapital > 0
                        ? (panelAgg.invProfit / panelTotalCapital * 100).toFixed(2) + '%'
                        : 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Period history — per-property when multi-property investor */}
                {panelGroupInvs.length === 1 ? (
                  panelAllReps.length > 0 && (
                    <InvReportHistory reps={panelAllReps} MS={MS} sharePct={panelGroupInvs[0].sharePct} />
                  )
                ) : (
                  panelGroupInvs.map((inv) => {
                    const prop = propMap[inv.propertyId];
                    const propReps = panelAllReps.filter((r) => r.pid === inv.propertyId);
                    if (!prop || !propReps.length) return null;
                    return (
                      <div key={inv.id} style={{ marginBottom: '8px' }}>
                        <InvReportHistory
                          reps={propReps}
                          MS={MS}
                          sharePct={inv.sharePct}
                          label={prop.name}
                        />
                      </div>
                    );
                  })
                )}
              </>
            ) : (
              <div className="es" style={{ margin: '0 0 16px' }}>
                <div className="es-ico">📊</div>
                <div className="es-t">No Data Yet</div>
                <div className="es-s">No reports for this investor's properties yet.</div>
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
  reps, MS, sharePct, label,
}: {
  reps: RepRow[];
  MS: string[];
  sharePct: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  // fF from module scope used for exact .00 precision in table cells
  const fraction = (sharePct || 0) / 100;

  return (
    <div style={{ marginTop: '8px' }}>
      <div
        style={{ cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, marginBottom: '7px', display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none', color: 'var(--t2)' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ color: 'var(--t3)' }}>{open ? '▼' : '▶'}</span>
        {label ? (
          <><span className="pill b" style={{ fontSize: '10px' }}>{label}</span><span>Period History ({reps.length})</span></>
        ) : (
          <span>Period History ({reps.length})</span>
        )}
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
                <th>My Share</th>
                <th>Occ</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((r) => (
                <tr key={r.id}>
                  <td>{MS[r.month]} {r.year}</td>
                  <td>{fF(r.rev)}</td>
                  <td style={{ color: 'var(--gr)' }}>{fF(r.opProfit)}</td>
                  <td style={{ color: 'var(--or)' }}>{fF(r.commission)}</td>
                  <td style={{ color: 'var(--bl)' }}>{fF(r.invProfit * fraction)}</td>
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