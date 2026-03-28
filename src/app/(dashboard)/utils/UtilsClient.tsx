'use client';
// src/app/(dashboard)/utils/UtilsClient.tsx
//
// Client Component. Renders the full Rent & Utilities Tracker page.
//
// Pixel-matched to HTML #page-utils + rndUtils() + toggleUtilStatus().
//
// KEY ARCHITECTURAL NOTE — isolated local filter:
//   The HTML comment says "Local filter (isolated from global cM/cY)".
//   This page's month/year filter is COMPLETELY INDEPENDENT of the global
//   PeriodBar. The user picks month/year/property from selects on THIS page.
//   This is verbatim from the HTML and must not be connected to Zustand.
//
// STORAGE NOTE (v1):
//   No UtilsEntry model exists in the schema. Entries are stored as a JSON
//   array in UtilsSetting under key='utils_entries'. The page fetches this
//   via the server shell and passes it as a prop. Mutations call
//   POST/PATCH/DELETE /api/utils — fully wired.
//   The evaluation migration plan documents the UtilsEntry model to add.
//
// Source: <div class="page" id="page-utils"> + rndUtils(), saveUtil(),
//         editUtil(), delUtil(), toggleUtilStatus()

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { UtilModal } from './UtilModal';
import type { UtilFormValues } from './UtilModal';

// ---------------------------------------------------------------------------
// Minimal property type — utils only needs id, name, city
// ---------------------------------------------------------------------------

export interface UtilsProperty {
  id:   string;
  name: string;
  city: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UtilEntry {
  id: string;
  type: 'rent' | 'electricity' | 'custom';
  pid: string;
  cn: string;
  label: string;
  amount: number;
  dueDate: string;   // YYYY-MM-DD
  paidDate: string;  // YYYY-MM-DD or ''
  status: 'pending' | 'paid';
  tds: boolean;
  gst: boolean;
  notes: string;
}

type UtilTab = 'rent' | 'electricity' | 'custom';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const fIN = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MS_OPTS = [
  { v: 'all', l: 'All Months' },
  { v: '1', l: 'Jan' }, { v: '2', l: 'Feb' }, { v: '3', l: 'Mar' },
  { v: '4', l: 'Apr' }, { v: '5', l: 'May' }, { v: '6', l: 'Jun' },
  { v: '7', l: 'Jul' }, { v: '8', l: 'Aug' }, { v: '9', l: 'Sep' },
  { v: '10', l: 'Oct' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dec' },
];

const TAB_LABEL: Record<UtilTab, string> = {
  rent: 'Rent', electricity: 'Electricity', custom: 'Custom',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface UtilsClientProps {
  entries: UtilEntry[];
  properties: UtilsProperty[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UtilsClient({
  entries,
  properties,
  canCreate,
  canEdit,
  canDelete,
}: UtilsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  // ── Local filter state — verbatim isolated from global PeriodBar ──────────
  const currentYear = new Date().getFullYear();
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterYear,  setFilterYear]  = useState<number>(currentYear);
  const [filterProp,  setFilterProp]  = useState<string>('all');
  const [activeTab,   setActiveTab]   = useState<UtilTab>('rent');

  // ── Modal state ───────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]   = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<UtilFormValues>>();
  const [isSaving, setIsSaving]     = useState(false);

  // ── Property lookup ───────────────────────────────────────────────────────
  const propMap = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p])),
    [properties],
  );

