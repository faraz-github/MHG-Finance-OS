'use client';
// src/app/(dashboard)/bookings/BookingModal.tsx
//
// Add/Edit Booking modal.
// Stay and Event bookings share the same date/nights/amount pattern.
// Event mode adds: Event Type, Number of Guests, and a pre-inserted
// Food Catering add-on row (amount locked to 0 when unchecked).
// Add-on services are cleared on booking type toggle.

import { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import styles from '@/components/ui/ui.module.css';
import type { BookingProperty } from './BookingsClient';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCES = [
  'Airbnb', 'Booking.com', 'MakeMyTrip', 'Direct',
  'Goibibo', 'OYO', 'Other',
];

const EVENT_TYPES = ['Birthday', 'Party', 'Corporate', 'Wedding', 'Custom'];

const MN = ['','January','February','March','April','May','June',
            'July','August','September','October','November','December'];

// Food catering row id — fixed so we can identify it
const FOOD_SVC_ID = 0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookingType = 'stay' | 'event';

interface ServiceRow {
  id: number;
  name: string;
  amount: string;
}

export interface BookingFormValues {
  pid: string;
  source: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestCity: string;
  bookingType: BookingType;
  checkIn: string;
  checkOut: string;
  nights: number;
  bookingAmount: string;
  eventType: string;
  eventGuests: string;
  foodIncluded: boolean;
  services: ServiceRow[];
  rating: number;
  notes: string;
}

export interface BookingSavePayload {
  propertyId: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  revenue: number;
  roomRevenue: number;
  platform: string;
  notes: string;
  bookingType: BookingType;
  eventType?: string;
  eventGuests?: number;
  services?: Array<{ name: string; amount: number }>;
  rating?: number;
}

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  editId: string | null;
  initialValues?: Partial<BookingFormValues>;
  properties: BookingProperty[];
  guestNames: string[];
  onSave: (payload: BookingSavePayload, editId: string | null) => Promise<void>;
  isSaving: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const todayStr = () => new Date().toISOString().split('T')[0];

function makeFoodRow(): ServiceRow {
  return { id: FOOD_SVC_ID, name: 'Food Catering', amount: '0' };
}

function defaultServicesForType(type: BookingType): ServiceRow[] {
  return type === 'event' ? [makeFoodRow()] : [];
}

// ---------------------------------------------------------------------------
// Blank default
// ---------------------------------------------------------------------------

const BLANK: BookingFormValues = {
  pid: '', source: 'Airbnb', guestName: '', guestPhone: '',
  guestEmail: '', guestCity: '', bookingType: 'stay',
  checkIn: todayStr(), checkOut: '', nights: 1, bookingAmount: '',
  eventType: 'Birthday', eventGuests: '',
  foodIncluded: false,
  services: [], rating: 0, notes: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingModal({
  isOpen, onClose, editId, initialValues, properties, guestNames, onSave, isSaving,
}: BookingModalProps) {
  const [form, setForm]         = useState<BookingFormValues>(BLANK);
  const [svcCounter, setSvcCounter] = useState(1); // 0 reserved for food row

  useEffect(() => {
    if (isOpen) {
      const base: BookingFormValues = {
        ...BLANK,
        pid: properties[0]?.id ?? '',
        ...initialValues,
      };
      if (!initialValues?.services) {
        base.services = defaultServicesForType(base.bookingType);
      }
      setForm(base);
      setSvcCounter(1);
    }
  }, [isOpen, initialValues]); // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof BookingFormValues>(field: K, value: BookingFormValues[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // ── Booking type toggle — clears services, resets food state ─────────────
  function handleTypeChange(type: BookingType) {
    setForm((f) => ({
      ...f,
      bookingType: type,
      services: defaultServicesForType(type),
      foodIncluded: false,
    }));
    setSvcCounter(1);
  }

  // ── Nights auto-calc — minimum 1 always ──────────────────────────────────
  function handleCheckOutChange(val: string) {
    set('checkOut', val);
    if (form.checkIn && val) {
      const diff = Math.round(
        (new Date(val).getTime() - new Date(form.checkIn).getTime()) / 86400000,
      );
      set('nights', Math.max(1, diff));
    }
  }

  // ── Food catering toggle ──────────────────────────────────────────────────
  function handleFoodToggle(checked: boolean) {
    setForm((f) => ({
      ...f,
      foodIncluded: checked,
      services: f.services.map((s) =>
        s.id === FOOD_SVC_ID ? { ...s, amount: checked ? s.amount : '0' } : s,
      ),
    }));
  }

  // ── Total ─────────────────────────────────────────────────────────────────
  const total = useMemo(() => {
    const base = parseFloat(form.bookingAmount) || 0;
    const svcs = form.services.reduce((s, sv) => s + (parseFloat(sv.amount) || 0), 0);
    return base + svcs;
  }, [form.bookingAmount, form.services]);

  // ── Add-on services ───────────────────────────────────────────────────────
  function addService() {
    const id = svcCounter + 1;
    setSvcCounter(id);
    set('services', [...form.services, { id, name: '', amount: '' }]);
  }

  function updateService(id: number, field: 'name' | 'amount', value: string) {
    if (id === FOOD_SVC_ID && field === 'name') return;
    if (id === FOOD_SVC_ID && field === 'amount' && !form.foodIncluded) return;
    set('services', form.services.map((s) => s.id === id ? { ...s, [field]: value } : s));
  }

  function removeService(id: number) {
    if (id === FOOD_SVC_ID) return;
    set('services', form.services.filter((s) => s.id !== id));
  }

  // ── Star rating ───────────────────────────────────────────────────────────
  function renderStars() {
    return [1,2,3,4,5].map((n) => (
      <span
        key={n}
        onClick={() => set('rating', n)}
        style={{ cursor: 'pointer', fontSize: '20px', color: n <= form.rating ? '#F4521E' : '#D4D0C8' }}
      >
        {n <= form.rating ? '★' : '☆'}
      </span>
    ));
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!form.pid || !form.guestName.trim()) return;
    const bookingAmount = parseFloat(form.bookingAmount) || 0;

    await onSave({
      propertyId:  form.pid,
      guestName:   form.guestName.trim(),
      guestPhone:  form.guestPhone.trim(),
      guestEmail:  form.guestEmail.trim(),
      checkIn:     form.checkIn,
      checkOut:    form.checkOut,
      nights:      form.nights,
      revenue:     total,
      roomRevenue: bookingAmount,
      platform:    form.source,
      notes:       form.notes.trim(),
      bookingType: form.bookingType,
      eventType:   form.bookingType === 'event' ? form.eventType : undefined,
      eventGuests: form.bookingType === 'event' ? (parseInt(form.eventGuests) || 0) : undefined,
      services:    form.services
        .filter((s) => s.name && parseFloat(s.amount) > 0)
        .map((s) => ({ name: s.name, amount: parseFloat(s.amount) })),
      rating:      form.rating || undefined,
    }, editId);
  }

  const fIN = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isEvent = form.bookingType === 'event';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editId ? 'Edit Booking' : 'Add Booking'}
      subtitle="Record a stay or event booking"
      size="wide"
    >
      {/* ── 1. Property + Source + Guest ─────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid var(--bdr)', paddingBottom: '10px', marginBottom: '10px' }}>
        <div className={styles.fg}>
          <div className={styles.fl}>
            <label>Property *</label>
            <div className={styles.sw}>
              <select className={styles.fs} value={form.pid} onChange={(e) => set('pid', e.target.value)}>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.fl}>
            <label>Source</label>
            <div className={styles.sw}>
              <select className={styles.fs} value={form.source} onChange={(e) => set('source', e.target.value)}>
                {SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className={styles.fg}>
          <div className={styles.fl}>
            <label>Guest Name *</label>
            <input
              className={styles.fi}
              value={form.guestName}
              onChange={(e) => set('guestName', e.target.value)}
              placeholder="Search or enter new"
              list="bkGuestList"
            />
            <datalist id="bkGuestList">
              {guestNames.map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
          <div className={styles.fl}>
            <label>Guest Phone</label>
            <input className={styles.fi} value={form.guestPhone} onChange={(e) => set('guestPhone', e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div className={styles.fg}>
          <div className={styles.fl}>
            <label>Email</label>
            <input className={styles.fi} type="email" value={form.guestEmail} onChange={(e) => set('guestEmail', e.target.value)} placeholder="Optional" />
          </div>
          <div className={styles.fl}>
            <label>City</label>
            <input className={styles.fi} value={form.guestCity} onChange={(e) => set('guestCity', e.target.value)} placeholder="Optional" />
          </div>
        </div>
      </div>

      {/* ── 2. Booking type toggle ────────────────────────────────────────── */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--t3)', marginBottom: '6px' }}>BOOKING TYPE</div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <div className={`tab${!isEvent ? ' active' : ''}`} onClick={() => handleTypeChange('stay')}>🏠 Stay Booking</div>
          <div className={`tab${isEvent ? ' active' : ''}`} onClick={() => handleTypeChange('event')}>🎉 Event Booking</div>
        </div>
      </div>

      {/* ── 3. Dates + Nights + Amount — identical for both types ─────────── */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>{isEvent ? 'Event Start *' : 'Check-in *'}</label>
          <input className={styles.fi} type="date" value={form.checkIn} onChange={(e) => set('checkIn', e.target.value)} />
        </div>
        <div className={styles.fl}>
          <label>{isEvent ? 'Event End *' : 'Check-out *'}</label>
          <input className={styles.fi} type="date" value={form.checkOut} onChange={(e) => handleCheckOutChange(e.target.value)} />
        </div>
      </div>

      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>Nights</label>
          <input className={styles.fi} type="number" value={form.nights || ''} readOnly />
          {form.checkOut && (
            <div style={{ fontSize: '10.5px', color: 'var(--or)', fontWeight: 600, marginTop: '3px' }}>
              {(() => { const d = new Date(form.checkOut); return `Month: ${MN[d.getMonth()+1]} ${d.getFullYear()}`; })()}
            </div>
          )}
        </div>
        <div className={styles.fl}>
          <label>Booking Amount (₹) *</label>
          <input className={styles.fi} type="number" value={form.bookingAmount} onChange={(e) => set('bookingAmount', e.target.value)} placeholder="0" />
        </div>
      </div>

      {/* ── 4. Event-only fields ─────────────────────────────────────────── */}
      {isEvent && (
        <div className={styles.fg}>
          <div className={styles.fl}>
            <label>Event Type</label>
            <div className={styles.sw}>
              <select className={styles.fs} value={form.eventType} onChange={(e) => set('eventType', e.target.value)}>
                {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.fl}>
            <label>Number of Guests</label>
            <input className={styles.fi} type="number" value={form.eventGuests} onChange={(e) => set('eventGuests', e.target.value)} placeholder="e.g. 50" />
          </div>
        </div>
      )}

      {/* ── 5. Food catering toggle (event only) ─────────────────────────── */}
      {isEvent && (
        <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: 'var(--t2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.foodIncluded}
              onChange={(e) => handleFoodToggle(e.target.checked)}
              style={{ accentColor: 'var(--or)', width: '14px', height: '14px' }}
            />
            Food Catering Included
          </label>
          <span style={{ fontSize: '10.5px', color: 'var(--t3)' }}>
            {form.foodIncluded ? 'Enter cost in add-ons below' : 'Check to enter catering cost'}
          </span>
        </div>
      )}

      {/* ── 6. Add-on services ───────────────────────────────────────────── */}
      <div style={{ background: 'var(--grp)', borderRadius: '9px', padding: '10px 12px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gr)' }}>ADD-ON SERVICES</div>
          <button type="button" className="btn btn-g btn-sm" onClick={addService} style={{ fontSize: '10px', padding: '3px 8px' }}>
            + Service
          </button>
        </div>

        {form.services.map((svc) => {
          const isFoodRow  = svc.id === FOOD_SVC_ID;
          const foodLocked = isFoodRow && !form.foodIncluded;
          return (
            <div key={svc.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: '4px', marginBottom: '4px', alignItems: 'center' }}>
              <input
                className={styles.fi}
                placeholder="e.g. Decoration, Transport"
                value={svc.name}
                onChange={(e) => updateService(svc.id, 'name', e.target.value)}
                style={{ fontSize: '11px', padding: '5px 7px' }}
                readOnly={isFoodRow}
              />
              <input
                className={styles.fi}
                type="number"
                placeholder="0"
                value={svc.amount}
                onChange={(e) => updateService(svc.id, 'amount', e.target.value)}
                style={{ fontSize: '11px', padding: '5px 7px', fontVariantNumeric: 'tabular-nums', opacity: foodLocked ? 0.4 : 1 }}
                readOnly={foodLocked}
              />
              {isFoodRow
                ? <div style={{ width: '28px' }} />
                : <button type="button" className="btn btn-rd btn-sm" onClick={() => removeService(svc.id)} style={{ padding: '3px 6px', fontSize: '10px' }}>✕</button>
              }
            </div>
          );
        })}

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800, marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(22,163,74,.15)' }}>
          <span>TOTAL:</span>
          <span style={{ color: 'var(--gr)' }}>{fIN(total)}</span>
        </div>
      </div>

      {/* ── 7. Rating + Notes ────────────────────────────────────────────── */}
      <div className={styles.fg}>
        <div className={styles.fl}>
          <label>Rating (1-5 ⭐)</label>
          <div style={{ display: 'flex', gap: '4px' }}>{renderStars()}</div>
        </div>
        <div className={styles.fl}>
          <label>Notes</label>
          <input className={styles.fi} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Internal notes" />
        </div>
      </div>

      {/* Footer */}
      <div className={styles.mf}>
        <button type="button" className={`${styles.mb} ${styles.can}`} onClick={onClose}>Cancel</button>
        <button type="button" className={`${styles.mb} ${styles.sub}`} onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save Booking'}
        </button>
      </div>
    </Modal>
  );
}
