'use client';
// src/app/(dashboard)/bookings/BookingModal.tsx
//
// Add/Edit Booking modal. Pixel-matches the HTML bookModal exactly.
// Sections: Property+Source+Guest, Booking Type (Stay/Event),
//           Stay fields, Event fields, Add-on Services, Rating, Notes.
//
// Schema gaps (document for evaluation migration):
//   - room_amount Decimal   — room-only revenue separate from total
//   - booking_type String   — 'stay' | 'event'
//   - event_type String?    — 'Birthday', 'Party', etc.
//   - event_guests Int?
//   - food_cost Decimal?
//   - services Json          — [{name, amount}]
//   - rating Int?
// Until migrated: total amount goes into revenue; extras stored in notes.
//
// Source: <div class="ov" id="bookModal"> + saveBooking() + editBooking()

import { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import styles from '@/components/ui/ui.module.css';
import type { SerializableProperty } from '../properties/page';

// ---------------------------------------------------------------------------
// Constants — verbatim from the HTML
// ---------------------------------------------------------------------------

const SOURCES = [
  'Airbnb', 'Booking.com', 'MakeMyTrip', 'Direct',
  'Goibibo', 'OYO', 'Other',
];

const EVENT_TYPES = ['Birthday', 'Party', 'Corporate', 'Wedding', 'Custom'];

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
  // Stay fields
  checkIn: string;
  checkOut: string;
  nights: number;
  roomAmount: string;
  // Event fields
  eventDate: string;
  eventType: string;
  eventGuests: string;
  eventBaseAmount: string;
  foodIncluded: boolean;
  foodCost: string;
  // Add-on services
  services: ServiceRow[];
  // Rating + notes
  rating: number;
  notes: string;
}

export interface BookingSavePayload {
  propertyId: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  checkIn: string;      // YYYY-MM-DD
  checkOut: string;     // YYYY-MM-DD
  nights: number;
  revenue: number;      // total incl. services & food
  roomRevenue: number;  // room-only
  platform: string;
  notes: string;
  // Extended fields (stored when schema migrated)
  bookingType: BookingType;
  eventType?: string;
  eventGuests?: number;
  foodCost?: number;
  services?: Array<{ name: string; amount: number }>;
  rating?: number;
}

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  editId: string | null;
  initialValues?: Partial<BookingFormValues>;
  properties: SerializableProperty[];
  guestNames: string[];
  onSave: (payload: BookingSavePayload, editId: string | null) => Promise<void>;
  isSaving: boolean;
}

// ---------------------------------------------------------------------------
// Blank default
// ---------------------------------------------------------------------------

const todayStr = () => new Date().toISOString().split('T')[0];

