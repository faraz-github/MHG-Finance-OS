// src/app/api/guests/[id]/route.ts
// =============================================================================
// MehmanGhar Financial OS — Guests dynamic segment route
//
// PATCH  — update guest. SuperAdmin + Admin.
// DELETE — block if guest has bookings (409). SuperAdmin only.
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

interface ErrorResponse {
  error: string;
}

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ data: GuestRow } | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "crm", "update");
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
      where: { id },
      data: updateData,
      include: { _count: { select: { bookings: true } } },
    });
    return NextResponse.json({ data: serializeGuest(guest as PrismaGuestWithCount) });
  } catch (err) {
    return handleError(err);
  }
}

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
    const bookingCount = await prisma.booking.count({
      where: { guest_id: id },
    });

    if (bookingCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete this guest. They have ${bookingCount} booking(s) on record. Remove or reassign the bookings first.`,
        },
        { status: 409 }
      );
    }

    await prisma.guest.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}