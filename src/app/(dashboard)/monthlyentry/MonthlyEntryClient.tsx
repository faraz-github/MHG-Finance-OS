'use client';
// src/app/(dashboard)/monthlyentry/MonthlyEntryClient.tsx
//
// Monthly Entry — full-page Client Component.
//
// Ported from src/app/(dashboard)/reports/MonthlyEntryModal.tsx.
// All logic is identical; the modal wrapper (Modal, isOpen, onClose) is
// replaced with the standard dashboard page structure used by every other
// page in the project.
//
// HTML source: <div class="ov" id="monthlyModal"> + saveMonthlyBulk()
//              + initMmModal() + addMmChannel() + updMmTotals()
//
// On save:
//   1. POST /api/monthly-entry (unchanged API route)
//   2. Sync period bar to saved month/year via usePeriod.setPeriod
//      (mirrors saveMonthlyBulk() setting cM=month; cY=year in the HTML)
//   3. Navigate to /reports via useRouter
//   4. Show success toast
//
// Absolute rules observed:
//   - No formula logic — calls POST /api/monthly-entry only
//   - No @supabase/supabase-js imports
//   - No localStorage for application data
//   - No `any` types
//   - No console.log

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { usePeriod } from '@/hooks/usePeriod';
import styles from '@/components/ui/ui.module.css';
import type { SerializableProperty } from '../properties/page';

// ---------------------------------------------------------------------------
// Constants — verbatim from the HTML source
// ---------------------------------------------------------------------------

// Verbatim channel options from addMmChannel() in the HTML
const CHANNEL_OPTS = [
  'Airbnb', 'Booking.com', 'MakeMyTrip', 'Direct',
  'Goibibo', 'OYO', 'Other',
];

// Default expense categories from initMmModal()
const DEFAULT_EXP_CATS = ['Rent', 'Electricity', 'Cleaning', 'Maintenance'];

const MS_OPTS = [
  { v: 1,  l: 'Jan' }, { v: 2,  l: 'Feb' }, { v: 3,  l: 'Mar' },
  { v: 4,  l: 'Apr' }, { v: 5,  l: 'May' }, { v: 6,  l: 'Jun' },
  { v: 7,  l: 'Jul' }, { v: 8,  l: 'Aug' }, { v: 9,  l: 'Sep' },
  { v: 10, l: 'Oct' }, { v: 11, l: 'Nov' }, { v: 12, l: 'Dec' },
];

const YEARS = (() => {
  const cy = new Date().getFullYear();
  return Array.from({ length: 11 }, (_, i) => cy - 5 + i);
})();

// Month name array for toast message — index matches month number (1-based)
const MN = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelRow {
  id: number;
  name: string;
  nights: string;
  revenue: string;
}

