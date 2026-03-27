// src/app/api/guests/route.ts
// =============================================================================
// MehmanGhar Financial OS — Guests API Route
//
// Full CRUD for the Guest model.
//
// GET    — list guests with optional ?search= (name, email, phone).
//          Paginated. Includes _count.bookings per guest.
// POST   — create guest. SuperAdmin + Admin (crm create).
// PUT    — update guest. SuperAdmin + Admin.
// DELETE — block if guest has any bookings (409). SuperAdmin only.
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

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface GuestRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  city: string | null;
  notes: string | null;
  booking_count: number;
  created_at: string;
  updated_at: string;
}

interface GuestListResponse {
  data: GuestRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

interface GuestSingleResponse {
  data: GuestRow;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

type PrismaGuestWithCount = Awaited<
  ReturnType<typeof prisma.guest.findUniqueOrThrow>
> & { _count: { bookings: number } };

function serializeGuest(g: PrismaGuestWithCount): GuestRow {
  return {
    id: g.id,
    name: g.name,
    email: g.email,
    phone: g.phone,
    nationality: g.nationality,
    city: g.city,
    notes: g.notes,
    booking_count: g._count.bookings,
    created_at: g.created_at.toISOString(),
    updated_at: g.updated_at.toISOString(),
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
      return NextResponse.json({ error: "Guest not found." }, { status: 404 });
    }
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A guest with these details already exists." },
        { status: 409 }
      );
    }
  }
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

// ---------------------------------------------------------------------------
// GET — list guests
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<GuestListResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "crm", "read");
  } catch (err) {
    return handleError(err);
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50)
  );

  const where: Prisma.GuestWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  try {
    const [guests, total] = await Promise.all([
      prisma.guest.findMany({
        where,
        include: { _count: { select: { bookings: true } } },
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.guest.count({ where }),
    ]);

    return NextResponse.json({
      data: guests.map(serializeGuest),
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
// POST — create guest
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<GuestSingleResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "crm", "create");
  } catch (err) {
    return handleError(err);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json(
      { error: "Field \"name\" is required and must be a non-empty string." },
      { status: 422 }
    );
  }

  try {
    const guest = await prisma.guest.create({
      data: {
        name: body.name.trim(),
        email:
          typeof body.email === "string" ? body.email.trim() || null : null,
        phone:
          typeof body.phone === "string" ? body.phone.trim() || null : null,
        nationality:
          typeof body.nationality === "string"
            ? body.nationality.trim() || null
            : null,
        city:
          typeof body.city === "string" ? body.city.trim() || null : null,
        notes:
          typeof body.notes === "string" ? body.notes.trim() || null : null,
      },
      include: { _count: { select: { bookings: true } } },
    });

    return NextResponse.json(
      { data: serializeGuest(guest as PrismaGuestWithCount) },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// PUT — update guest
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest
): Promise<NextResponse<GuestSingleResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "crm", "update");
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

  const updateData: Prisma.GuestUpdateInput = {};
  if (typeof body.name === "string") updateData.name = body.name.trim();
  if (body.email !== undefined)
    updateData.email =
      typeof body.email === "string" ? body.email.trim() || null : null;
  if (body.phone !== undefined)
    updateData.phone =
      typeof body.phone === "string" ? body.phone.trim() || null : null;
  if (body.nationality !== undefined)
    updateData.nationality =
      typeof body.nationality === "string"
        ? body.nationality.trim() || null
        : null;
  if (body.city !== undefined)
    updateData.city =
      typeof body.city === "string" ? body.city.trim() || null : null;
  if (body.notes !== undefined)
    updateData.notes =
      typeof body.notes === "string" ? body.notes.trim() || null : null;

  try {
    const guest = await prisma.guest.update({
      where: { id: id.trim() },
      data: updateData,
      include: { _count: { select: { bookings: true } } },
    });

    return NextResponse.json({ data: serializeGuest(guest as PrismaGuestWithCount) });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE — block if guest has any bookings
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

  const guestId = id.trim();

  try {
    const bookingCount = await prisma.booking.count({
      where: { guest_id: guestId },
    });

    if (bookingCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete this guest. They have ${bookingCount} booking(s) on record. Remove or reassign the bookings first.`,
        },
        { status: 409 }
      );
    }

    await prisma.guest.delete({ where: { id: guestId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}