  // ── Tab-filtered entries (sorted newest due date first) ───────────────────
  const tabItems = useMemo(() => {
    let items = entries.filter((u) => u.type === activeTab);
    if (filterProp !== 'all') items = items.filter((u) => u.pid === filterProp);
    if (filterMonth !== 'all') {
      items = items.filter((u) => {
        if (!u.dueDate) return false;
        const d = new Date(u.dueDate);
        return (d.getMonth() + 1) === +filterMonth && d.getFullYear() === filterYear;
      });
    }
    return [...items].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [entries, activeTab, filterProp, filterMonth, filterYear]);

  // ── KPI derivations — always from all entries (tab-agnostic) ─────────────
  // Verbatim from rndUtils(): allFiltered = filtered by month/property only, not tab
  const allFiltered = useMemo(() => {
    let items = [...entries];
    if (filterProp !== 'all') items = items.filter((u) => u.pid === filterProp);
    if (filterMonth !== 'all') {
      items = items.filter((u) => {
        if (!u.dueDate) return false;
        const d = new Date(u.dueDate);
        return (d.getMonth() + 1) === +filterMonth && d.getFullYear() === filterYear;
      });
    }
    return items;
  }, [entries, filterProp, filterMonth, filterYear]);

  const rentPending   = allFiltered.filter((u) => u.type === 'rent'        && u.status === 'pending').reduce((s, u) => s + u.amount, 0);
  const elecPending   = allFiltered.filter((u) => u.type === 'electricity' && u.status === 'pending').reduce((s, u) => s + u.amount, 0);
  const customPending = allFiltered.filter((u) => u.type === 'custom'      && u.status === 'pending').reduce((s, u) => s + u.amount, 0);
  const totalPending  = rentPending + elecPending + customPending;
  const totalAll      = allFiltered.reduce((s, u) => s + u.amount, 0);
  const paidAll       = allFiltered.filter((u) => u.status === 'paid').reduce((s, u) => s + u.amount, 0);
  const paidPct       = totalAll > 0 ? Math.round((paidAll / totalAll) * 100) : 0;

  // ── Year options (current year ±5) ────────────────────────────────────────
  const yearOpts = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  // ── Add / edit handlers ───────────────────────────────────────────────────
  function handleAdd() {
    setEditId(null);
    setEditValues({ type: activeTab });
    setModalOpen(true);
  }

  function handleEdit(u: UtilEntry) {
    setEditId(u.id);
    setEditValues({
      type:     u.type,
      pid:      u.pid,
      cn:       u.cn,
      label:    u.label,
      amount:   String(u.amount),
      dueDate:  u.dueDate,
      paidDate: u.paidDate,
      status:   u.status,
      tds:      u.tds,
      gst:      u.gst,
      notes:    u.notes,
    });
    setModalOpen(true);
  }

  async function handleSave(payload: UtilFormValues, id: string | null) {
    setIsSaving(true);
    try {
      const res = await fetch(
        id ? `/api/utils/${id}` : '/api/utils',
        {
          method:  id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Failed to save entry', 'er');
        return;
      }
      const typeLabel = payload.type === 'custom' ? payload.label : TAB_LABEL[payload.type];
      toast(`✓ ${typeLabel} entry saved`, 'ok');
      setModalOpen(false);
      startTransition(() => router.refresh());
    } catch {
      toast('Network error — please try again', 'er');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(u: UtilEntry) {
    if (!window.confirm('Delete this entry?')) return;
    try {
      const res = await fetch(`/api/utils/${u.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Failed to delete', 'er');
        return;
      }
      toast('Entry deleted', 'ok');
      startTransition(() => router.refresh());
    } catch {
      toast('Network error', 'er');
    }
  }

  async function handleToggleStatus(u: UtilEntry) {
    const newStatus = u.status === 'paid' ? 'pending' : 'paid';
    const paidDate  = newStatus === 'paid' ? new Date().toISOString().split('T')[0] : '';
    try {
      const res = await fetch(`/api/utils/${u.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, paidDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Failed to update status', 'er');
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      toast('Network error', 'er');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-hdr" style={{ marginBottom: '14px' }}>
        <div className="stl" style={{ marginBottom: 0 }}>
          <div className="d" />Rent &amp; Utilities Tracker
        </div>
        {canCreate && (
          <button className="btn btn-or btn-sm" onClick={handleAdd}>+ Add Entry</button>
        )}
      </div>

      {/* ── 4 KPI cards ──────────────────────────────────────────────────── */}
      <div className="rg4" style={{ marginBottom: '14px' }}>
        {/* Rent Pending */}
        <div className="cc" style={{ padding: '14px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--rd)', marginBottom: '4px' }}>Rent Pending</div>
          <div style={{ fontSize: '16px', fontWeight: 800, wordBreak: 'break-word' }}>{fIN(rentPending)}</div>
        </div>
        {/* Electricity Pending */}
        <div className="cc" style={{ padding: '14px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--go)', marginBottom: '4px' }}>Electricity Pending</div>
          <div style={{ fontSize: '16px', fontWeight: 800, wordBreak: 'break-word' }}>{fIN(elecPending)}</div>
        </div>
        {/* Paid % with progress bar */}
        <div className="cc" style={{ padding: '14px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gr)', marginBottom: '4px' }}>Paid {paidPct}%</div>
          <div style={{ fontSize: '16px', fontWeight: 800, wordBreak: 'break-word' }}>{fIN(paidAll)} of {fIN(totalAll)}</div>
          <div style={{ background: 'var(--s2)', borderRadius: '6px', height: '6px', marginTop: '6px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${paidPct}%`, background: 'var(--gr)', borderRadius: '6px' }} />
          </div>
        </div>
        {/* Total Bills Pending — NEW (Bug 18) */}
        <div className="cc" style={{ padding: '14px', border: '1.5px solid var(--bdr)' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--bl)', marginBottom: '4px' }}>Total Bills Pending</div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--bl)', wordBreak: 'break-word' }}>{fIN(totalPending)}</div>
          <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '4px' }}>
            Rent + Electricity{customPending > 0 ? ' + Custom' : ''}
          </div>
        </div>
      </div>

      {/* ── Local filter row — isolated from global PeriodBar ────────────── */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: 'var(--t2)', fontWeight: 600 }}>Filter:</span>
        <select className="fsel" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
          {MS_OPTS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>
        <select className="fsel" value={filterYear} onChange={(e) => setFilterYear(+e.target.value)}>
          {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="fsel" value={filterProp} onChange={(e) => setFilterProp(e.target.value)}>
          <option value="all">All Properties</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* ── Tabs: Rent | Electricity | Custom ────────────────────────────── */}
      <div className="tabs" style={{ marginBottom: '14px' }}>
        {(['rent', 'electricity', 'custom'] as UtilTab[]).map((tab) => (
          <div
            key={tab}
            className={`tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABEL[tab]}
          </div>
        ))}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="tw">
        {tabItems.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t3)' }}>
            No {TAB_LABEL[activeTab]} entries yet. Click + Add Entry.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  {/* Extra column: CN# for electricity, Label for custom */}
                  {activeTab === 'electricity' && <th>CN #</th>}
                  {activeTab === 'custom'      && <th>Label</th>}
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Paid</th>
                  <th>Status</th>
                  <th>Notes</th>
                  {(canEdit || canDelete) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {tabItems.map((u) => {
                  const prop   = propMap[u.pid];
                  const isPaid = u.status === 'paid';
                  const flags  = [u.tds && 'TDS', u.gst && 'GST'].filter(Boolean).join(' ');

                  return (
                    <tr key={u.id}>
                      <td>{prop?.name ?? '?'}</td>
                      {activeTab === 'electricity' && <td style={{ fontSize: '11px' }}>{u.cn || '—'}</td>}
                      {activeTab === 'custom'      && <td>{u.label || '—'}</td>}
                      <td style={{ fontWeight: 700 }}>
                        {fIN(u.amount)}
                        {flags && (
                          <span style={{ fontSize: '9px', color: 'var(--or)', marginLeft: '4px' }}>{flags}</span>
                        )}
                      </td>
                      <td>{u.dueDate}</td>
                      <td>{u.paidDate || '—'}</td>
                      <td>
                        <span className={`pill ${isPaid ? 'g' : 'r'}`}>
                          {isPaid ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--t3)' }}>{u.notes || ''}</td>
                      {(canEdit || canDelete) && (
                        <td style={{ display: 'flex', gap: '3px' }}>
                          {/* Toggle status — verbatim toggleUtilStatus() */}
                          <button
                            className="btn btn-g btn-sm"
                            title={isPaid ? 'Undo' : 'Mark Paid'}
                            onClick={() => handleToggleStatus(u)}
                          >
                            {isPaid ? '↩' : '✓'}
                          </button>
                          {canEdit && (
                            <button className="btn btn-g btn-sm" title="Edit" onClick={() => handleEdit(u)}>✏️</button>
                          )}
                          {canDelete && (
                            <button className="btn btn-rd btn-sm" title="Delete" onClick={() => handleDelete(u)}>🗑</button>
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

      {/* ── Add/Edit modal ─────────────────────────────────────────────────── */}
      <UtilModal
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