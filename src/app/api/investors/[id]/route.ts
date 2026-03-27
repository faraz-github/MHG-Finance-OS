// src/app/api/investors/[id]/route.ts
// =============================================================================
// MehmanGhar Financial OS — Investors dynamic segment route
//
// PATCH  — update investor. SuperAdmin only.
// DELETE — block if unpaid payouts exist (409). SuperAdmin only.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireRole,
  PermissionError,
  RoleRequiredError,
} from "@/lib/permissions";
import { Prisma } from "@/generated/prisma/client/client";

interface InvestorRow {
  id: string;
  property_id: string;
  name: string;
  contact: string | null;
  email: string | null;
  capital: number;
  share_pct: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ErrorResponse {
  error: string;
}

function serializeInvestor(
  inv: Awaited<ReturnType<typeof prisma.investor.findUniqueOrThrow>>
): InvestorRow {
  return {
    id: inv.id,
    property_id: inv.property_id,
    name: inv.name,
    contact: inv.contact,
    email: inv.email,
    capital: inv.capital.toNumber(),
    share_pct: inv.share_pct.toNumber(),
    notes: inv.notes,
    created_at: inv.created_at.toISOString(),
    updated_at: inv.updated_at.toISOString(),
  };
}

function handleError(err: unknown): NextResponse<ErrorResponse> {
  if (err instanceof PermissionError || err instanceof RoleRequiredError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "An investor with these details already exists." },
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
): Promise<NextResponse<{ data: InvestorRow } | ErrorResponse>> {
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

  const updateData: Prisma.InvestorUpdateInput = {};
  if (typeof body.name === "string") updateData.name = body.name.trim();
  if (body.contact !== undefined)
    updateData.contact =
      typeof body.contact === "string" ? body.contact.trim() || null : null;
  if (body.email !== undefined)
    updateData.email =
      typeof body.email === "string" ? body.email.trim() || null : null;
  if (typeof body.capital === "number") updateData.capital = body.capital;
  if (typeof body.share_pct === "number" || typeof body.sharePct === "number")
    updateData.share_pct =
      typeof body.sharePct === "number" ? body.sharePct : (body.share_pct as number);
  if (body.notes !== undefined)
    updateData.notes =
      typeof body.notes === "string" ? body.notes.trim() || null : null;
  if (typeof body.propertyId === "string")
    updateData.property = { connect: { id: body.propertyId } };

  try {
    const investor = await prisma.investor.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json({ data: serializeInvestor(investor) });
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
    const unpaidCount = await prisma.payout.count({
      where: { investor_id: id, amount_paid: null },
    });

    if (unpaidCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete this investor. They have ${unpaidCount} unpaid payout record(s). Mark all payouts as paid or remove them first.`,
        },
        { status: 409 }
      );
    }

    await prisma.investor.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}