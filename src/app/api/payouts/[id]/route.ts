// src/app/api/payouts/[id]/route.ts
// =============================================================================
// MehmanGhar Financial OS — Payouts dynamic segment route
//
// PayoutsClient calls PATCH /api/payouts/${id} to toggle paid/pending status
// and DELETE /api/payouts/${id} to remove a record.
//
// PATCH  — update payout (mark paid, revert to pending, set reference).
//          SuperAdmin only.
// DELETE — block if amount_paid IS NOT NULL (cannot delete paid payout).
//          SuperAdmin only.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireRole,
  PermissionError,
  RoleRequiredError,
} from "@/lib/permissions";
import { Prisma } from "@/generated/prisma/client/client";

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
  status: "paid" | "pending";
  created_at: string;
  updated_at: string;
}

interface ErrorResponse {
  error: string;
}

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

function handleError(err: unknown): NextResponse<ErrorResponse> {
  if (err instanceof PermissionError || err instanceof RoleRequiredError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Payout not found." }, { status: 404 });
    }
  }
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

// ---------------------------------------------------------------------------
// PATCH — mark paid / revert / update fields
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ data: PayoutRow } | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
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

  const updateData: Prisma.PayoutUpdateInput = {};

  // PayoutsClient sends { status: 'paid', reference, paidOn } or { status: 'pending' }
  if (body.status === "paid") {
    // Mark as paid — set amount_paid to amount_owed if not explicitly provided
    if (typeof body.amount_paid === "number") {
      updateData.amount_paid = body.amount_paid;
    } else {
      // Fetch amount_owed and set amount_paid = amount_owed
      const existing = await prisma.payout.findUnique({
        where: { id },
        select: { amount_owed: true },
      });
      if (existing) {
        updateData.amount_paid = existing.amount_owed;
      }
    }
    // paidOn from client (camelCase)
    const paidOnRaw = body.paidOn ?? body.paid_on;
    updateData.paid_on =
      typeof paidOnRaw === "string" && paidOnRaw.trim()
        ? new Date(paidOnRaw)
        : new Date();
    if (typeof body.reference === "string")
      updateData.reference = body.reference.trim() || null;
  } else if (body.status === "pending") {
    updateData.amount_paid = null;
    updateData.paid_on = null;
    updateData.reference = null;
  } else {
    // Generic field update (no status toggle)
    if (typeof body.amount_owed === "number")
      updateData.amount_owed = body.amount_owed;
    if (body.amount_paid !== undefined)
      updateData.amount_paid =
        typeof body.amount_paid === "number" ? body.amount_paid : null;
    const paidOnRaw = body.paidOn ?? body.paid_on;
    if (paidOnRaw !== undefined)
      updateData.paid_on =
        typeof paidOnRaw === "string" && paidOnRaw.trim()
          ? new Date(paidOnRaw)
          : null;
    if (body.reference !== undefined)
      updateData.reference =
        typeof body.reference === "string" ? body.reference.trim() || null : null;
    if (body.notes !== undefined)
      updateData.notes =
        typeof body.notes === "string" ? body.notes.trim() || null : null;
  }

  try {
    const payout = await prisma.payout.update({
      where: { id },
      data: updateData,
      include: PAYOUT_INCLUDE,
    });
    return NextResponse.json({ data: serializePayout(payout) });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE — block if paid
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
    const existing = await prisma.payout.findUnique({
      where: { id },
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

    await prisma.payout.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}