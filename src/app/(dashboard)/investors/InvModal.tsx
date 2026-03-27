'use client';
// src/app/(dashboard)/investors/InvModal.tsx
//
// Add/Edit Investor modal. Pixel-matches the HTML invModal exactly.
// Fields: Name, Contact/Email, Capital Invested, Equity %, Linked Property
//
// Schema note: DB Investor has a single property_id FK.
// The HTML stored pids[] (many properties per investor).
// v1: single-select — the selected property becomes property_id.
// Multi-property linking is a v2 schema change.

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import styles from '@/components/ui/ui.module.css';
import type { SerializableProperty } from '../properties/page';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvestorFormValues {
  name: string;
  contact: string;
  capital: string;
  equity: string;
  propertyId: string;
}

export interface InvestorSavePayload {
  name: string;
  contact: string;
  capital: number;
  sharePct: number;
  propertyId: string;
}

interface InvModalProps {
  isOpen: boolean;
  onClose: () => void;
  editId: string | null;
  initialValues?: Partial<InvestorFormValues>;
  properties: SerializableProperty[];
  onSave: (payload: InvestorSavePayload, editId: string | null) => Promise<void>;
  isSaving: boolean;
}

// ---------------------------------------------------------------------------
// Blank default
// ---------------------------------------------------------------------------

const BLANK: InvestorFormValues = {
  name: '', contact: '', capital: '', equity: '', propertyId: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvModal({
  isOpen,
  onClose,
  editId,
  initialValues,
  properties,
  onSave,
  isSaving,
}: InvModalProps) {
  const [form, setForm] = useState<InvestorFormValues>(BLANK);

  useEffect(() => {
    if (isOpen) setForm(initialValues ? { ...BLANK, ...initialValues } : BLANK);
  }, [isOpen, initialValues]);

  function set(field: keyof InvestorFormValues, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) return;
    await onSave(
      {
        name:       form.name.trim(),
        contact:    form.contact.trim(),
        capital:    parseFloat(form.capital) || 0,
        sharePct:   parseFloat(form.equity)  || 0,
        propertyId: form.propertyId,
      },
      editId,
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editId ? 'Edit Investor' : 'Add Investor'}
      subtitle="Create or update investor profile"
      size="wide"
    >
      {/* Name + Contact row */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>Investor Name *</label>
          <input
            className={styles.fi}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Rajesh Sharma"
          />
        </div>
        <div className={styles.fl}>
          <label>Contact / Email</label>
          <input
            className={styles.fi}
            value={form.contact}
            onChange={(e) => set('contact', e.target.value)}
            placeholder="phone or email"
          />
        </div>
      </div>

      {/* Capital + Equity row */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>Capital Invested (₹)</label>
          <input
            className={styles.fi}
            type="number"
            value={form.capital}
            onChange={(e) => set('capital', e.target.value)}
            placeholder="5000000"
          />
        </div>
        <div className={styles.fl}>
          <label>Equity %</label>
          <input
            className={styles.fi}
            type="number"
            value={form.equity}
            onChange={(e) => set('equity', e.target.value)}
            placeholder="40"
            min={0}
            max={100}
          />
        </div>
      </div>

      {/* Linked Property — visual matches popInvModal() exactly.
          Schema v1: single property_id. Checkbox-style list but radio
          behaviour (select one). Multi-property = v2 schema change. */}
      <div className={styles.fl}>
        <label>Linked Property</label>
        {properties.length === 0 ? (
          <div style={{ fontSize: '11.5px', color: 'var(--t3)' }}>
            Add properties first.
          </div>
        ) : (
          <div
            style={{
              display: 'flex', flexDirection: 'column', gap: '5px',
              maxHeight: '150px', overflowY: 'auto',
              border: '1.5px solid var(--bdr)', borderRadius: '8px',
              padding: '9px', background: 'var(--bg)',
            }}
          >
            {properties.map((p) => {
              const selected = form.propertyId === p.id;
              return (
                <label
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 10px',
                    border: `1.5px solid ${selected ? 'var(--or)' : 'var(--bdr)'}`,
                    borderRadius: '7px', cursor: 'pointer', fontSize: '12.5px',
                    background: selected ? 'var(--orp)' : '#fff',
                    transition: 'all .13s',
                  }}
                  onClick={() => set('propertyId', selected ? '' : p.id)}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {}}
                    value={p.id}
                    style={{ accentColor: 'var(--or)' }}
                  />
                  {p.name}
                  {p.city && (
                    <span style={{ fontSize: '10.5px', color: 'var(--t3)', marginLeft: 'auto' }}>
                      {p.city}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={styles.mf}>
        <button
          type="button"
          className={`${styles.mb} ${styles.can}`}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.mb} ${styles.sub}`}
          onClick={handleSubmit}
          disabled={isSaving || !form.name.trim()}
        >
          {isSaving ? 'Saving…' : editId ? 'Update Investor' : 'Save Investor'}
        </button>
      </div>
    </Modal>
  );
}