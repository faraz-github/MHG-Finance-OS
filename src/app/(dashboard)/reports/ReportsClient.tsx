'use client';
// src/app/(dashboard)/reports/ReportsClient.tsx
//
// Client Component. Two sections, pixel-matched to the HTML:
//
//  1. Collapsible report list (toggleRepList + rndReports)
//     - Period-filtered, sorted newest-first, paginated (PAGE_SIZE=20)
//     - Rows: property name + period, KPI meta line, 👁 snapshot + ↓ CSV
//     - 👁 opens a DetailPanel slide-in with full calcF() output
//     - ↓ generates a CSV client-side from the report row data (no server call)
//
//  2. Generate Reports card grid (6 export-type cards)
//     - Each calls POST /api/exports — wired in Phase 6 API layer
//
// FIX (Bug 12): propById was () => null — city/property filters broken.
//               Per-row ↓ now generates CSV client-side immediately.
//               Empty state has a "Regenerate" button.

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePeriod } from '@/hooks/usePeriod';
import { usePageFilters } from '@/hooks/usePageFilters';
import { PageFilterBar } from '@/components/layout/PageFilterBar';
import type { FilterOption } from '@/components/layout/PageFilterBar';
import type { RepRow } from '@/lib/period';
import { Pagination } from '@/components/ui/Pagination';
import { DetailPanel } from '@/components/ui/DetailPanel';
import { useToast } from '@/components/ui/Toast';
import type { SerializableReport, SerializableProperty } from '../dashboard/page';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Formatting helpers — 2 decimal places throughout
// ---------------------------------------------------------------------------

function fIN(n: number) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MN = ['','January','February','March','April','May','June',
            'July','August','September','October','November','December'];

// ---------------------------------------------------------------------------
// csvDownload — builds a CSV from one report row and triggers browser download
// ---------------------------------------------------------------------------

