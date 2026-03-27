'use client';
// src/app/(dashboard)/properties/PropertiesClient.tsx

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePeriod } from '@/hooks/usePeriod';
import { usePageFilters } from '@/hooks/usePageFilters';
import { PageFilterBar } from '@/components/layout/PageFilterBar';
import type { FilterOption } from '@/components/layout/PageFilterBar';
import { aggReps, withD } from '@/lib/period';
import type { RepRow } from '@/lib/period';
import { Pagination } from '@/components/ui/Pagination';
import { DetailPanel } from '@/components/ui/DetailPanel';
import { useToast } from '@/components/ui/Toast';
import { PropModal } from './PropModal';
import type { PropertySavePayload, PropertyFormValues } from './PropModal';
import type { SerializableProperty, SerializableReport } from './page';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

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

function fF(n: number): string {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MN = ['', 'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PropertiesClientProps {
  properties: SerializableProperty[];
  reports:    SerializableReport[];
  canCreate:  boolean;
  canEdit:    boolean;
  canDelete:  boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PropertiesClient({
  properties: initialProperties,
  reports,
  canCreate,
  canEdit,
  canDelete,
}: PropertiesClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [page,        setPage]        = useState(1);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editId,      setEditId]      = useState<string | null>(null);
  const [editValues,  setEditValues]  = useState<Partial<PropertyFormValues> | undefined>();
  const [isSaving,    setIsSaving]    = useState(false);
  const [panelOpen,   setPanelOpen]   = useState(false);
  const [panelProp,   setPanelProp]   = useState<SerializableProperty | null>(null);

  // ── Period + filters ──────────────────────────────────────────────────────
  const { getFilteredReps, ...periodState } = usePeriod();
  const filters = usePageFilters({ city: true, property: true, comm: true });

  const propMap = useMemo(
    () => Object.fromEntries(initialProperties.map((p) => [p.id, p])),
    [initialProperties],
  );

  const propById = (pid: string) =>
    propMap[pid]
      ? { id: pid, city: propMap[pid].city, comm: propMap[pid].effectiveComm }
      : null;

  const allReps = reports as RepRow[];

  const pageFilterState = useMemo(
    () => ({ cCi: filters.city, cPid: filters.property, cComm: filters.comm }),
    [filters.city, filters.property, filters.comm],
  );

  // ── Filter options ────────────────────────────────────────────────────────

  const cityOptions: FilterOption[] = useMemo(
    () => [...new Set(initialProperties.map((p) => p.city).filter(Boolean))].sort()
      .map((c) => ({ value: c, label: c })),
    [initialProperties],
  );

  const propOptions: FilterOption[] = useMemo(
    () => initialProperties.map((p) => ({ value: p.id, label: p.name })),
    [initialProperties],
  );

  // Commission filter options — derived from actual property effectiveComm values
  // so custom commissions and broker-adjusted commissions always appear
  const commOptions: FilterOption[] = useMemo(
    () => [...new Set(initialProperties.map((p) => Math.round(p.effectiveComm)))]
      .sort((a, b) => a - b)
      .map((c) => ({ value: String(c), label: `${c}%` })),
    [initialProperties],
  );

  // ── Report aggregation ────────────────────────────────────────────────────

  const filteredReps = useMemo(
    () => getFilteredReps(allReps, propById, pageFilterState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allReps, JSON.stringify(propMap), pageFilterState,
     periodState.cPType, periodState.cM, periodState.cY,
     periodState.cQ, periodState.cFY, periodState.cDateFrom, periodState.cDateTo,
     periodState.cDay, periodState.cWeek],
  );

  const propAggMap = useMemo(() => {
    const m: Record<string, ReturnType<typeof withD>> = {};
    initialProperties.forEach((p) => {
      const pReps = filteredReps.filter((r) => r.pid === p.id);
      m[p.id] = pReps.length
        ? withD(aggReps(pReps, () => propMap[p.id]?.capital ?? 0))
        : null;
    });
    return m;
  }, [filteredReps, initialProperties, propMap]);

  const totalRepCount = useMemo(() => {
    const m: Record<string, number> = {};
    allReps.forEach((r) => { m[r.pid] = (m[r.pid] ?? 0) + 1; });
    return m;
  }, [allReps]);

  // ── Pagination ────────────────────────────────────────────────────────────

  const totalPages  = Math.max(1, Math.ceil(initialProperties.length / PAGE_SIZE));
  const safePageNum = Math.min(page, totalPages);
  const paginated   = initialProperties.slice((safePageNum - 1) * PAGE_SIZE, safePageNum * PAGE_SIZE);

  // Apply property filter to the visible rows — when a specific property is
  // selected, only that row is shown in the table.
  const visibleProperties = filters.property === 'all'
    ? paginated
    : paginated.filter((p) => p.id === filters.property);

  // ── Modal handlers ────────────────────────────────────────────────────────

  function handleAdd() {
    setEditId(null);
    setEditValues(undefined);
    setModalOpen(true);
  }

  function handleEdit(p: SerializableProperty) {
    const stdComms = ['20', '25', '30'];
    const commStr  = String(Math.round(p.comm));
    setEditId(p.id);
    setEditValues({
      name:          p.name,
      city:          p.city,
      state:         p.state,
      comm:          stdComms.includes(commStr) ? commStr : 'custom',
      commCustom:    stdComms.includes(commStr) ? '' : commStr,
      address:       p.address ?? '',
      capital:       p.capital ? String(p.capital) : '',
      assets:        (p.assets ?? []).map((a, i) => ({ ...a, id: i + 1, type: a.type as 'refundable' | 'recoverable' })),
      broker_name:   p.broker_name,
      broker_pct:    String(p.broker_pct),
      broker_public: p.broker_public,
    });
    setModalOpen(true);
  }

  async function handleSave(payload: PropertySavePayload, id: string | null) {
    setIsSaving(true);
    try {
      const method = id ? 'PATCH' : 'POST';
      const url    = id ? `/api/properties/${id}` : '/api/properties';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Failed to save property', 'er');
        return;
      }
      toast(`✓ "${payload.name}" ${id ? 'updated' : 'added'}`, 'ok');
      setModalOpen(false);
      startTransition(() => router.refresh());
    } catch {
      toast('Network error — please try again', 'er');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(p: SerializableProperty) {
    if (!window.confirm(
      `Delete "${p.name}" and ALL linked data (reports, bookings, expenses, payouts, utilities)?`,
    )) return;
    try {
      const res = await fetch(`/api/properties/${p.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Failed to delete property', 'er');
        return;
      }
      toast(`✓ "${p.name}" deleted`, 'ok');
      if (panelProp?.id === p.id) setPanelOpen(false);
      startTransition(() => router.refresh());
    } catch {
      toast('Network error — please try again', 'er');
    }
  }

  // ── Detail panel ──────────────────────────────────────────────────────────

  function openDetail(p: SerializableProperty) {
    setPanelProp(p);
    setPanelOpen(true);
  }

  const panelLatestRep = useMemo(() => {
    if (!panelProp) return null;
    return allReps
      .filter((r) => r.pid === panelProp.id)
      .sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month))[0] ?? null;
  }, [panelProp, allReps]);

  const panelAllReps = useMemo(() => {
    if (!panelProp) return [];
    return allReps
      .filter((r) => r.pid === panelProp.id)
      .sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month));
  }, [panelProp, allReps]);

  // Suppress unused variable warning
  void isPending;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <PageFilterBar
        filters={filters}
        config={{ city: true, property: true, comm: true }}
        cities={cityOptions}
        properties={propOptions}
        commOptions={commOptions}
      />

      <div className="tw">
        {/* Header */}
        <div className="th">
          <div>
            <div className="ct">
              {visibleProperties.length} {visibleProperties.length === 1 ? 'Property' : 'Properties'}
              {filters.property !== 'all' && initialProperties.length > 1 && (
                <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: 400, marginLeft: '6px' }}>
                  (of {initialProperties.length})
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {canCreate && (
              <button className="btn btn-or btn-sm" onClick={handleAdd}>
                + Add Property
              </button>
            )}
          </div>
        </div>

        {/* Empty state */}
        {initialProperties.length === 0 ? (
          <div className="es" style={{ margin: '16px', borderRadius: 'var(--r)' }}>
            <div className="es-ico">🏠</div>
            <div className="es-t">No Properties</div>
            <div className="es-s">Add your first property.</div>
            {canCreate && <button className="btn btn-or" onClick={handleAdd}>Add Property</button>}
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>City</th>
                    <th>Comm%</th>
                    <th>Revenue</th>
                    <th>Investor Net</th>
                    <th>MHG Commission</th>
                    <th>Occupancy</th>
                    <th>ROI</th>
                    <th>Reports</th>
                    {(canEdit || canDelete) && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleProperties.map((p) => {
                    const lR        = propAggMap[p.id];
                    const totalRpts = totalRepCount[p.id] ?? 0;
                    const hasBroker = p.broker_public && p.broker_name && p.broker_pct > 0;

                    return (
                      <tr key={p.id}>
                        {/* Property name */}
                        <td>
                          <div
                            style={{ fontSize: '13px', fontWeight: 700, color: 'var(--or)', cursor: 'pointer' }}
                            onClick={() => openDetail(p)}
                          >
                            {p.name}
                          </div>
                          <div style={{ fontSize: '10.5px', color: 'var(--t3)' }}>
                            {p.city}{p.state ? `, ${p.state}` : ''}
                          </div>
                        </td>

                        {/* City */}
                        <td>{p.city || '—'}</td>

                        {/* Comm% — shows effectiveComm when broker is public */}
                        <td>
                          <span className="pill o">{p.effectiveComm}%</span>
                          {hasBroker && (
                            <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '2px' }}>
                              +{p.broker_pct}% {p.broker_name}
                            </div>
                          )}
                        </td>

                        {/* Revenue */}
                        <td>
                          {lR ? fI(lR.rev) : <span style={{ color: 'var(--t3)' }}>—</span>}
                        </td>

                        {/* Investor Net */}
                        <td>
                          {lR
                            ? <span style={{ color: 'var(--gr)', fontWeight: 700 }}>{fI(lR.invProfit)}</span>
                            : <span style={{ color: 'var(--t3)' }}>—</span>}
                        </td>

                        {/* MHG Commission — label changes when broker is public */}
                        <td>
                          {lR ? (
                            <div>
                              <span style={{ color: 'var(--or)', fontWeight: 700 }}>{fI(lR.commission)}</span>
                              {hasBroker && (
                                <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '2px' }}>
                                  incl. broker
                                </div>
                              )}
                            </div>
                          ) : <span style={{ color: 'var(--t3)' }}>—</span>}
                        </td>

                        {/* Occupancy */}
                        <td>
                          {lR ? (
                            <div style={{ fontWeight: 600 }}>
                              {lR.occ ?? 0}%
                              <div className="pb">
                                <div className="pf" style={{
                                  width: `${lR.occ ?? 0}%`,
                                  background: (lR.occ ?? 0) >= 75 ? 'var(--gr)' : 'var(--go)',
                                }} />
                              </div>
                            </div>
                          ) : '—'}
                        </td>

                        {/* ROI — always use roiDisplay from withD() */}
                        <td>
                          {lR ? (
                            <span style={{
                              fontWeight: 800,
                              color: !lR._hasCapital
                                ? 'var(--t3)'
                                : (lR.roi ?? 0) >= 20 ? 'var(--gr)' : 'var(--rd)',
                            }}>
                              {lR.roiDisplay}
                            </span>
                          ) : '—'}
                        </td>

                        {/* Reports */}
                        <td><span className="pill b">{totalRpts} rpts</span></td>

                        {/* Actions */}
                        {(canEdit || canDelete) && (
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {canEdit && (
                              <button className="btn btn-g btn-sm" title="Edit Property" onClick={() => handleEdit(p)}>✏️</button>
                            )}
                            {canDelete && (
                              <button className="btn btn-rd btn-sm" title="Delete Property" onClick={() => handleDelete(p)} style={{ marginLeft: '4px' }}>🗑</button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination — only when property filter is 'all' */}
            {filters.property === 'all' && totalPages > 1 && (
              <Pagination
                total={initialProperties.length}
                page={safePageNum}
                pageSize={PAGE_SIZE}
                onChange={(p) => setPage(p)}
              />
            )}
          </>
        )}
      </div>

      {/* Add/Edit modal */}
      <PropModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editId={editId}
        initialValues={editValues}
        onSave={handleSave}
        isSaving={isSaving}
      />

      {/* Detail panel */}
      <DetailPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={panelProp?.name ?? ''}
        sub={panelProp
          ? `${panelProp.city}${panelProp.state ? ', ' + panelProp.state : ''} · Commission: ${panelProp.effectiveComm}%`
          : ''}
      >
        {panelProp && (
          panelLatestRep ? (
            <>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '9px' }}>
                {MN[panelLatestRep.month]} {panelLatestRep.year} — Latest Data
              </div>

              {/* KPI grid */}
              <div className="dp-kpi">
                <div className="dp-k"><div className="dp-kl">Revenue</div><div className="dp-kv">{fI(panelLatestRep.rev)}</div></div>
                <div className="dp-k"><div className="dp-kl">Expenses</div><div className="dp-kv" style={{ color: 'var(--rd)' }}>{fI(panelLatestRep.exp)}</div></div>
                <div className="dp-k"><div className="dp-kl">Op. Profit</div><div className="dp-kv" style={{ color: 'var(--gr)' }}>{fI(panelLatestRep.opProfit)}</div></div>
                <div className="dp-k">
                  <div className="dp-kl">Commission ({panelProp.effectiveComm}%)</div>
                  <div className="dp-kv" style={{ color: 'var(--or)' }}>{fI(panelLatestRep.commission)}</div>
                  <div className="dp-ks">{panelProp.broker_public && panelProp.broker_name ? 'MHG + broker' : 'of op. profit'}</div>
                </div>
                <div className="dp-k"><div className="dp-kl">Investor Net</div><div className="dp-kv" style={{ color: 'var(--bl)' }}>{fI(panelLatestRep.invProfit)}</div></div>
                <div className="dp-k">
                  <div className="dp-kl">Occupancy</div>
                  <div className="dp-kv" style={{ color: (panelLatestRep.occ ?? 0) >= 75 ? 'var(--gr)' : 'var(--go)' }}>
                    {panelLatestRep.occ ?? 0}%
                  </div>
                </div>
                <div className="dp-k">
                  <div className="dp-kl">ROI</div>
                  <div className="dp-kv" style={{ color: panelLatestRep.roi > 0 ? ((panelLatestRep.roi ?? 0) >= 20 ? 'var(--gr)' : 'var(--rd)') : 'var(--t3)' }}>
                    {panelProp.capital > 0 ? (panelLatestRep.roi ?? 0).toFixed(2) + '%' : 'N/A'}
                  </div>
                </div>
                <div className="dp-k"><div className="dp-kl">ADR</div><div className="dp-kv">{fI(panelLatestRep.adr ?? 0)}</div></div>
                <div className="dp-k"><div className="dp-kl">RevPAR</div><div className="dp-kv">{fI(panelLatestRep.revpar ?? 0)}</div></div>
              </div>

              {/* Commission breakdown box */}
              <div style={{ background: 'var(--orp)', borderRadius: '9px', padding: '11px 13px', marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--or)', marginBottom: '7px' }}>COMMISSION BREAKDOWN</div>
                <div style={{ fontSize: '12px', color: 'var(--tx)', lineHeight: 2.1 }}>
                  Revenue: <strong>{fF(panelLatestRep.rev)}</strong><br />
                  − Expenses: <strong>{fF(panelLatestRep.exp)}</strong><br />
                  = Operating Profit: <strong style={{ color: 'var(--gr)' }}>{fF(panelLatestRep.opProfit)}</strong><br />
                  {/* When broker is public, show split breakdown */}
                  {panelProp.broker_public && panelProp.broker_name && panelProp.broker_pct > 0 ? (
                    <>
                      − MHG ({panelProp.comm}%): <strong style={{ color: 'var(--or)' }}>
                        {fF(Math.round(Math.max(0, panelLatestRep.opProfit) * panelProp.comm / 100))}
                      </strong><br />
                      − {panelProp.broker_name} ({panelProp.broker_pct}%): <strong style={{ color: 'var(--or)' }}>
                        {fF(Math.round(Math.max(0, panelLatestRep.opProfit) * panelProp.broker_pct / 100))}
                      </strong><br />
                    </>
                  ) : (
                    <>− Commission ({panelProp.comm}% × op.profit): <strong style={{ color: 'var(--or)' }}>{fF(panelLatestRep.commission)}</strong><br /></>
                  )}
                  = <strong>Investor Net: <span style={{ color: 'var(--bl)' }}>{fF(panelLatestRep.invProfit)}</span></strong>
                </div>
              </div>

              {/* Booking channels */}
              {panelLatestRep.channels && Object.keys(panelLatestRep.channels).length > 0 && (() => {
                const chT = Object.values(panelLatestRep.channels).reduce((a, b) => a + b, 0);
                return (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, marginBottom: '7px' }}>Booking Channels</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {Object.entries(panelLatestRep.channels)
                        .filter(([, v]) => v > 0)
                        .map(([k, v]) => (
                          <span key={k} className="pill b">
                            {k}: {chT > 0 ? ((v / chT) * 100).toFixed(0) : 0}%
                          </span>
                        ))}
                    </div>
                  </div>
                );
              })()}

              {panelAllReps.length > 1 && <ReportHistory reps={panelAllReps} capital={panelProp.capital} />}
            </>
          ) : (
            <div className="es" style={{ margin: '0 0 16px' }}>
              <div className="es-ico">📊</div>
              <div className="es-t">No Data</div>
              <div className="es-s">No reports for this property yet.</div>
            </div>
          )
        )}
      </DetailPanel>
    </>
  );
}

// ---------------------------------------------------------------------------
// ReportHistory — collapsible, with correct N/A ROI display
// ---------------------------------------------------------------------------

function ReportHistory({ reps, capital }: { reps: SerializableReport[]; capital: number }) {
  const [open, setOpen] = useState(false);
  const MS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fI = (n: number) => {
    const v = Math.abs(n);
    if (v >= 100000) return (n < 0 ? '-' : '') + '₹' + (v / 100000).toFixed(2) + 'L';
    if (v >= 1000)   return (n < 0 ? '-' : '') + '₹' + (v / 1000).toFixed(2) + 'K';
    return (n < 0 ? '-' : '') + '₹' + v.toFixed(2);
  };

  return (
    <div>
      <div
        style={{ cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, marginBottom: '7px', display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? '▼' : '▶'}</span>
        Report History ({reps.length})
      </div>
      {open && (
        <div style={{ overflow: 'auto', border: '1px solid var(--bdr)', borderRadius: '8px' }}>
          <table style={{ width: '100%', fontSize: '11px' }}>
            <thead>
              <tr>
                <th>Period</th><th>Revenue</th><th>Op.Profit</th>
                <th>Commission</th><th>Investor</th><th>Occ</th><th>ROI</th>
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
                  {/* Use capital to decide N/A vs value — fixes 0% display bug */}
                  <td style={{ color: capital > 0 ? ((r.roi ?? 0) >= 20 ? 'var(--gr)' : 'var(--rd)') : 'var(--t3)' }}>
                    {capital > 0 ? (r.roi ?? 0) + '%' : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
