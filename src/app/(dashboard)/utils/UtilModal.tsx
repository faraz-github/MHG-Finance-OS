'use client';
// src/app/(dashboard)/utils/UtilModal.tsx
//
// Add/Edit Utility Entry modal. Pixel-matches the HTML utilModal exactly.
// Fields: Type (rent|electricity|custom), Property, CN Number (electricity),
//         Custom Label (custom), Amount, Due Date, Paid Date, Status,
//         TDS checkbox, GST checkbox, Notes.

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import styles from '@/components/ui/ui.module.css';
import type { SerializableProperty } from '../properties/page';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UtilType = 'rent' | 'electricity' | 'custom';

export interface UtilFormValues {
  type: UtilType;
  pid: string;
  cn: string;
  label: string;
  amount: string;
  dueDate: string;
  paidDate: string;
  status: 'pending' | 'paid';
  tds: boolean;
  gst: boolean;
  notes: string;
}

export interface UtilSavePayload extends UtilFormValues {
  amount: string; // kept as string, API parses to number
}

interface UtilModalProps {
  isOpen: boolean;
  onClose: () => void;
  editId: string | null;
  initialValues?: Partial<UtilFormValues>;
  properties: SerializableProperty[];
  onSave: (payload: UtilFormValues, editId: string | null) => Promise<void>;
  isSaving: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const BLANK: UtilFormValues = {
  type: 'rent', pid: '', cn: '', label: '', amount: '',
  dueDate: new Date().toISOString().split('T')[0],
  paidDate: '', status: 'pending', tds: false, gst: false, notes: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UtilModal({
  isOpen, onClose, editId, initialValues, properties, onSave, isSaving,
}: UtilModalProps) {
  const [form, setForm] = useState<UtilFormValues>(BLANK);

  useEffect(() => {
    if (isOpen) {
      setForm({ ...BLANK, pid: properties[0]?.id ?? '', ...initialValues });
    }
  }, [isOpen, initialValues]); // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof UtilFormValues>(field: K, value: UtilFormValues[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.pid || !form.amount || !form.dueDate) return;
    if (form.type === 'custom' && !form.label.trim()) return;
    await onSave(form, editId);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editId ? 'Edit Entry' : 'Add Utility Entry'}
      subtitle="Track rent, electricity, or custom bills"
    >
      {/* Type + Property */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>Type *</label>
          <div className={styles.sw}>
            <select className={styles.fs} value={form.type} onChange={(e) => set('type', e.target.value as UtilType)}>
              <option value="rent">Rent</option>
              <option value="electricity">Electricity</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>
        <div className={styles.fl}>
          <label>Property *</label>
          <div className={styles.sw}>
            <select className={styles.fs} value={form.pid} onChange={(e) => set('pid', e.target.value)}>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* CN Number (electricity only) */}
      {form.type === 'electricity' && (
        <div className={styles.fg}>
          <div className={styles.fl}>
            <label>CN Number</label>
            <input className={styles.fi} value={form.cn} onChange={(e) => set('cn', e.target.value)} placeholder="Consumer number" />
          </div>
          <div className={styles.fl} />
        </div>
      )}

      {/* Custom Label (custom only) */}
      {form.type === 'custom' && (
        <div className={styles.fg}>
          <div className={styles.fl}>
            <label>Custom Label *</label>
            <input className={styles.fi} value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Water, Gas, Internet" />
          </div>
          <div className={styles.fl} />
        </div>
      )}

      {/* Amount + Due Date */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>Amount (₹) *</label>
          <input className={styles.fi} type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" />
        </div>
        <div className={styles.fl}>
          <label>Due Date *</label>
          <input className={styles.fi} type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </div>
      </div>

      {/* Paid Date + Status */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>Paid Date</label>
          <input className={styles.fi} type="date" value={form.paidDate} onChange={(e) => set('paidDate', e.target.value)} />
        </div>
        <div className={styles.fl}>
          <label>Status</label>
          <div className={styles.sw}>
            <select className={styles.fs} value={form.status} onChange={(e) => set('status', e.target.value as 'pending' | 'paid')}>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
      </div>

      {/* TDS + GST checkboxes */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            TDS <input type="checkbox" checked={form.tds} onChange={(e) => set('tds', e.target.checked)} style={{ accentColor: 'var(--or)' }} />
          </label>
        </div>
        <div className={styles.fl}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            GST <input type="checkbox" checked={form.gst} onChange={(e) => set('gst', e.target.checked)} style={{ accentColor: 'var(--or)' }} />
          </label>
        </div>
      </div>

      {/* Notes */}
      <div className={styles.fl}>
        <label>Notes</label>
        <input className={styles.fi} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional" />
      </div>

      <div className={styles.mf}>
        <button type="button" className={`${styles.mb} ${styles.can}`} onClick={onClose}>Cancel</button>
        <button type="button" className={`${styles.mb} ${styles.sub}`} onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save Entry'}
        </button>
      </div>
    </Modal>
  );
}