function csvDownload(rep: SerializableReport, propName: string) {
  const rows = [
    ['Field', 'Value'],
    ['Property', propName],
    ['Period', `${MN[rep.month]} ${rep.year}`],
    ['Revenue', rep.rev],
    ['Expenses', rep.exp],
    ['Operating Profit', rep.opProfit],
    ['Commission', rep.commission],
    ['Investor Profit', rep.invProfit],
    ['Nights', rep.nights],
    ['Occupancy %', rep.occ],
    ['ADR', rep.adr ?? 0],
    ['RevPAR', rep.revpar ?? 0],
    ['ROI %', rep.roi ?? 0],
  ];

  // Append expense categories
  if (rep.expCats && Object.keys(rep.expCats).length) {
    rows.push(['', '']);
    rows.push(['Expense Category', 'Amount']);
    Object.entries(rep.expCats).forEach(([k, v]) => rows.push([k, v]));
  }

  // Append channels
  if (rep.channels && Object.keys(rep.channels).length) {
    rows.push(['', '']);
    rows.push(['Booking Channel', 'Nights']);
    Object.entries(rep.channels).forEach(([k, v]) => rows.push([k, v]));
  }

  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mg-report-${propName.replace(/\s+/g, '-')}-${rep.year}-${String(rep.month).padStart(2, '0')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Export card config — verbatim from the HTML card grid
// ---------------------------------------------------------------------------

const EXPORT_CARDS = [
  { icon: '📅', title: 'Monthly Report',  sub: 'All properties for selected month',    type: 'monthly',  btnClass: 'btn btn-or' },
  { icon: '🏠', title: 'Property-wise',   sub: 'Individual breakdown per property',    type: 'property', btnClass: 'btn btn-or' },
  { icon: '📈', title: 'Annual Report',   sub: 'Full year summary',                    type: 'annual',   btnClass: 'btn btn-or' },
  { icon: '🏦', title: 'Investor Report', sub: 'ROI & payout breakdown',               type: 'investor', btnClass: 'btn btn-or' },
  { icon: '🏙️', title: 'Consolidated',   sub: 'Multi-property combined',              type: 'monthly',  btnClass: 'btn btn-or' },
  { icon: '📊', title: 'Raw Data',        sub: 'Full data for spreadsheet',            type: 'raw',      btnClass: 'btn btn-g'  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReportsClientProps {
  reports: SerializableReport[];
  properties: SerializableProperty[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportsClient({
  reports,
  properties,
}: ReportsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  const { getFilteredReps, ...periodState } = usePeriod();
  const filters = usePageFilters({ city: true, property: true });

  // ── Local state ───────────────────────────────────────────────────────────
  const [listOpen, setListOpen]         = useState(true);
  const [page, setPage]                 = useState(1);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotRep, setSnapshotRep]   = useState<SerializableReport | null>(null);
  const [isRegen, setIsRegen]           = useState(false);

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

  // ── Period-filtered + sorted reports ─────────────────────────────────────
  const filteredReps = useMemo(
    () => getFilteredReps(reports as RepRow[], propById, pageFilterState),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports, propById, pageFilterState,
     periodState.cPType, periodState.cM, periodState.cY,
     periodState.cQ, periodState.cFY, periodState.cDateFrom, periodState.cDateTo,
     periodState.cDay, periodState.cWeek],
  );

  const sortedReps = useMemo(
    () => [...filteredReps].sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month)),
    [filteredReps],
  );

  const totalPages = Math.max(1, Math.ceil(sortedReps.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = sortedReps.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Toggle list ───────────────────────────────────────────────────────────
  function handleToggleList() {
    if (!listOpen) setPage(1);
    setListOpen((v) => !v);
  }

  // ── Regenerate reports ────────────────────────────────────────────────────
  async function handleRegen() {
    setIsRegen(true);
    try {
      const res = await fetch('/api/regen-reports', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Regeneration failed', 'er');
        return;
      }
      const data = await res.json().catch(() => ({}));
      toast(`✓ ${data.count ?? 'Reports'} regenerated successfully`, 'ok');
      startTransition(() => router.refresh());
    } catch {
      toast('Network error — please try again', 'er');
    } finally {
      setIsRegen(false);
    }
  }

  // ── Export (server-side bulk) ─────────────────────────────────────────────
  async function handleExport(type: string) {
    try {
      const res = await fetch('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) { toast('Export failed', 'er'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `mg-${type}-export.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast('Export API not available', 'er');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <PageFilterBar filters={filters} config={{ city: true, property: true }} cities={cityOptions} properties={propOptions} />
      {/* ══ Section 1: Collapsible Report List ════════════════════════════ */}
      <div
        className="stl"
        style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span onClick={handleToggleList} style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
          <div className="d" />
          <span>{listOpen ? '▼' : '▶'}</span>
          Auto-Generated Reports{' '}
          <span style={{ fontSize: '10px', color: 'var(--t3)', fontWeight: 400 }}>
            ({filteredReps.length} for current period)
          </span>
        </span>
        <button
          className="btn btn-g btn-sm"
          style={{ fontSize: '11px' }}
          onClick={handleRegen}
          disabled={isRegen}
        >
          {isRegen ? '…' : '↻ Regenerate'}
        </button>
      </div>

      {listOpen && (
        <div className="tw" style={{ marginBottom: '16px' }}>
          <div className="th">
            <div className="ct">Filtered by current period</div>
          </div>

          {sortedReps.length === 0 ? (
            <div className="es" style={{ margin: '16px', borderRadius: 'var(--r)' }}>
              <div className="es-ico">📄</div>
              <div className="es-t">No Reports for This Period</div>
              <div className="es-s">
                {reports.length === 0
                  ? 'No reports exist yet. Add bookings via Monthly Entry, then click Regenerate.'
                  : 'Change the period filter or click Regenerate to rebuild reports.'}
              </div>
              <button
                className="btn btn-or btn-sm"
                onClick={handleRegen}
                disabled={isRegen}
                style={{ marginTop: '12px' }}
              >
                {isRegen ? 'Regenerating…' : '↻ Regenerate Reports'}
              </button>
            </div>
          ) : (
            <>
              {/* Report rows */}
              {paginated.map((r) => {
                const prop = propMap[r.pid];
                const propName = prop?.name ?? 'Unknown';
                return (
                  <div key={r.id} className="rrow">
                    <div className="rico">📄</div>
                    <div className="rinfo">
                      <div className="rname">
                        {propName} — {MN[r.month]} {r.year}
                      </div>
                      <div className="rmeta">
                        Rev: {fIN(r.rev)} · Exp: {fIN(r.exp)} · Profit: {fIN(r.opProfit)} · Occ: {(r.occ ?? 0).toFixed(1)}% · ROI: {r.roi !== null ? (r.roi ?? 0).toFixed(2) + '%' : 'N/A'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                      {/* View — opens slide-in DetailPanel */}
                      <button
                        className="btn btn-g btn-sm"
                        title="View snapshot"
                        onClick={() => { setSnapshotRep(r); setSnapshotOpen(true); }}
                      >
                        👁 View
                      </button>
                      {/* Download — client-side CSV, no server call */}
                      <button
                        className="btn btn-g btn-sm"
                        title="Download CSV"
                        onClick={() => csvDownload(r, propName)}
                      >
                        ↓ CSV
                      </button>
                    </div>
                  </div>
                );
              })}

              {totalPages > 1 && (
                <Pagination
                  total={sortedReps.length}
                  page={safePage}
                  pageSize={PAGE_SIZE}
                  onChange={(p) => setPage(p)}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ══ Section 2: Generate Reports ═══════════════════════════════════ */}
      <div className="stl"><div className="d" />Generate Reports</div>

      <div className="rg3" style={{ marginBottom: '16px' }}>
        {EXPORT_CARDS.map((card) => (
          <div key={card.title} className="cc" style={{ textAlign: 'center', padding: '22px 16px' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>{card.icon}</div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, marginBottom: '3px' }}>
              {card.title}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '14px' }}>
              {card.sub}
            </div>
            <button
              className={card.btnClass}
              style={{ width: '100%' }}
              onClick={() => handleExport(card.type)}
            >
              Select &amp; Export
            </button>
          </div>
        ))}
      </div>

      {/* ══ Report Snapshot Detail Panel — slide in from right ═════════════ */}
      <DetailPanel
        isOpen={snapshotOpen}
        onClose={() => setSnapshotOpen(false)}
        title={snapshotRep ? (propMap[snapshotRep.pid]?.name ?? 'Report') : 'Report'}
        sub={
          snapshotRep
            ? `${MN[snapshotRep.month]} ${snapshotRep.year} — Report Snapshot`
            : ''
        }
      >
        {snapshotRep && (
          <ReportSnapshot rep={snapshotRep} propMap={propMap} />
        )}
      </DetailPanel>
    </>
  );
}

// ---------------------------------------------------------------------------
// ReportSnapshot — verbatim port of showReportSnapshot() panel body
// ---------------------------------------------------------------------------

function ReportSnapshot({
  rep,
  propMap,
}: {
  rep: SerializableReport;
  propMap: Record<string, SerializableProperty>;
}) {
  const prop = propMap[rep.pid];

  const KPI_ROWS = [
    { l: 'Revenue',                           v: fIN(rep.rev),                                                      c: 'var(--tx)' },
    { l: 'Expenses',                          v: fIN(rep.exp),                                                      c: 'var(--rd)' },
    { l: 'Op. Profit',                        v: fIN(rep.opProfit),                                                 c: 'var(--gr)' },
    { l: `Commission (${prop?.comm ?? 25}%)`, v: fIN(rep.commission),                                               c: 'var(--or)' },
    { l: 'Investor Net',                      v: fIN(rep.invProfit),                                                c: 'var(--bl)' },
    { l: 'Nights',                            v: String(rep.nights ?? 0),                                          c: 'var(--tx)' },
    { l: 'Occupancy',                         v: (rep.occ ?? 0).toFixed(1) + '%',                                  c: 'var(--go)' },
    { l: 'ROI',                               v: rep.roi !== null ? (rep.roi ?? 0).toFixed(2) + '%' : 'N/A',       c: 'var(--or)' },
    { l: 'ADR',                               v: fIN(rep.adr ?? 0),                                                c: 'var(--tx)' },
    { l: 'RevPAR',                            v: fIN(rep.revpar ?? 0),                                             c: 'var(--gr)' },
  ];

  return (
    <>
      {/* Period header */}
      <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '12px' }}>
        {prop?.name ?? 'Unknown'} — {MN[rep.month]} {rep.year}
      </div>

      {/* KPI grid */}
      <div className="dp-kpi" style={{ marginBottom: '14px' }}>
        {KPI_ROWS.map((k) => (
          <div key={k.l} className="dp-k">
            <div className="dp-kl">{k.l}</div>
            <div className="dp-kv" style={{ color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Expense breakdown */}
      {rep.expCats && Object.keys(rep.expCats).length > 0 && (
        <div style={{ background: 'var(--rdp)', borderRadius: '9px', padding: '11px 13px', marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--rd)', marginBottom: '7px' }}>
            EXPENSE BREAKDOWN
          </div>
          {Object.entries(rep.expCats)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                <span>{k.replace(/-/g, ' ')}</span>
                <span style={{ fontWeight: 600 }}>{fIN(v)}</span>
              </div>
            ))}
        </div>
      )}

      {/* Channel breakdown */}
      {rep.channels && Object.keys(rep.channels).length > 0 && (() => {
        const totN = Object.values(rep.channels).reduce((s, v) => s + v, 0);
        return (
          <div style={{ background: 'var(--grp)', borderRadius: '9px', padding: '11px 13px', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gr)', marginBottom: '7px' }}>
              BOOKING CHANNELS
            </div>
            {Object.entries(rep.channels)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                  <span>{k}</span>
                  <span style={{ fontWeight: 600 }}>
                    {v} nights
                    {totN > 0 ? ` (${((v / totN) * 100).toFixed(0)}%)` : ''}
                  </span>
                </div>
              ))}
          </div>
        );
      })()}
    </>
  );
}
//
//  1. Collapsible report list (toggleRepList + rndReports)
//     - Period-filtered, sorted newest-first, paginated (PAGE_SIZE=20)
//     - Rows: property name + period, KPI meta line, 👁 snapshot + ↓ CSV
//     - Snapshot opens a DetailPanel with the full calcF() output
//
