// src/app/api/bookings/[id]/route.ts
// =============================================================================
// MehmanGhar Financial OS — Bookings dynamic segment route
//
// PATCH  — update booking. SuperAdmin + Admin.
// DELETE — SuperAdmin only.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertPermission,
  requireRole,
  PermissionError,
  RoleRequiredError,
} from "@/lib/permissions";
import { Prisma } from "@/generated/prisma/client/client";
import { regenReports } from "@/lib/regenReports";

interface BookingRow {
  id: string;
  property_id: string;
  guest_id: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  revenue: number;
  room_amount: number | null;
  booking_type: string | null;
  event_type: string | null;
  event_guests: number | null;
  food_cost: number | null;
  services: string | null;
  rating: number | null;
  platform: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ErrorResponse {
  error: string;
}

type PrismaBooking = Awaited<ReturnType<typeof prisma.booking.findUniqueOrThrow>>;

function serializeBooking(b: PrismaBooking): BookingRow {
  return {
    id: b.id,
    property_id: b.property_id,
    guest_id: b.guest_id,
    check_in: b.check_in instanceof Date
      ? b.check_in.toISOString().slice(0, 10)
      : String(b.check_in),
    check_out: b.check_out instanceof Date
      ? b.check_out.toISOString().slice(0, 10)
      : String(b.check_out),
    nights: b.nights,
    revenue: b.revenue.toNumber(),
    room_amount: b.room_amount ? b.room_amount.toNumber() : null,
    booking_type: b.booking_type,
    event_type: b.event_type,
    event_guests: b.event_guests,
    food_cost: b.food_cost ? b.food_cost.toNumber() : null,
    services: b.services,
    rating: b.rating,
    platform: b.platform,
    status: b.status,
    notes: b.notes,
    created_at: b.created_at.toISOString(),
    updated_at: b.updated_at.toISOString(),
  };
}

function handleError(err: unknown): NextResponse<ErrorResponse> {
  if (err instanceof PermissionError || err instanceof RoleRequiredError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A booking with these details already exists." },
        { status: 409 }
      );
    }
  }
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ data: BookingRow } | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "bookings", "update");
  } catch (err) {
    return handleError(err);
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const updateData: Prisma.BookingUpdateInput = {};
  if (typeof body.check_in === "string")
    updateData.check_in = new Date(body.check_in);
  if (typeof body.check_out === "string")
    updateData.check_out = new Date(body.check_out);
  if (typeof body.nights === "number")
    updateData.nights = Math.floor(body.nights);
  if (typeof body.revenue === "number") updateData.revenue = body.revenue;
  if (body.room_amount !== undefined)
    updateData.room_amount =
      typeof body.room_amount === "number" ? body.room_amount : null;
  if (body.guest_id !== undefined)
    updateData.guest =
      typeof body.guest_id === "string" && body.guest_id.trim()
        ? { connect: { id: body.guest_id.trim() } }
        : { disconnect: true };
  if (body.booking_type !== undefined)
    updateData.booking_type =
      typeof body.booking_type === "string"
        ? body.booking_type.trim() || null
        : null;
  if (body.event_type !== undefined)
    updateData.event_type =
      typeof body.event_type === "string" ? body.event_type.trim() || null : null;
  if (body.event_guests !== undefined)
    updateData.event_guests =
      typeof body.event_guests === "number" ? Math.floor(body.event_guests) : null;
  if (body.food_cost !== undefined)
    updateData.food_cost =
      typeof body.food_cost === "number" ? body.food_cost : null;
  if (body.services !== undefined)
    updateData.services =
      typeof body.services === "string" ? body.services.trim() || null : null;
  if (body.rating !== undefined)
    updateData.rating =
      typeof body.rating === "number"
        ? Math.min(5, Math.max(1, Math.floor(body.rating)))
        : null;
  if (body.platform !== undefined)
    updateData.platform =
      typeof body.platform === "string" ? body.platform.trim() || null : null;
  if (typeof body.status === "string") updateData.status = body.status.trim();
  if (body.notes !== undefined)
    updateData.notes =
      typeof body.notes === "string" ? body.notes.trim() || null : null;

  try {
    const booking = await prisma.booking.update({
      where: { id },
      data: updateData,
    });
    await regenReports();
    return NextResponse.json({ data: serializeBooking(booking) });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: true } | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
  } catch (err) {
    return handleError(err);
  }

  const { id } = await params;

  try {
    await prisma.booking.delete({ where: { id } });
    await regenReports();
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}