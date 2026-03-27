// src/app/api/bookings/route.ts
// =============================================================================
// MehmanGhar Financial OS — Bookings API Route
//
// Full CRUD for the Booking model.
//
// GET    — list bookings with optional filters and pagination.
//          Filters: ?property_id=, ?status=, ?platform=, ?from=, ?to=
//          Pagination: ?page= (default 1), ?limit= (default 50)
// POST   — create booking. SuperAdmin + Admin.
//          Accepts camelCase payload from BookingModal (propertyId, checkIn,
//          checkOut, guestName, guestPhone, guestEmail, roomRevenue,
//          bookingType, eventType, eventGuests, foodCost).
//          If guestName is provided, the guest is upserted inline by name
//          (phone + email updated if supplied). This matches the HTML behaviour.
// PUT    — update booking. SuperAdmin + Admin.
// DELETE — SuperAdmin only.
//
// Decimal fields (revenue, room_amount) serialized via .toNumber().
// No financial calculations of any kind in this file.
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

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

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

interface BookingListResponse {
  data: BookingRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

interface BookingSingleResponse {
  data: BookingRow;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

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
  return NextResponse.json(
    { error: "An unexpected error occurred." },
    { status: 500 }
  );
}

// ---------------------------------------------------------------------------
// GET — list bookings
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<BookingListResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "bookings", "read");
  } catch (err) {
    return handleError(err);
  }

  const { searchParams } = new URL(request.url);

  // Filters
  const propertyId = searchParams.get("property_id");
  const status = searchParams.get("status");
  const platform = searchParams.get("platform");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Pagination
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50)
  );

  const where: Prisma.BookingWhereInput = {};
  if (propertyId) where.property_id = propertyId;
  if (status) where.status = status;
  if (platform) where.platform = platform;
  if (from || to) {
    where.check_in = {};
    if (from) where.check_in.gte = new Date(from);
    if (to) where.check_in.lte = new Date(to);
  }

  try {
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        orderBy: { check_in: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);

    return NextResponse.json({
      data: bookings.map(serializeBooking),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// POST — create booking (SuperAdmin + Admin)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<BookingSingleResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "bookings", "create");
  } catch (err) {
    return handleError(err);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Normalise camelCase keys sent by BookingModal → snake_case used below
  if (body.propertyId !== undefined && body.property_id === undefined)
    body.property_id = body.propertyId;
  if (body.checkIn !== undefined && body.check_in === undefined)
    body.check_in = body.checkIn;
  if (body.checkOut !== undefined && body.check_out === undefined)
    body.check_out = body.checkOut;
  if (body.guestName !== undefined && body.guest_name === undefined)
    body.guest_name = body.guestName;
  if (body.guestPhone !== undefined && body.guest_phone === undefined)
    body.guest_phone = body.guestPhone;
  if (body.guestEmail !== undefined && body.guest_email === undefined)
    body.guest_email = body.guestEmail;
  if (body.roomRevenue !== undefined && body.room_amount === undefined)
    body.room_amount = body.roomRevenue;
  if (body.bookingType !== undefined && body.booking_type === undefined)
    body.booking_type = body.bookingType;
  if (body.eventType !== undefined && body.event_type === undefined)
    body.event_type = body.eventType;
  if (body.eventGuests !== undefined && body.event_guests === undefined)
    body.event_guests = body.eventGuests;
  if (body.foodCost !== undefined && body.food_cost === undefined)
    body.food_cost = body.foodCost;

  // Required fields
  if (typeof body.property_id !== "string" || body.property_id.trim() === "") {
    return NextResponse.json(
      { error: "Field \"property_id\" is required." },
      { status: 422 }
    );
  }
  if (typeof body.check_in !== "string" || body.check_in.trim() === "") {
    return NextResponse.json(
      { error: "Field \"check_in\" is required (YYYY-MM-DD)." },
      { status: 422 }
    );
  }
  if (typeof body.check_out !== "string" || body.check_out.trim() === "") {
    return NextResponse.json(
      { error: "Field \"check_out\" is required (YYYY-MM-DD)." },
      { status: 422 }
    );
  }
  if (typeof body.nights !== "number" || body.nights < 1) {
    return NextResponse.json(
      { error: "Field \"nights\" is required and must be a positive integer." },
      { status: 422 }
    );
  }
  if (typeof body.revenue !== "number") {
    return NextResponse.json(
      { error: "Field \"revenue\" is required and must be a number." },
      { status: 422 }
    );
  }

  // Guest handling: find by name or create inline (matches HTML behaviour).
  // upsert is not used — Guest.name has no unique constraint.
  // findFirst + create runs in a transaction to avoid race-condition duplicates.
  let resolvedGuestId: string | null = null;
  const guestName =
    typeof body.guest_name === "string" ? body.guest_name.trim() : "";

  if (guestName) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.guest.findFirst({
          where: { name: guestName },
          select: { id: true },
        });
        if (existing) return existing;
        return tx.guest.create({
          data: {
            name: guestName,
            phone:
              typeof body.guest_phone === "string" && body.guest_phone.trim()
                ? body.guest_phone.trim()
                : null,
            email:
              typeof body.guest_email === "string" && body.guest_email.trim()
                ? body.guest_email.trim()
                : null,
          },
          select: { id: true },
        });
      });
      resolvedGuestId = result.id;
    } catch (err) {
      return handleError(err);
    }
  }

  try {
    const booking = await prisma.booking.create({
      data: {
        property_id: body.property_id.trim(),
        guest_id: resolvedGuestId,
        check_in: new Date(body.check_in),
        check_out: new Date(body.check_out),
        nights: Math.floor(body.nights),
        revenue: body.revenue,
        room_amount:
          typeof body.room_amount === "number" ? body.room_amount : null,
        booking_type:
          typeof body.booking_type === "string"
            ? body.booking_type.trim() || null
            : null,
        event_type:
          typeof body.event_type === "string"
            ? body.event_type.trim() || null
            : null,
        event_guests:
          typeof body.event_guests === "number"
            ? Math.floor(body.event_guests)
            : null,
        food_cost:
          typeof body.food_cost === "number" ? body.food_cost : null,
        services:
          typeof body.services === "string"
            ? body.services.trim() || null
            : null,
        rating:
          typeof body.rating === "number"
            ? Math.min(5, Math.max(1, Math.floor(body.rating)))
            : null,
        platform:
          typeof body.platform === "string"
            ? body.platform.trim() || null
            : null,
        status:
          typeof body.status === "string" && body.status.trim()
            ? body.status.trim()
            : "confirmed",
        notes:
          typeof body.notes === "string" ? body.notes.trim() || null : null,
      },
    });

    // Regenerate reports from updated ops data (mirrors saveOps() → regenReportsFromOps())
    await regenReports();

    return NextResponse.json({ data: serializeBooking(booking) }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// PUT — update booking (SuperAdmin + Admin)
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest
): Promise<NextResponse<BookingSingleResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "bookings", "update");
  } catch (err) {
    return handleError(err);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Normalise camelCase keys from BookingModal → snake_case
  if (body.checkIn !== undefined && body.check_in === undefined)
    body.check_in = body.checkIn;
  if (body.checkOut !== undefined && body.check_out === undefined)
    body.check_out = body.checkOut;
  if (body.roomRevenue !== undefined && body.room_amount === undefined)
    body.room_amount = body.roomRevenue;
  if (body.bookingType !== undefined && body.booking_type === undefined)
    body.booking_type = body.bookingType;
  if (body.eventType !== undefined && body.event_type === undefined)
    body.event_type = body.eventType;
  if (body.eventGuests !== undefined && body.event_guests === undefined)
    body.event_guests = body.eventGuests;
  if (body.foodCost !== undefined && body.food_cost === undefined)
    body.food_cost = body.foodCost;

  const id = body.id;
  if (typeof id !== "string" || id.trim() === "") {
    return NextResponse.json(
      { error: "Field \"id\" is required in the request body." },
      { status: 422 }
    );
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
      typeof body.event_guests === "number"
        ? Math.floor(body.event_guests)
        : null;
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
      where: { id: id.trim() },
      data: updateData,
    });

    await regenReports();

    return NextResponse.json({ data: serializeBooking(booking) });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE — SuperAdmin only
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest
): Promise<NextResponse<{ success: true } | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
  } catch (err) {
    return handleError(err);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = body.id;
  if (typeof id !== "string" || id.trim() === "") {
    return NextResponse.json(
      { error: "Field \"id\" is required in the request body." },
      { status: 422 }
    );
  }

  try {
    await prisma.booking.delete({ where: { id: id.trim() } });
    await regenReports();
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}