// src/app/(dashboard)/bookings/page.tsx
// Bookings page — Server Component shell.
// Admin + SuperAdmin access (enforced by proxy.ts + permissions.ts).

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { BookingsClient } from './BookingsClient';
import type { SerializableBooking, BookingProperty } from './BookingsClient';

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
      id:           true,
      property_id:  true,
      guest_id:     true,
      check_in:     true,
      check_out:    true,
      nights:       true,
      revenue:      true,
      room_amount:  true,
      platform:     true,
      status:       true,
      notes:        true,
      booking_type: true,
      property:     { select: { name: true } },
      guest:        { select: { name: true } },
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
    roomAmount:   b.room_amount ? Number(b.room_amount) : Number(b.revenue),
    platform:     b.platform ?? 'Direct',
    status:       b.status,
    notes:        b.notes,
    bookingType:  (b.booking_type ?? 'stay') as 'stay' | 'event',
  }));

  // ── Fetch properties — only id, name, city needed for filter + modal ────────
  const rawProps = await prisma.property.findMany({
    select: { id: true, name: true, city: true },
    orderBy: { name: 'asc' },
  });
  const properties: BookingProperty[] = rawProps.map((p) => ({
    id:   p.id,
    name: p.name,
    city: p.city ?? '',
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