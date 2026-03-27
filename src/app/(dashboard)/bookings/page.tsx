// src/app/(dashboard)/bookings/page.tsx
//
// Bookings page — Server Component shell.
// Admin + SuperAdmin access (enforced by proxy.ts + permissions.ts).
//
// HTML source: <div class="page" id="page-bookings"> + rndBookings()
//              + saveBooking() + editBooking() + delBooking()
//
// ─── ARCHITECTURAL NOTE: Period filter ───────────────────────────────────
// Same decision as Daily Expenses (Run 13): client-side filtering via
// matchesPeriod() on check_in date using Zustand period state.
// URL-sync is deferred to v2. See dailyexp/page.tsx for full rationale.
//
// ─── SCHEMA GAPS (document for evaluation migration plan) ────────────────
// The Booking model is missing fields the HTML stores:
//
//   room_amount   Decimal   — room-only revenue (vs total with services/food)
//   booking_type  String    — 'stay' | 'event'; default 'stay'
//   event_type    String?   — 'Birthday', 'Party', etc.
//   event_guests  Int?
//   food_cost     Decimal?
//   services      Json      — [{name, amount}] add-on services
//   rating        Int?      — 1-5 guest rating
//
// Until migrated:
//   - booking_type defaults to 'stay' in serialisation
//   - room_amount equals revenue (no breakdown)
//   - services/food_cost/rating round-tripped through notes field until
//     migration adds dedicated columns
// ─────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { BookingsClient } from './BookingsClient';
import type { SerializableBooking } from './BookingsClient';
import type { SerializableProperty } from '../properties/page';

export default async function BookingsPage() {
  // ── Session + permissions ─────────────────────────────────────────────────
  const cookieName = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value ?? '';
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  const rolePerms = await getRolePermissions(session.role);
  const tabPerms  = rolePerms?.tabPermissions  ?? {};
  const crudPerms = rolePerms?.crudPermissions ?? {};
  if (tabPerms['bookings'] !== true) redirect('/dashboard');

  const canCreate = crudPerms['bookings']?.create === true;
  const canEdit   = crudPerms['bookings']?.update === true;
  const canDelete = crudPerms['bookings']?.delete === true;

  // ── Fetch bookings joined with property + guest ───────────────────────────
  const rawBookings = await prisma.booking.findMany({
    select: {
      id:          true,
      property_id: true,
      guest_id:    true,
      check_in:    true,
      check_out:   true,
      nights:      true,
      revenue:     true,
      platform:    true,
      status:      true,
      notes:       true,
      property:    { select: { name: true } },
      guest:       { select: { name: true } },
    },
    orderBy: { check_in: 'desc' },
  });

  const bookings: SerializableBooking[] = rawBookings.map((b) => ({
    id:           b.id,
    pid:          b.property_id,
    propertyName: b.property.name,
    guestId:      b.guest_id,
    guestName:    b.guest?.name ?? 'Unknown',
    checkIn:      b.check_in.toISOString().split('T')[0],
    checkOut:     b.check_out.toISOString().split('T')[0],
    nights:       b.nights,
    revenue:      Number(b.revenue),
    platform:     b.platform ?? 'Direct',
    status:       b.status,
    notes:        b.notes,
    // booking_type not yet in schema — defaults to 'stay'
    bookingType:  (b as Record<string, unknown>).booking_type as string ?? 'stay',
  }));

  // ── Fetch properties ──────────────────────────────────────────────────────
  const rawProps = await prisma.property.findMany({
    select: { id: true, name: true, address: true, city: true, state: true, comm: true, capital: true, type: true, rooms: true, assets: true },
    orderBy: { name: 'asc' },
  });

  const properties: SerializableProperty[] = rawProps.map((p) => ({
    id:      p.id,
    name:    p.name,
    city:    p.city ?? '',
    state:   p.state ?? '',
    comm:    Number(p.comm) || 25,
    capital: Number(p.capital) || 0,
    address: p.address,
    type:    p.type ?? '',
    rooms:   Number(p.rooms) || 0,
    assets:  (p.assets as SerializableProperty['assets']) ?? [],
  }));

  // ── Fetch guest names for autocomplete datalist ───────────────────────────
  const rawGuests = await prisma.guest.findMany({
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  const guestNames = rawGuests.map((g) => g.name);

  return (
    <BookingsClient
      bookings={bookings}
      properties={properties}
      guestNames={guestNames}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  );
}