const BLANK: BookingFormValues = {
  pid: '', source: 'Airbnb', guestName: '', guestPhone: '',
  guestEmail: '', guestCity: '', bookingType: 'stay',
  checkIn: todayStr(), checkOut: '', nights: 0, roomAmount: '',
  eventDate: '', eventType: 'Birthday', eventGuests: '',
  eventBaseAmount: '', foodIncluded: false, foodCost: '',
  services: [], rating: 0, notes: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingModal({
  isOpen, onClose, editId, initialValues, properties, guestNames, onSave, isSaving,
}: BookingModalProps) {
  const [form, setForm]       = useState<BookingFormValues>(BLANK);
  const [svcCounter, setSvcCounter] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setForm({ ...BLANK, pid: properties[0]?.id ?? '', ...initialValues });
      setSvcCounter(0);
    }
  }, [isOpen, initialValues]); // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof BookingFormValues>(field: K, value: BookingFormValues[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // ── Nights auto-calc — verbatim calcBookNights() ─────────────────────────
  function handleCheckOutChange(val: string) {
    set('checkOut', val);
    if (form.checkIn && val) {
      const diff = Math.round(
        (new Date(val).getTime() - new Date(form.checkIn).getTime()) / 86400000,
      );
      set('nights', diff > 0 ? diff : 0);
    }
  }

  // ── Total amount — verbatim updBkTotal() ─────────────────────────────────
  const total = useMemo(() => {
    let base = 0;
    if (form.bookingType === 'stay') {
      base = parseFloat(form.roomAmount) || 0;
    } else {
      base = parseFloat(form.eventBaseAmount) || 0;
      if (form.foodIncluded) base += parseFloat(form.foodCost) || 0;
    }
    const svcs = form.services.reduce((s, sv) => s + (parseFloat(sv.amount) || 0), 0);
    return base + svcs;
  }, [form.bookingType, form.roomAmount, form.eventBaseAmount,
      form.foodIncluded, form.foodCost, form.services]);

  // ── Add-on services — verbatim addBkService() ─────────────────────────────
  function addService() {
    const id = svcCounter + 1;
    setSvcCounter(id);
    set('services', [...form.services, { id, name: '', amount: '' }]);
  }

  function updateService(id: number, field: 'name' | 'amount', value: string) {
    set('services', form.services.map((s) => s.id === id ? { ...s, [field]: value } : s));
  }

  function removeService(id: number) {
    set('services', form.services.filter((s) => s.id !== id));
  }

  // ── Star rating ───────────────────────────────────────────────────────────
  function renderStars() {
    return [1,2,3,4,5].map((n) => (
      <span
        key={n}
        onClick={() => set('rating', n)}
        style={{
          cursor: 'pointer', fontSize: '20px',
          color: n <= form.rating ? '#F4521E' : '#D4D0C8',
        }}
      >
        {n <= form.rating ? '★' : '☆'}
      </span>
    ));
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!form.pid || !form.guestName.trim()) return;
    const checkIn  = form.bookingType === 'event' ? form.eventDate : form.checkIn;
    const checkOut = form.bookingType === 'event' ? form.eventDate : form.checkOut;
    const roomRev  = form.bookingType === 'stay'
      ? parseFloat(form.roomAmount) || 0
      : parseFloat(form.eventBaseAmount) || 0;

    await onSave({
      propertyId:   form.pid,
      guestName:    form.guestName.trim(),
      guestPhone:   form.guestPhone.trim(),
      guestEmail:   form.guestEmail.trim(),
      checkIn,
      checkOut,
      nights:       form.bookingType === 'event' ? 0 : form.nights,
      revenue:      total,
      roomRevenue:  roomRev,
      platform:     form.source,
      notes:        form.notes.trim(),
      bookingType:  form.bookingType,
      eventType:    form.bookingType === 'event' ? form.eventType : undefined,
      eventGuests:  form.bookingType === 'event' ? (parseInt(form.eventGuests) || 0) : undefined,
      foodCost:     form.foodIncluded ? (parseFloat(form.foodCost) || 0) : undefined,
      services:     form.services
        .filter((s) => s.name && parseFloat(s.amount) > 0)
        .map((s) => ({ name: s.name, amount: parseFloat(s.amount) })),
      rating:       form.rating || undefined,
    }, editId);
  }

  const fIN = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Booking"
      subtitle="Record a stay or event booking"
      size="wide"
    >
      {/* ── 1. Property + Source + Guest ────────────────────────────────── */}
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
          <div className={`tab${form.bookingType === 'stay' ? ' active' : ''}`} onClick={() => set('bookingType', 'stay')}>🏠 Stay Booking</div>
          <div className={`tab${form.bookingType === 'event' ? ' active' : ''}`} onClick={() => set('bookingType', 'event')}>🎉 Event Booking</div>
        </div>
        {form.bookingType === 'event' && (
          <div style={{ fontSize: '10.5px', color: 'var(--t2)', background: 'var(--s2)', borderRadius: '7px', padding: '6px 10px', marginTop: '6px' }}>
            Event bookings are not charged per night — nights will be recorded as 0. Use the event date and total amount below.
          </div>
        )}
      </div>

      {/* ── 3a. Stay fields ───────────────────────────────────────────────── */}
      {form.bookingType === 'stay' && (
        <div>
          <div className={styles.fg}>
            <div className={styles.fl}>
              <label>Check-in *</label>
              <input className={styles.fi} type="date" value={form.checkIn} onChange={(e) => set('checkIn', e.target.value)} />
            </div>
            <div className={styles.fl}>
              <label>Check-out *</label>
              <input className={styles.fi} type="date" value={form.checkOut} onChange={(e) => handleCheckOutChange(e.target.value)} />
            </div>
          </div>
          <div className={styles.fg}>
            <div className={styles.fl}>
              <label>Nights</label>
              <input className={styles.fi} type="number" value={form.nights || ''} readOnly />
              {form.checkOut && (
                <div style={{ fontSize: '10.5px', color: 'var(--or)', fontWeight: 600, marginTop: '3px' }}>
                  {(() => {
                    const MN = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
                    const d = new Date(form.checkOut); return `Month: ${MN[d.getMonth()+1]} ${d.getFullYear()}`;
                  })()}
                </div>
              )}
            </div>
            <div className={styles.fl}>
              <label>Room Amount (₹) *</label>
              <input className={styles.fi} type="number" value={form.roomAmount} onChange={(e) => set('roomAmount', e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>
      )}

      {/* ── 3b. Event fields ──────────────────────────────────────────────── */}
      {form.bookingType === 'event' && (
        <div>
          <div className={styles.fg}>
            <div className={styles.fl}>
              <label>Event Date *</label>
              <input className={styles.fi} type="date" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
            </div>
            <div className={styles.fl}>
              <label>Event Type</label>
              <div className={styles.sw}>
                <select className={styles.fs} value={form.eventType} onChange={(e) => set('eventType', e.target.value)}>
                  {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className={styles.fg}>
            <div className={styles.fl}>
              <label>Number of Guests</label>
              <input className={styles.fi} type="number" value={form.eventGuests} onChange={(e) => set('eventGuests', e.target.value)} placeholder="e.g. 50" />
            </div>
            <div className={styles.fl}>
              <label>Base Amount (₹) *</label>
              <input className={styles.fi} type="number" value={form.eventBaseAmount} onChange={(e) => set('eventBaseAmount', e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className={styles.fg}>
            <div className={styles.fl}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                Food Included
                <input type="checkbox" checked={form.foodIncluded} onChange={(e) => set('foodIncluded', e.target.checked)} style={{ accentColor: 'var(--or)' }} />
              </label>
            </div>
            {form.foodIncluded && (
              <div className={styles.fl}>
                <label>Food Cost (₹)</label>
                <input className={styles.fi} type="number" value={form.foodCost} onChange={(e) => set('foodCost', e.target.value)} placeholder="0" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 4. Add-on services — verbatim addBkService() ─────────────────── */}
      <div style={{ background: 'var(--grp)', borderRadius: '9px', padding: '10px 12px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gr)' }}>ADD-ON SERVICES</div>
          <button type="button" className="btn btn-g btn-sm" onClick={addService} style={{ fontSize: '10px', padding: '3px 8px' }}>
            + Service
          </button>
        </div>

        {form.services.map((svc) => (
          <div key={svc.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: '4px', marginBottom: '4px', alignItems: 'center' }}>
            <input
              className={styles.fi}
              placeholder="e.g. Food, Birthday"
              value={svc.name}
              onChange={(e) => updateService(svc.id, 'name', e.target.value)}
              style={{ fontSize: '11px', padding: '5px 7px' }}
            />
            <input
              className={styles.fi}
              type="number"
              placeholder="0"
              value={svc.amount}
              onChange={(e) => updateService(svc.id, 'amount', e.target.value)}
              style={{ fontSize: '11px', padding: '5px 7px', fontVariantNumeric: 'tabular-nums' }}
            />
            <button type="button" className="btn btn-rd btn-sm" onClick={() => removeService(svc.id)} style={{ padding: '3px 6px', fontSize: '10px' }}>✕</button>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800, marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(22,163,74,.15)' }}>
          <span>TOTAL:</span>
          <span style={{ color: 'var(--gr)' }}>{fIN(total)}</span>
        </div>
      </div>

      {/* ── 5. Rating + Notes ─────────────────────────────────────────────── */}
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