interface ExpCatRow {
  id: number;
  category: string;
  amount: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fIN(n: number) {
  return '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MonthlyEntryClientProps {
  properties: SerializableProperty[];
  canCreate: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonthlyEntryClient({
  properties,
  canCreate,
}: MonthlyEntryClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { cM, cY, setPeriod } = usePeriod();

  // ── Local state — mirrors initMmModal() ──────────────────────────────────
  const [pid, setPid]               = useState(properties[0]?.id ?? '');
  const [month, setMonth]           = useState(cM);
  const [year, setYear]             = useState(cY);
  const [channels, setChannels]     = useState<ChannelRow[]>([]);
  const [expCats, setExpCats]       = useState<ExpCatRow[]>([]);
  const [counter, setCounter]       = useState(0);
  const [isSaving, setIsSaving]     = useState(false);
  const [validation, setValidation] = useState<string[]>([]);

  // ── Init on mount — verbatim initMmModal() ────────────────────────────────
  // Uses an effect with an empty dep array (same as the modal's isOpen=true
  // effect) so the form initialises once when the page loads.
  useEffect(() => {
    let c = 0;
    setChannels([
      { id: ++c, name: 'Airbnb', nights: '', revenue: '' },
      { id: ++c, name: 'Direct', nights: '', revenue: '' },
    ]);
    setExpCats(
      DEFAULT_EXP_CATS.map((cat) => ({ id: ++c, category: cat, amount: '' })),
    );
    setCounter(c);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live totals ───────────────────────────────────────────────────────────
  const totRev    = channels.reduce((s, c) => s + (parseFloat(c.revenue) || 0), 0);
  const totNights = channels.reduce((s, c) => s + (parseInt(c.nights)   || 0), 0);
  const totExp    = expCats.reduce( (s, c) => s + (parseFloat(c.amount)  || 0), 0);

  // ── Validation — verbatim updMmTotals() warnings ─────────────────────────
  useEffect(() => {
    const warns: string[] = [];
    if (totRev > 0 && totNights <= 0)
      warns.push('Revenue entered but no nights — add nights per channel');
    setValidation(warns);
  }, [totRev, totNights]);

  // ── Channel helpers ───────────────────────────────────────────────────────
  function addChannel() {
    const id = counter + 1;
    setCounter(id);
    setChannels((prev) => [...prev, { id, name: 'Airbnb', nights: '', revenue: '' }]);
  }

  function updateChannel(id: number, field: keyof ChannelRow, value: string) {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  }

  function removeChannel(id: number) {
    setChannels((prev) => prev.filter((c) => c.id !== id));
  }

  // ── Expense category helpers ──────────────────────────────────────────────
  function addExpCat() {
    const id = counter + 1;
    setCounter(id);
    setExpCats((prev) => [...prev, { id, category: '', amount: '' }]);
  }

  function updateExpCat(id: number, field: keyof ExpCatRow, value: string) {
    setExpCats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  }

  function removeExpCat(id: number) {
    setExpCats((prev) => prev.filter((c) => c.id !== id));
  }

  // ── Save — verbatim saveMonthlyBulk() logic ───────────────────────────────
  async function handleSave() {
    if (!canCreate) {
      toast('You do not have permission to create monthly entries', 'er');
      return;
    }
    if (!pid) {
      toast('Select a property', 'er');
      return;
    }
    if (!totRev && !totExp) {
      toast('Enter revenue or expense data', 'er');
      return;
    }

    const validChannels = channels.filter((c) => (parseFloat(c.revenue) || 0) > 0);
    const validExpCats  = expCats.filter(
      (c) => c.category.trim() && (parseFloat(c.amount) || 0) > 0,
    );

    setIsSaving(true);
    try {
      const res = await fetch('/api/monthly-entry', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: pid,
          month,
          year,
          channels: validChannels.map((c) => ({
            name:    c.name,
            nights:  parseInt(c.nights)    || 0,
            revenue: parseFloat(c.revenue) || 0,
          })),
          expCats: validExpCats.map((c) => ({
            category: c.category.trim(),
            amount:   parseFloat(c.amount) || 0,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast(err.error ?? 'Failed to save monthly data', 'er');
        return;
      }

      // ── Post-save: sync period bar to saved month/year ─────────────────
      // Mirrors saveMonthlyBulk() in the HTML: cM = month; cY = year;
      // setPeriod updates the Zustand store which PeriodBar reads from.
      // cPType is set to 'monthly' so the bar switches to the matching view.
      setPeriod({ cM: month, cY: year, cPType: 'monthly' });

      toast(
        `✓ Monthly data saved for ${MN[month]} ${year} — ` +
        `${validChannels.length} channels, ${validExpCats.length} expense categories`,
        'ok',
      );

      // Navigate to Reports after save, same as other create-then-redirect pages
      router.push('/reports');
    } catch {
      toast('Network error — please try again', 'er');
    } finally {
      setIsSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '680px' }}>
      {/* ── Page header — same pattern as DailyExpClient, BookingsClient ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div className="stl" style={{ marginBottom: 0 }}>
          <div className="d" />Monthly Entry
        </div>
      </div>

      {/* ── Sub-title — mirrors modal subtitle ───────────────────────────── */}
      <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '18px' }}>
        Add full month data — revenue channels + expense categories
      </div>

      {/* ── Property + Month selectors ────────────────────────────────────── */}
      <div className="cc" style={{ marginBottom: '14px', padding: '16px' }}>
        <div className="rg2" style={{ marginBottom: '10px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--t2)', marginBottom: '5px' }}>
              Property *
            </label>
            <div className={styles.sw}>
              <select
                className={styles.fs}
                value={pid}
                onChange={(e) => setPid(e.target.value)}
              >
                {properties.length === 0
                  ? <option value="">No properties — add one first</option>
                  : properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--t2)', marginBottom: '5px' }}>
              Month *
            </label>
            <div className={styles.sw}>
              <select
                className={styles.fs}
                value={month}
                onChange={(e) => setMonth(+e.target.value)}
              >
                {MS_OPTS.map((m) => (
                  <option key={m.v} value={m.v}>{m.l}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="rg2">
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--t2)', marginBottom: '5px' }}>
              Year *
            </label>
            <div className={styles.sw}>
              <select
                className={styles.fs}
                value={year}
                onChange={(e) => setYear(+e.target.value)}
              >
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--t3)', marginBottom: '5px' }}>
              Booking Period
            </label>
            <div style={{ fontSize: '12px', color: 'var(--t3)', padding: '9px 0' }}>
              Auto-set to {String(month).padStart(2, '0')}/{year}
            </div>
          </div>
        </div>
      </div>

      {/* ── Revenue — Channel Breakdown ──────────────────────────────────── */}
      <div style={{ background: 'var(--grp)', borderRadius: '9px', padding: '12px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gr)' }}>
            REVENUE — CHANNEL BREAKDOWN
          </div>
          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={addChannel}
            style={{ fontSize: '10px', padding: '3px 8px' }}
          >
            + Channel
          </button>
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr .8fr 1fr auto', gap: '4px', fontSize: '10px', fontWeight: 600, color: 'var(--t3)', paddingBottom: '4px' }}>
          <span>Channel</span><span>Nights</span><span>Revenue ₹</span><span />
        </div>

        {channels.map((ch) => (
          <div key={ch.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr .8fr 1fr auto', gap: '4px', marginBottom: '4px', alignItems: 'center' }}>
            <div className={styles.sw} style={{ fontSize: '11px' }}>
              <select
                className={styles.fs}
                style={{ fontSize: '11px', padding: '5px 24px 5px 7px' }}
                value={ch.name}
                onChange={(e) => updateChannel(ch.id, 'name', e.target.value)}
              >
                {CHANNEL_OPTS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <input
              className={styles.fi}
              type="number"
              placeholder="0"
              value={ch.nights}
              onChange={(e) => updateChannel(ch.id, 'nights', e.target.value)}
              style={{ fontSize: '11px', padding: '5px 7px' }}
            />
            <input
              className={styles.fi}
              type="number"
              placeholder="0"
              value={ch.revenue}
              onChange={(e) => updateChannel(ch.id, 'revenue', e.target.value)}
              style={{ fontSize: '11px', padding: '5px 7px' }}
            />
            <button
              type="button"
              className="btn btn-rd btn-sm"
              onClick={() => removeChannel(ch.id)}
              style={{ padding: '3px 6px', fontSize: '10px' }}
            >
              ✕
            </button>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', fontWeight: 700, paddingTop: '6px', borderTop: '1px solid rgba(22,163,74,.15)' }}>
          <span>Total:</span>
          <span style={{ color: 'var(--t2)' }}>{totNights} nights</span>
          <span style={{ color: 'var(--gr)' }}>{fIN(totRev)}</span>
          <span />
        </div>
      </div>

      {/* ── Expenses — Category Breakdown ────────────────────────────────── */}
      <div style={{ background: 'var(--rdp)', borderRadius: '9px', padding: '12px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--rd)' }}>
            EXPENSES — CATEGORY BREAKDOWN
          </div>
          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={addExpCat}
            style={{ fontSize: '10px', padding: '3px 8px' }}
          >
            + Category
          </button>
        </div>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: '4px', fontSize: '10px', fontWeight: 600, color: 'var(--t3)', paddingBottom: '4px' }}>
          <span>Category</span><span>Amount ₹</span><span />
        </div>

        {expCats.map((ec) => (
          <div key={ec.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: '4px', marginBottom: '4px', alignItems: 'center' }}>
            <input
              className={styles.fi}
              placeholder="e.g. Rent, Cleaning"
              value={ec.category}
              onChange={(e) => updateExpCat(ec.id, 'category', e.target.value)}
              style={{ fontSize: '11px', padding: '5px 7px' }}
            />
            <input
              className={styles.fi}
              type="number"
              placeholder="0"
              value={ec.amount}
              onChange={(e) => updateExpCat(ec.id, 'amount', e.target.value)}
              style={{ fontSize: '11px', padding: '5px 7px' }}
            />
            <button
              type="button"
              className="btn btn-rd btn-sm"
              onClick={() => removeExpCat(ec.id)}
              style={{ padding: '3px 6px', fontSize: '10px' }}
            >
              ✕
            </button>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', fontWeight: 700, paddingTop: '6px', borderTop: '1px solid rgba(220,38,38,.15)' }}>
          <span>Total Expenses:</span>
          <span style={{ color: 'var(--rd)' }}>{fIN(totExp)}</span>
          <span />
        </div>
      </div>

      {/* ── Validation warnings — verbatim updMmTotals() ─────────────────── */}
      {validation.length > 0 && (
        <div style={{ background: 'var(--gop)', border: '1px solid var(--go)', borderRadius: '8px', padding: '8px 12px', marginBottom: '14px', fontSize: '11px', color: 'var(--go)' }}>
          {validation.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {/* ── Action row ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          type="button"
          className="btn btn-g"
          style={{ flex: 1 }}
          onClick={() => router.back()}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-or"
          style={{ flex: 2 }}
          onClick={handleSave}
          disabled={isSaving || !canCreate}
        >
          {isSaving ? 'Saving…' : 'Save Monthly Data'}
        </button>
      </div>

      {/* Read-only notice when canCreate is false */}
      {!canCreate && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--t3)', textAlign: 'center' }}>
          Your role does not have permission to create monthly entries.
        </div>
      )}
    </div>
  );
}