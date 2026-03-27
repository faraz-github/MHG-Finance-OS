'use client';
// src/app/(dashboard)/bookings/BookingsClient.tsx
//
// Client Component. Period filtering uses bookingMatchesPeriod() which checks
// whether the booking's date range OVERLAPS the current period — so a booking
// that starts in March and ends in April appears in both months.
//
// HTML source: rndBookings(), saveBooking(), editBooking(), delBooking()

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePeriod } from '@/hooks/usePeriod';
import { usePageFilters } from '@/hooks/usePageFilters';
import { PageFilterBar } from '@/components/layout/PageFilterBar';
import type { FilterOption } from '@/components/layout/PageFilterBar';
import { getFYMonths } from '@/lib/period';
import type { PeriodState } from '@/lib/period';
import { MetricCard, MetricCardGrid } from '@/components/ui/MetricCard';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { BookingModal } from './BookingModal';
import type { BookingFormValues, BookingSavePayload } from './BookingModal';
import type { SerializableProperty } from '../properties/page';

// ---------------------------------------------------------------------------
// bookingMatchesPeriod — overlap-aware period filter for bookings.
//
// A booking matches the current period if its date range overlaps with the
// period window. This means a booking that starts in March and ends in April
// will appear in BOTH March and April filters.
//
// Overlap condition: checkIn <= periodEnd  AND  checkOut >= periodStart
// ---------------------------------------------------------------------------

const Q_MONTHS_BK: Record<number, number[]> = {
  1: [4, 5, 6], 2: [7, 8, 9], 3: [10, 11, 12], 4: [1, 2, 3],
};

function getPeriodWindow(period: PeriodState): { start: Date; end: Date } | null {
  const { cPType, cM, cY, cQ, cFY, cDateFrom, cDateTo, cDay, cWeek } = period;

  switch (cPType) {
    case 'daily': {
      const d = new Date(cDay + 'T00:00:00');
      return { start: d, end: d };
    }
    case 'weekly': {
      const ws = [0, 1, 8, 15, 22];
      const lastDay = new Date(cY, cM, 0).getDate();
      const we = [0, 7, 14, 21, lastDay];
      return {
        start: new Date(cY, cM - 1, ws[cWeek]),
        end:   new Date(cY, cM - 1, we[cWeek]),
      };
    }
    case 'monthly':
      return {
        start: new Date(cY, cM - 1, 1),
        end:   new Date(cY, cM, 0),     // last day of month
      };
    case 'quarterly': {
      const months = Q_MONTHS_BK[cQ] ?? [];
      if (!months.length) return null;
      const yr = cQ === 4 ? cFY + 1 : cFY;
      const firstM = months[0];
      const lastM  = months[months.length - 1];
      return {
        start: new Date(yr, firstM - 1, 1),
        end:   new Date(yr, lastM, 0),
      };
    }
    case 'fy': {
      const fyMonths = getFYMonths(cFY);
      if (!fyMonths.length) return null;
      const first = fyMonths[0];
      const last  = fyMonths[fyMonths.length - 1];
      return {
        start: new Date(first.year, first.month - 1, 1),
        end:   new Date(last.year, last.month, 0),
      };
    }
    case 'custom': {
      if (!cDateFrom && !cDateTo) return null; // no window = show all
      const start = cDateFrom ? new Date(cDateFrom + '-01') : new Date(2000, 0, 1);
      const to    = cDateTo   ? new Date(cDateTo   + '-01') : new Date(2099, 11, 31);
      // end = last day of the 'to' month
      const end   = new Date(to.getFullYear(), to.getMonth() + 1, 0);
      return { start, end };
    }
    default:
      return {
        start: new Date(cY, cM - 1, 1),
        end:   new Date(cY, cM, 0),
      };
  }
}

/**
 * Returns true if the booking's [checkIn, checkOut] range overlaps
 * with the current period window. Cross-month bookings will appear
 * in every period they span.
 */
