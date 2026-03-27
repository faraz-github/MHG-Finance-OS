'use client';
// src/app/(dashboard)/dailyexp/DailyExpModal.tsx
//
// Add/Edit Daily Expense modal. Pixel-matches the HTML dexpModal exactly.
// Fields: Property, Date, Category (10 options), Amount, Notes, Invoice (file).
//
// Invoice upload (Bug 16 fix):
//   - File input accepts image/* and PDF, max 5 MB
//   - On submit, file is uploaded to /api/files/upload → returns { path }
//   - The path is passed as invoicePath in DailyExpSavePayload
//   - Existing invoice_path shown when editing (with remove option)
//
// Source: <div class="ov" id="dexpModal"> + saveDailyExp() + editDailyExp()

import { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import styles from '@/components/ui/ui.module.css';
import type { SerializableProperty } from '../properties/page';

// ---------------------------------------------------------------------------
// Constants — verbatim from the HTML dexpModal select options
// ---------------------------------------------------------------------------

export const DAILY_EXP_CATS: Array<{ value: string; label: string }> = [
  { value: 'cleaning',     label: 'Cleaning'      },
  { value: 'electricity',  label: 'Electricity'   },
  { value: 'water',        label: 'Water'         },
  { value: 'internet',     label: 'Internet/WiFi' },
  { value: 'rent',         label: 'Rent'          },
  { value: 'maintenance',  label: 'Maintenance'   },
  { value: 'supplies',     label: 'Supplies'      },
  { value: 'staff',        label: 'Staff Salary'  },
  { value: 'laundry',      label: 'Laundry'       },
  { value: 'other',        label: 'Other'         },
];

const BUCKET = 'mg-finance-os';
const MAX_MB  = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyExpFormValues {
  pid: string;
  date: string;
  category: string;
  amount: string;
  note: string;
  existingInvoicePath: string | null;  // populated when editing a record that has an invoice
}

export interface DailyExpSavePayload {
  propertyId: string;
  expenseDate: string;  // YYYY-MM-DD
  category: string;
  amount: number;
  description: string;
  invoicePath: string | null;  // storage path or null
}

interface DailyExpModalProps {
  isOpen: boolean;
  onClose: () => void;
  editId: string | null;
  initialValues?: Partial<DailyExpFormValues>;
  properties: SerializableProperty[];
  onSave: (payload: DailyExpSavePayload, editId: string | null) => Promise<void>;
  isSaving: boolean;
}

// ---------------------------------------------------------------------------
// Blank default
// ---------------------------------------------------------------------------

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

const BLANK: DailyExpFormValues = {
  pid: '', date: todayStr(), category: 'cleaning', amount: '', note: '',
  existingInvoicePath: null,
};

// ---------------------------------------------------------------------------
// File extension helper
// ---------------------------------------------------------------------------

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/png')  return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'application/pdf') return 'pdf';
  return 'bin';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DailyExpModal({
  isOpen,
  onClose,
  editId,
  initialValues,
  properties,
  onSave,
  isSaving,
}: DailyExpModalProps) {
  const [form, setForm]           = useState<DailyExpFormValues>(BLANK);
  const [monthBadge, setMonthBadge] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MN = ['','January','February','March','April','May','June',
               'July','August','September','October','November','December'];

  useEffect(() => {
    if (isOpen) {
      const init: DailyExpFormValues = {
        ...BLANK,
        date: todayStr(),
        pid:  properties[0]?.id ?? '',
        ...initialValues,
      };
      setForm(init);
      updateMonthBadge(init.date);
      // Reset file state on modal open
      setInvoiceFile(null);
      setInvoicePreview(null);
      setFileError('');
    }
  }, [isOpen, initialValues]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(field: keyof DailyExpFormValues, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (field === 'date') updateMonthBadge(value);
  }

  function updateMonthBadge(dateStr: string) {
    if (!dateStr) { setMonthBadge(''); return; }
    const d = new Date(dateStr);
    setMonthBadge('→ ' + MN[d.getMonth() + 1] + ' ' + d.getFullYear());
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError('');
    const file = e.target.files?.[0] ?? null;
    if (!file) { setInvoiceFile(null); setInvoicePreview(null); return; }

    if (file.size > MAX_MB * 1024 * 1024) {
      setFileError(`File too large — max ${MAX_MB} MB`);
      setInvoiceFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      setFileError('Only JPEG, PNG, WebP, or PDF files allowed');
      setInvoiceFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setInvoiceFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setInvoicePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setInvoicePreview('pdf');
    }
  }

  function handleRemoveFile() {
    setInvoiceFile(null);
    setInvoicePreview(null);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleRemoveExisting() {
    setForm((f) => ({ ...f, existingInvoicePath: null }));
  }

  async function handleSubmit() {
    if (!form.pid)                         return;
    if (!form.date)                        return;
    if (!form.amount || +form.amount <= 0) return;

    let invoicePath: string | null = form.existingInvoicePath;

    // Upload new file if selected
    if (invoiceFile) {
      setIsUploading(true);
      try {
        const d    = new Date(form.date);
        const year = d.getFullYear();
        const mon  = String(d.getMonth() + 1).padStart(2, '0');
        const ext  = extFromMime(invoiceFile.type);
        // Use timestamp as expense-id placeholder before we have the DB id
        const ts   = Date.now();
        const path = `invoices/${form.pid}/${year}/${mon}/${ts}.${ext}`;

        const fd = new FormData();
        fd.append('file',   invoiceFile);
        fd.append('bucket', BUCKET);
        fd.append('path',   path);

        const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setFileError(err.error ?? 'Upload failed — expense saved without invoice');
          setIsUploading(false);
          // Continue saving expense without invoice rather than blocking
          invoicePath = null;
        } else {
          const data = await res.json();
          invoicePath = data.path;
        }
      } catch {
        setFileError('Upload failed — expense saved without invoice');
        invoicePath = null;
      } finally {
        setIsUploading(false);
      }
    }

    await onSave({
      propertyId:  form.pid,
      expenseDate: form.date,
      category:    form.category,
      amount:      parseFloat(form.amount),
      description: form.note.trim(),
      invoicePath,
    }, editId);
  }

  const saving = isSaving || isUploading;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editId ? 'Edit Daily Expense' : 'Add Daily Expense'}
      subtitle="Record an operational expense"
    >
      {/* Property + Date row */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>Property *</label>
          <div className={styles.sw}>
            <select
              className={styles.fs}
              value={form.pid}
              onChange={(e) => set('pid', e.target.value)}
            >
              {properties.length === 0 ? (
                <option value="">No properties</option>
              ) : (
                properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))
              )}
            </select>
          </div>
        </div>
        <div className={styles.fl}>
          <label>Date *</label>
          <input
            className={styles.fi}
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
          />
          {monthBadge && (
            <div style={{ fontSize: '10.5px', color: 'var(--or)', fontWeight: 600, marginTop: '3px' }}>
              {monthBadge}
            </div>
          )}
        </div>
      </div>

      {/* Category + Amount row */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>Category *</label>
          <div className={styles.sw}>
            <select
              className={styles.fs}
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              {DAILY_EXP_CATS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.fl}>
          <label>Amount (₹) *</label>
          <input
            className={styles.fi}
            type="number"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {/* Notes */}
      <div className={styles.fl}>
        <label>Notes</label>
        <input
          className={styles.fi}
          value={form.note}
          onChange={(e) => set('note', e.target.value)}
          placeholder="Optional note"
        />
      </div>

      {/* Invoice Upload — v3 plan Section 3.1 */}
      <div className={styles.fl}>
        <label>Invoice / Receipt</label>

        {/* Show existing invoice path when editing */}
        {form.existingInvoicePath && !invoiceFile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '7px 10px', background: 'var(--grp)', borderRadius: '8px',
            marginBottom: '6px', fontSize: '11.5px',
          }}>
            <span>🧾</span>
            <span style={{ flex: 1, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {form.existingInvoicePath.split('/').pop()}
            </span>
            <button
              type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rd)', fontSize: '13px', padding: '0 4px' }}
              onClick={handleRemoveExisting}
              title="Remove invoice"
            >
              ✕
            </button>
          </div>
        )}

        {/* File preview */}
        {invoiceFile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '7px 10px', background: 'var(--s2)', borderRadius: '8px',
            marginBottom: '6px',
          }}>
            {invoicePreview && invoicePreview !== 'pdf' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={invoicePreview} alt="preview" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '5px' }} />
            ) : (
              <span style={{ fontSize: '22px' }}>📄</span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {invoiceFile.name}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--t3)' }}>
                {(invoiceFile.size / 1024).toFixed(0)} KB
              </div>
            </div>
            <button
              type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rd)', fontSize: '16px', padding: '0 4px' }}
              onClick={handleRemoveFile}
              title="Remove file"
            >
              ✕
            </button>
          </div>
        )}

        {/* File input — hidden, triggered by button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {!invoiceFile && (
          <button
            type="button"
            className="btn btn-g btn-sm"
            style={{ width: '100%', justifyContent: 'center', padding: '8px' }}
            onClick={() => fileInputRef.current?.click()}
          >
            📎 {form.existingInvoicePath ? 'Replace Invoice' : 'Attach Invoice / Receipt'}
          </button>
        )}

        {fileError && (
          <div style={{ fontSize: '11px', color: 'var(--rd)', marginTop: '4px' }}>{fileError}</div>
        )}
        <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '3px' }}>
          JPEG, PNG, WebP or PDF — max 5 MB
        </div>
      </div>

      {/* Footer */}
      <div className={styles.mf}>
        <button
          type="button"
          className={`${styles.mb} ${styles.can}`}
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.mb} ${styles.sub}`}
          onClick={handleSubmit}
          disabled={saving}
        >
          {isUploading ? 'Uploading…' : isSaving ? 'Saving…' : 'Save Expense'}
        </button>
      </div>
    </Modal>
  );
}
