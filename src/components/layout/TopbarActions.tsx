'use client';
// src/components/layout/TopbarActions.tsx
//
// Client Component that wires all interactive Topbar buttons.
// Topbar.tsx is a Server Component and cannot hold onClick state directly —
// this file is the thin client wrapper for everything that requires interaction.
//
// Buttons:
//   + Property   → opens PropModal (add mode)
//   + Investor   → opens InvModal (add mode)
//   💾 Backup    → GET /api/exports?model=all → download JSON
//   📂 Restore   → file input onChange → POST /api/exports/restore
//   ↓ Export CSV → GET /api/exports?model={currentModel} → download CSV
//
// Modal state: local useState (not URL params, not Zustand).
// The modals already exist as standalone components in their page directories
// and accept isOpen + onClose + onSave props. Since TopbarActions renders
// globally (in the dashboard layout), it fetches the property list from
// /api/properties so it can pass it to InvModal.
//
// After a successful modal save the page is revalidated via router.refresh().

import { useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { PropModal } from '@/app/(dashboard)/properties/PropModal';
import { InvModal } from '@/app/(dashboard)/investors/InvModal';
import type { PropertySavePayload } from '@/app/(dashboard)/properties/PropModal';
import type { InvestorSavePayload } from '@/app/(dashboard)/investors/InvModal';
import type { SerializableProperty } from '@/app/(dashboard)/properties/page';
import styles from './Topbar.module.css';

// ---------------------------------------------------------------------------
// Route segment → export model map (for "Export CSV" button)
// ---------------------------------------------------------------------------

const PATH_TO_MODEL: Record<string, string> = {
  '/bookings':   'bookings',
  '/dailyexp':   'daily-expenses',
  '/expenses':   'expenses',
  '/payouts':    'payouts',
  '/crm':        'guests',
  '/investors':  'payouts',  // investors page → export payouts for context
  '/properties': 'bookings', // properties page → export bookings
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TopbarActionsProps {
  role: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopbarActions({ role }: TopbarActionsProps) {
  const isSuperAdmin = role === 'SuperAdmin';
  const router   = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  // ── Modal state ───────────────────────────────────────────────────────────
  const [propModalOpen, setPropModalOpen]     = useState(false);
  const [invModalOpen,  setInvModalOpen]      = useState(false);
  const [isSavingProp,  setIsSavingProp]      = useState(false);
  const [isSavingInv,   setIsSavingInv]       = useState(false);
  const [properties,    setProperties]        = useState<SerializableProperty[]>([]);
  const [propsLoaded,   setPropsLoaded]       = useState(false);

  // ── Load properties (lazy — only when + Investor is clicked) ─────────────
  const loadProperties = useCallback(async () => {
    if (propsLoaded) return;
    try {
      const res  = await fetch('/api/properties');
      if (!res.ok) return;
      const json = await res.json() as { data: SerializableProperty[] };
      setProperties(json.data ?? []);
      setPropsLoaded(true);
    } catch {
      // Non-fatal — InvModal will show an empty property list
    }
  }, [propsLoaded]);

  // ── + Property ────────────────────────────────────────────────────────────
  function handleOpenPropModal() {
    setPropModalOpen(true);
  }

  async function handleSaveProperty(
    payload: PropertySavePayload,
    _editId: string | null
  ) {
    setIsSavingProp(true);
    try {
      const res = await fetch('/api/properties', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast(err.error ?? 'Failed to save property', 'er');
        return;
      }
      toast(`✓ "${payload.name}" added`, 'ok');
      setPropModalOpen(false);
      setPropsLoaded(false); // invalidate cache so InvModal sees the new property
      router.refresh();
    } catch {
      toast('Network error — please try again', 'er');
    } finally {
      setIsSavingProp(false);
    }
  }

  // ── + Investor ────────────────────────────────────────────────────────────
  async function handleOpenInvModal() {
    await loadProperties();
    setInvModalOpen(true);
  }

  async function handleSaveInvestor(
    payload: InvestorSavePayload,
    _editId: string | null
  ) {
    setIsSavingInv(true);
    try {
      const res = await fetch('/api/investors', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:        payload.name,
          contact:     payload.contact,
          capital:     payload.capital,
          share_pct:   payload.sharePct,
          property_id: payload.propertyId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast(err.error ?? 'Failed to save investor', 'er');
        return;
      }
      toast(`✓ "${payload.name}" added`, 'ok');
      setInvModalOpen(false);
      router.refresh();
    } catch {
      toast('Network error — please try again', 'er');
    } finally {
      setIsSavingInv(false);
    }
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  async function handleExportCsv() {
    // Resolve the export model from the current route segment
    const segment = '/' + (pathname.split('/')[1] ?? '');
    const model   = PATH_TO_MODEL[segment];

    if (!model) {
      toast('CSV export is not available for this page.', 'in');
      return;
    }

    try {
      const res = await fetch(`/api/exports?model=${model}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast(err.error ?? 'Export failed', 'er');
        return;
      }
      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = `mg-${model}-export.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('Export failed — please try again', 'er');
    }
  }

  // ── Backup ────────────────────────────────────────────────────────────────
  async function handleBackup() {
    try {
      const res = await fetch('/api/exports?model=all');
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast(err.error ?? 'Backup failed', 'er');
        return;
      }
      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      const ts       = new Date().toISOString().slice(0, 10);
      a.download     = `mg-finance-backup-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('✓ Backup downloaded', 'ok');
    } catch {
      toast('Backup failed — please try again', 'er');
    }
  }

  // ── Restore ───────────────────────────────────────────────────────────────
  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the input so the same file can be re-selected if needed
    e.target.value = '';

    if (!window.confirm(
      `Restore from "${file.name}"?\n\nThis will upsert all records from the backup into the current database. Existing records will be updated, no records will be deleted.`
    )) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;

      const res = await fetch('/api/exports/restore', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast(err.error ?? 'Restore failed', 'er');
        return;
      }

      const result = await res.json() as {
        total_processed: number;
        results: Array<{ table: string; processed: number; error?: string }>;
      };

      const errors = result.results.filter((r) => r.error);
      if (errors.length > 0) {
        toast(
          `Restore completed with errors. ${result.total_processed} records restored. ${errors.length} table(s) had errors.`,
          'er'
        );
      } else {
        toast(`✓ Restore complete — ${result.total_processed} records restored`, 'ok');
      }

      router.refresh();
    } catch {
      toast('Restore failed — invalid backup file', 'er');
    }
  }

  // ── Button class helper ───────────────────────────────────────────────────
  function btnClass(...variants: string[]): string {
    return [styles.btn, ...variants.map((v) => styles[v])].join(' ');
  }

  // ── Mobile overflow menu ──────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Render ────────────────────────────────────────────────────────────────
  // All topbar action buttons (+ Property, + Investor, Backup, Restore,
  // Export CSV) are SuperAdmin-only. Non-SuperAdmin users see only their
  // username in the topbar.
  if (!isSuperAdmin) return null;

  return (
    <>
      {/* ── Desktop: full buttons (hidden on mobile via CSS) ──────────── */}
      <div className={styles['tb-actions-desktop']}>
        <button type="button" className={btnClass('btn-g', 'btn-sm')} onClick={handleOpenPropModal}>
          + Property
        </button>
        <button type="button" className={btnClass('btn-g', 'btn-sm')} onClick={handleOpenInvModal}>
          + Investor
        </button>
        <button type="button" className={btnClass('btn-g', 'btn-sm')} title="Download full backup as JSON" onClick={handleBackup}>
          💾 Backup
        </button>
        <label className={btnClass('btn-g', 'btn-sm')} style={{ cursor: 'pointer' }} title="Restore from JSON backup">
          📂 Restore
          <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleRestore} />
        </label>
        <button type="button" className={btnClass('btn-or', 'btn-sm')} onClick={handleExportCsv}>
          ↓ Export CSV
        </button>
      </div>

      {/* ── Mobile: overflow dropdown (hidden on desktop via CSS) ──────── */}
      <div className={styles['tb-actions-mobile']}>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={btnClass('btn-g', 'btn-sm')}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
          >
            ⋮
          </button>
          {menuOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 59 }}
                onClick={() => setMenuOpen(false)}
              />
              <div className={styles['tb-dropdown']}>
                <button type="button" onClick={() => { handleOpenPropModal(); setMenuOpen(false); }}>
                  🏠 Property
                </button>
                <button type="button" onClick={() => { handleOpenInvModal(); setMenuOpen(false); }}>
                  👤 Investor
                </button>
                <button type="button" onClick={() => { handleExportCsv(); setMenuOpen(false); }}>
                  ↓ Export CSV
                </button>
                <button type="button" onClick={() => { handleBackup(); setMenuOpen(false); }}>
                  💾 Backup
                </button>
                <label style={{ cursor: 'pointer' }}>
                  📂 Restore
                  <input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => { handleRestore(e); setMenuOpen(false); }} />
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      {/* PropModal — add mode only from Topbar */}
      <PropModal
        isOpen={propModalOpen}
        onClose={() => setPropModalOpen(false)}
        editId={null}
        initialValues={undefined}
        knownCities={[]}
        onSave={handleSaveProperty}
        isSaving={isSavingProp}
      />

      {/* InvModal — add mode only from Topbar */}
      <InvModal
        isOpen={invModalOpen}
        onClose={() => setInvModalOpen(false)}
        editId={null}
        initialValues={undefined}
        properties={properties}
        onSave={handleSaveInvestor}
        isSaving={isSavingInv}
      />
    </>
  );
}