function bookingMatchesPeriod(
  checkIn:  string,
  checkOut: string,
  period:   PeriodState,
): boolean {
  if (!checkIn) return false;
  const window = getPeriodWindow(period);
  if (!window) return true; // custom with no dates = show all
  const ci = new Date(checkIn  + 'T00:00:00');
  const co = new Date(checkOut + 'T00:00:00');
  // Overlap: booking starts before period ends AND booking ends after period starts
  return ci <= window.end && co >= window.start;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50; // verbatim _bkPage from HTML

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const fIN = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fI  = (n: number) => {
  const v = Math.abs(n);
  if (v >= 100000) return (n < 0 ? '-' : '') + '₹' + (v / 100000).toFixed(2) + 'L';
  if (v >= 1000)   return (n < 0 ? '-' : '') + '₹' + (v / 1000).toFixed(2) + 'K';
  return (n < 0 ? '-' : '') + '₹' + v.toFixed(2);
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SerializableBooking {
  id: string;
  pid: string;
  propertyName: string;
  guestId: string | null;
  guestName: string;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  nights: number;
  revenue: number;
  platform: string;
  status: string;
  notes: string | null;
  bookingType: string;  // 'stay' | 'event' — defaults 'stay' until schema migrated
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BookingsClientProps {
  bookings: SerializableBooking[];
  properties: SerializableProperty[];
  guestNames: string[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingsClient({
  bookings,
  properties,
  guestNames,
  canCreate,
  canEdit,
  canDelete,
}: BookingsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  // ── Local state ───────────────────────────────────────────────────────────
  const [page, setPage]             = useState(1);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<BookingFormValues>>();
  const [isSaving, setIsSaving]     = useState(false);

  // ── Period store + per-page filters ───────────────────────────────────────
  const periodState = usePeriod();
  const filters = usePageFilters({ city: true, property: true, platform: true });

  // ── Property lookup ───────────────────────────────────────────────────────
  const propMap = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p])),
    [properties],
  );

  // ── Unique platforms for filter dropdown ──────────────────────────────────
  const platformOptions: FilterOption[] = useMemo(() => {
    const s = new Set(bookings.map((b) => b.platform).filter(Boolean));
    return [...s].sort().map((p) => ({ value: p, label: p }));
  }, [bookings]);

  const cityOptions: FilterOption[] = useMemo(
    () => [...new Set(properties.map((p) => p.city).filter(Boolean))].sort().map((c) => ({ value: c, label: c })),
    [properties],
  );
  const propOptions: FilterOption[] = useMemo(
    () => properties.map((p) => ({ value: p.id, label: p.name })),
    [properties],
  );

  // ── Period + filter ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let bks = bookings.filter((b) =>
      bookingMatchesPeriod(b.checkIn, b.checkOut, periodState as PeriodState)
    );
    // City filter — match against property city
    if (filters.city !== 'all') bks = bks.filter((b) => propMap[b.pid]?.city === filters.city);
    if (filters.property !== 'all') bks = bks.filter((b) => b.pid === filters.property);
    if (filters.platform !== 'all') bks = bks.filter((b) => b.platform === filters.platform);
    return [...bks].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, filters.city, filters.property, filters.platform, propMap,
      periodState.cPType, periodState.cM, periodState.cY, periodState.cQ,
      periodState.cFY, periodState.cDateFrom, periodState.cDateTo,
      periodState.cDay, periodState.cWeek]);

  // ── KPI derivations — verbatim from HTML ─────────────────────────────────
  const totalRev     = filtered.reduce((s, b) => s + b.revenue, 0);
  const totalNights  = filtered.reduce((s, b) => s + b.nights, 0);
  const uniqueGuests = new Set(filtered.map((b) => b.guestId ?? b.guestName)).size;
  const avgPerNight  = totalNights > 0 ? +(totalRev / totalNights).toFixed(2) : 0;

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const overflow   = filtered.length > PAGE_SIZE;

  // ── Add / edit ────────────────────────────────────────────────────────────
  function handleAdd() {
    setEditId(null);
    setEditValues(undefined);
    setModalOpen(true);
  }

  function handleEdit(b: SerializableBooking) {
    setEditId(b.id);
    setEditValues({
      pid:        b.pid,
      source:     b.platform,
      guestName:  b.guestName,
      checkIn:    b.checkIn,
      checkOut:   b.checkOut,
      nights:     b.nights,
      roomAmount: String(b.revenue),
      notes:      b.notes ?? '',
      bookingType: (b.bookingType as 'stay' | 'event') || 'stay',
    });
    setModalOpen(true);
  }

  async function handleSave(payload: BookingSavePayload, id: string | null) {
    setIsSaving(true);
    try {
      const res = await fetch(
        id ? `/api/bookings/${id}` : '/api/bookings',
        {
          method:  id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Failed to save booking', 'er');
        return;
      }
      toast(
        `✓ Booking ${fIN(payload.revenue)} saved — ${payload.guestName} (${payload.nights} nights)`,
        'ok',
      );
      setModalOpen(false);
      startTransition(() => router.refresh());
    } catch {
      toast('Network error — please try again', 'er');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(b: SerializableBooking) {
    if (!window.confirm('Delete this booking? Guest stats and reports will be recalculated.')) return;
    try {
      const res = await fetch(`/api/bookings/${b.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error ?? 'Failed to delete booking', 'er');
        return;
      }
      toast('✓ Booking deleted — reports recalculated', 'ok');
      startTransition(() => router.refresh());
    } catch {
      toast('Network error — please try again', 'er');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-hdr">
        <div className="stl" style={{ marginBottom: 0 }}>
          <div className="d" />Bookings
        </div>
        {canCreate && (
          <button className="btn btn-or btn-sm" onClick={handleAdd}>+ Add Booking</button>
        )}
      </div>

      <PageFilterBar
        filters={filters}
        config={{ city: true, property: true, platform: true }}
        cities={cityOptions}
        properties={propOptions}
        platforms={platformOptions}
      />

      {/* ── 4 KPI cards — verbatim from bookKpis HTML ────────────────────── */}
      <MetricCardGrid>
        <MetricCard label="Period Revenue" value={fI(totalRev)}       sub="Total booking revenue" iconText="₹" iconVariant="g" />
        <MetricCard label="Nights"         value={String(totalNights)} sub="Total booked nights"  iconText="🌙" iconVariant="o" />
        <MetricCard label="Guests"         value={String(uniqueGuests)} sub="Unique guests"       iconText="👤" iconVariant="b" />
        <MetricCard label="Avg/Night"      value={fI(avgPerNight)}     sub="Average per night"   iconText="₹" iconVariant="b" />
      </MetricCardGrid>

      {/* ── Table card ───────────────────────────────────────────────────── */}
      <div className="tw">
        <div className="th">
          <div className="ct" id="bookTitle">Booking Log</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--t3)' }}>
            No bookings for this period. Change the View By filter or add a booking.
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              {/* Table columns — verbatim from HTML thead */}
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Property</th>
                    <th>Guest</th>
                    <th>Nights</th>
                    <th>Source</th>
                    <th>Amount</th>
                    {(canEdit || canDelete) && <th />}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((b) => {
                    const isEvent = b.bookingType === 'event';
                    return (
                      <tr key={b.id}>
                        <td>
                          {b.checkIn}
                          {b.checkOut && b.checkOut !== b.checkIn ? ` → ${b.checkOut}` : ''}
                        </td>
                        <td>{b.propertyName}</td>
                        <td>
                          {isEvent && (
                            <span className="pill o" style={{ fontSize: '9px', marginRight: '4px' }}>Event</span>
                          )}
                          {b.guestName}
                        </td>
                        <td>{b.nights || 0}</td>
                        <td><span className="pill b">{b.platform}</span></td>
                        <td style={{ fontWeight: 700, color: 'var(--gr)' }}>
                          {fIN(b.revenue || 0)}
                        </td>
                        {(canEdit || canDelete) && (
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {canEdit && (
                              <button className="btn btn-g btn-sm" onClick={() => handleEdit(b)}>✏️</button>
                            )}
                            {canDelete && (
                              <button className="btn btn-rd btn-sm" onClick={() => handleDelete(b)} style={{ marginLeft: '4px' }}>🗑</button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination or overflow notice */}
            {overflow && totalPages > 1 ? (
              <Pagination total={filtered.length} page={safePage} pageSize={PAGE_SIZE} onChange={(p) => setPage(p)} />
            ) : overflow ? (
              <div style={{ padding: '10px 16px', fontSize: '11.5px', color: 'var(--t3)', textAlign: 'center', borderTop: '1px solid var(--bdr)' }}>
                Showing {PAGE_SIZE} of {filtered.length} bookings. Use filters to narrow results.
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* ── Add/Edit modal ─────────────────────────────────────────────────── */}
      <BookingModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editId={editId}
        initialValues={editValues}
        properties={properties}
        guestNames={guestNames}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </>
  );
}