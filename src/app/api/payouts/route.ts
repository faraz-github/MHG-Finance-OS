// src/app/api/payouts/route.ts
// =============================================================================
// MehmanGhar Financial OS — Payouts API Route
//
// Full CRUD for the Payout model.
//
// GET    — list payouts. Supports ?property_id=, ?investor_id=,
//          ?paid= (true/false). Includes investor name + property name.
// POST   — create payout record. SuperAdmin only.
//          amount_owed required. amount_paid + paid_on optional.
// PUT    — update payout (mark paid / update fields). SuperAdmin only.
// DELETE — SuperAdmin only. Block if amount_paid IS NOT NULL (409).
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

interface PayoutRow {
  id: string;
  property_id: string;
  property_name: string;
  investor_id: string;
  investor_name: string;
  year: number;
  month: number;
  amount_owed: number;
  amount_paid: number | null;
  paid_on: string | null;
  reference: string | null;
  notes: string | null;
  /** Derived: 'paid' when amount_paid IS NOT NULL, else 'pending' */
  status: "paid" | "pending";
  created_at: string;
  updated_at: string;
}

interface PayoutListResponse {
  data: PayoutRow[];
}

interface PayoutSingleResponse {
  data: PayoutRow;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

type PrismaPayoutWithRelations = Prisma.PayoutGetPayload<{
  include: {
    property: { select: { name: true } };
    investor: { select: { name: true } };
  };
}>;

function serializePayout(p: PrismaPayoutWithRelations): PayoutRow {
  return {
    id: p.id,
    property_id: p.property_id,
    property_name: p.property.name,
    investor_id: p.investor_id,
    investor_name: p.investor.name,
    year: p.year,
    month: p.month,
    amount_owed: p.amount_owed.toNumber(),
    amount_paid: p.amount_paid ? p.amount_paid.toNumber() : null,
    paid_on:
      p.paid_on instanceof Date
        ? p.paid_on.toISOString().slice(0, 10)
        : p.paid_on
        ? String(p.paid_on)
        : null,
    reference: p.reference,
    notes: p.notes,
    status: p.amount_paid !== null ? "paid" : "pending",
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  };
}

const PAYOUT_INCLUDE = {
  property: { select: { name: true } },
  investor: { select: { name: true } },
} as const;

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

function handleError(err: unknown): NextResponse<ErrorResponse> {
  if (err instanceof PermissionError || err instanceof RoleRequiredError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Payout not found." }, { status: 404 });
    }
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A duplicate payout record exists." },
        { status: 409 }
      );
    }
  }
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

// ---------------------------------------------------------------------------
// GET — list payouts
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<PayoutListResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "payouts", "read");
  } catch (err) {
    return handleError(err);
  }

  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("property_id");
  const investorId = searchParams.get("investor_id");
  const paidParam = searchParams.get("paid");

  const where: Prisma.PayoutWhereInput = {};
  if (propertyId) where.property_id = propertyId;
  if (investorId) where.investor_id = investorId;
  if (paidParam === "true") {
    where.amount_paid = { not: null };
  } else if (paidParam === "false") {
    where.amount_paid = null;
  }

  try {
    const payouts = await prisma.payout.findMany({
      where,
      include: PAYOUT_INCLUDE,
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    return NextResponse.json({
      data: payouts.map(serializePayout),
    });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// POST — create payout record (SuperAdmin only)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<PayoutSingleResponse | ErrorResponse>> {
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

  // Required fields
  if (typeof body.property_id !== "string" || body.property_id.trim() === "") {
    return NextResponse.json(
      { error: "Field \"property_id\" is required." },
      { status: 422 }
    );
  }
  if (typeof body.investor_id !== "string" || body.investor_id.trim() === "") {
    return NextResponse.json(
      { error: "Field \"investor_id\" is required." },
      { status: 422 }
    );
  }
  if (typeof body.year !== "number") {
    return NextResponse.json(
      { error: "Field \"year\" is required and must be a number." },
      { status: 422 }
    );
  }
  if (typeof body.month !== "number") {
    return NextResponse.json(
      { error: "Field \"month\" is required and must be a number (1–12)." },
      { status: 422 }
    );
  }
  if (typeof body.amount_owed !== "number") {
    return NextResponse.json(
      { error: "Field \"amount_owed\" is required and must be a number." },
      { status: 422 }
    );
  }

  try {
    const payout = await prisma.payout.create({
      data: {
        property_id: body.property_id.trim(),
        investor_id: body.investor_id.trim(),
        year: Math.floor(body.year),
        month: Math.floor(body.month),
        amount_owed: body.amount_owed,
        amount_paid:
          typeof body.amount_paid === "number" ? body.amount_paid : null,
        paid_on:
          typeof body.paid_on === "string" && body.paid_on.trim()
            ? new Date(body.paid_on)
            : null,
        reference:
          typeof body.reference === "string"
            ? body.reference.trim() || null
            : null,
        notes:
          typeof body.notes === "string" ? body.notes.trim() || null : null,
      },
      include: PAYOUT_INCLUDE,
    });

    return NextResponse.json(
      { data: serializePayout(payout) },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// PUT — update payout (SuperAdmin only)
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest
): Promise<NextResponse<PayoutSingleResponse | ErrorResponse>> {
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

  const updateData: Prisma.PayoutUpdateInput = {};
  if (typeof body.amount_owed === "number")
    updateData.amount_owed = body.amount_owed;
  if (body.amount_paid !== undefined)
    updateData.amount_paid =
      typeof body.amount_paid === "number" ? body.amount_paid : null;
  if (body.paid_on !== undefined)
    updateData.paid_on =
      typeof body.paid_on === "string" && body.paid_on.trim()
        ? new Date(body.paid_on)
        : null;
  // paidOn camelCase alias (PayoutsClient sends paidOn)
  if (body.paidOn !== undefined && body.paid_on === undefined)
    updateData.paid_on =
      typeof body.paidOn === "string" && body.paidOn.trim()
        ? new Date(body.paidOn)
        : null;
  if (body.reference !== undefined)
    updateData.reference =
      typeof body.reference === "string" ? body.reference.trim() || null : null;
  if (body.notes !== undefined)
    updateData.notes =
      typeof body.notes === "string" ? body.notes.trim() || null : null;

  // PayoutsClient sends { status: 'paid' } to mark as paid,
  // { status: 'pending' } to revert. Map to the DB fields.
  if (body.status === "paid" && body.amount_paid === undefined) {
    // Mark as paid with current date if no amount_paid provided
    updateData.amount_paid = updateData.amount_paid ?? 0;
  }
  if (body.status === "pending") {
    updateData.amount_paid = null;
    updateData.paid_on = null;
  }

  try {
    const payout = await prisma.payout.update({
      where: { id: id.trim() },
      data: updateData,
      include: PAYOUT_INCLUDE,
    });

    return NextResponse.json({ data: serializePayout(payout) });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE — block if payout is already paid
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
    const existing = await prisma.payout.findUnique({
      where: { id: id.trim() },
      select: { id: true, amount_paid: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Payout not found." }, { status: 404 });
    }

    if (existing.amount_paid !== null) {
      return NextResponse.json(
        {
          error:
            "Cannot delete a paid payout. Revert it to pending first if this is a correction.",
        },
        { status: 409 }
      );
    }

    await prisma.payout.delete({ where: { id: id.trim() } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}