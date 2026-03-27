// src/app/(dashboard)/crm/page.tsx
//
// Guest CRM page — Server Component shell.
// Read-only in v1: guests are created automatically when bookings are saved.
//
// HTML source: <div class="page" id="page-crm"> + rndCRM() + showGuestProfile()
//
// ─── SCHEMA GAPS ─────────────────────────────────────────────────────────
// The Guest model is minimal — it does not store denormalised stats.
// All metrics (totalStays, totalNights, totalSpend, lastVisit, avgRating)
// are COMPUTED here from Booking rows. This is correct for v1 since:
//   - The HTML computed them at render time from the Bookings array
//   - The Guest model deliberately stays lightweight (no stale counters)
//
// Specific schema gaps (noted for migration plan):
//   1. Guest.city — not in schema. `nationality` is used as closest.
//   2. Booking.rating — not in schema. avgRating computation returns null.
//   3. Booking.booking_type — not in schema. Defaults to 'stay'.
//
// The city field (Guest.city vs nationality) will be fixed in the migration
// to add `city String?` to the Guest model.
// ─────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { CrmClient } from './CrmClient';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface SerializableGuest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null; // used as city until schema adds city field
  notes: string | null;
  // Computed from bookings
  allTimeStays: number;
  allTimeNights: number;
  allTimeSpend: number;
  lastVisit: string | null;   // YYYY-MM-DD
  avgRating: number | null;   // null until Booking.rating is in schema
}

export interface SerializableGuestBooking {
  id: string;
  guestId: string | null;
  propertyName: string;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  nights: number;
  revenue: number;
  platform: string;
  rating: number | null;  // Guest rating 1–5 from booking
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CrmPage() {
  // ── Session + permissions ─────────────────────────────────────────────────
  const cookieName  = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token       = cookieStore.get(cookieName)?.value ?? '';
  const session     = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  const rolePerms = await getRolePermissions(session.role);
  const tabPerms  = rolePerms?.tabPermissions ?? {};
  if (tabPerms['crm'] !== true) redirect('/dashboard');

  // ── Fetch all bookings (used for period filtering + detail panel) ──────────
  const rawBookings = await prisma.booking.findMany({
    select: {
      id:          true,
      guest_id:    true,
      property_id: true,
      check_in:    true,
      check_out:   true,
      nights:      true,
      revenue:     true,
      platform:    true,
      rating:      true,
      property: { select: { name: true } },
    },
    orderBy: { check_in: 'desc' },
  });

  const bookings: SerializableGuestBooking[] = rawBookings.map((b) => ({
    id:           b.id,
    guestId:      b.guest_id,
    propertyName: b.property.name,
    checkIn:      b.check_in.toISOString().split('T')[0],
    checkOut:     b.check_out.toISOString().split('T')[0],
    nights:       b.nights,
    revenue:      Number(b.revenue),
    platform:     b.platform ?? 'Direct',
    rating:       b.rating ?? null,
  }));

  // ── Compute per-guest all-time stats from bookings ────────────────────────
  const guestStatsMap: Record<string, {
    stays: number; nights: number; spend: number; lastVisit: string | null; ratings: number[];
  }> = {};

  rawBookings.forEach((b) => {
    if (!b.guest_id) return;
    if (!guestStatsMap[b.guest_id]) {
      guestStatsMap[b.guest_id] = { stays: 0, nights: 0, spend: 0, lastVisit: null, ratings: [] };
    }
    const stats = guestStatsMap[b.guest_id];
    stats.stays++;
    stats.nights += b.nights;
    stats.spend  += Number(b.revenue);
    const checkOut = b.check_out.toISOString().split('T')[0];
    if (!stats.lastVisit || checkOut > stats.lastVisit) stats.lastVisit = checkOut;
    if (b.rating && b.rating > 0) stats.ratings.push(b.rating);
  });

  // ── Fetch guests ──────────────────────────────────────────────────────────
  const rawGuests = await prisma.guest.findMany({
    select: {
      id:          true,
      name:        true,
      email:       true,
      phone:       true,
      nationality: true,
      notes:       true,
    },
    orderBy: { name: 'asc' },
  });

  const guests: SerializableGuest[] = rawGuests.map((g) => {
    const stats = guestStatsMap[g.id];
    const ratings = stats?.ratings ?? [];
    const avgRating = ratings.length > 0
      ? +(ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1)
      : null;
    return {
      id:          g.id,
      name:        g.name,
      email:       g.email,
      phone:       g.phone,
      nationality: g.nationality,
      notes:       g.notes,
      allTimeStays:  stats?.stays   ?? 0,
      allTimeNights: stats?.nights  ?? 0,
      allTimeSpend:  stats?.spend   ?? 0,
      lastVisit:     stats?.lastVisit ?? null,
      avgRating,
    };
  });

  return <CrmClient guests={guests} bookings={bookings} />;
}