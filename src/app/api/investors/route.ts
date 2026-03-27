// src/app/api/investors/route.ts
// =============================================================================
// MehmanGhar Financial OS — Investors API Route
//
// Full CRUD for the Investor model.
//
// GET    — list investors. Optional ?property_id= filter.
// POST   — create investor. SuperAdmin only.
// PUT    — update investor by id (in request body). SuperAdmin only.
// DELETE — block if unpaid payouts exist for this investor (409).
//          SuperAdmin only.
//
// Decimal fields (capital, share_pct) are serialized via .toNumber().
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

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

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

interface InvestorListResponse {
  data: InvestorRow[];
}

interface InvestorSingleResponse {
  data: InvestorRow;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Serializer — converts Prisma Investor to InvestorRow (Decimal → number)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

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
  return NextResponse.json(
    { error: "An unexpected error occurred." },
    { status: 500 }
  );
}

// ---------------------------------------------------------------------------
// GET — list investors (optional ?property_id= filter)
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<InvestorListResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "investors", "read");
  } catch (err) {
    return handleError(err);
  }

  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("property_id");

  try {
    const investors = await prisma.investor.findMany({
      where: propertyId ? { property_id: propertyId } : undefined,
      orderBy: [{ property_id: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ data: investors.map(serializeInvestor) });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// POST — create investor (SuperAdmin only)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<InvestorSingleResponse | ErrorResponse>> {
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

  // Normalise camelCase keys sent by InvModal → snake_case expected by Prisma
  if (body.propertyId !== undefined && body.property_id === undefined)
    body.property_id = body.propertyId;
  if (body.sharePct !== undefined && body.share_pct === undefined)
    body.share_pct = body.sharePct;

  // Required fields validation
  if (typeof body.property_id !== "string" || body.property_id.trim() === "") {
    return NextResponse.json(
      { error: "Field \"property_id\" is required." },
      { status: 422 }
    );
  }
  if (typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json(
      { error: "Field \"name\" is required and must be a non-empty string." },
      { status: 422 }
    );
  }
  if (typeof body.capital !== "number") {
    return NextResponse.json(
      { error: "Field \"capital\" is required and must be a number." },
      { status: 422 }
    );
  }
  if (typeof body.share_pct !== "number") {
    return NextResponse.json(
      { error: "Field \"share_pct\" is required and must be a number." },
      { status: 422 }
    );
  }

  try {
    const investor = await prisma.investor.create({
      data: {
        property_id: body.property_id.trim(),
        name: body.name.trim(),
        contact:
          typeof body.contact === "string" ? body.contact.trim() : null,
        email:
          typeof body.email === "string" ? body.email.trim() || null : null,
        capital: body.capital,
        share_pct: body.share_pct,
        notes:
          typeof body.notes === "string" ? body.notes.trim() || null : null,
      },
    });

    return NextResponse.json({ data: serializeInvestor(investor) }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// PUT — update investor by id (SuperAdmin only)
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest
): Promise<NextResponse<InvestorSingleResponse | ErrorResponse>> {
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

  // Normalise camelCase keys from InvModal edit payload
  if (body.sharePct !== undefined && body.share_pct === undefined)
    body.share_pct = body.sharePct;

  const id = body.id;
  if (typeof id !== "string" || id.trim() === "") {
    return NextResponse.json(
      { error: "Field \"id\" is required in the request body." },
      { status: 422 }
    );
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
  if (typeof body.share_pct === "number") updateData.share_pct = body.share_pct;
  if (body.notes !== undefined)
    updateData.notes =
      typeof body.notes === "string" ? body.notes.trim() || null : null;

  try {
    const investor = await prisma.investor.update({
      where: { id: id.trim() },
      data: updateData,
    });

    return NextResponse.json({ data: serializeInvestor(investor) });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE — guarded delete (SuperAdmin only)
// 409 if unpaid payouts exist for this investor
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

  const investorId = id.trim();

  try {
    // Block deletion if unpaid payouts exist
    // A payout is "unpaid" when amount_paid is null
    const unpaidCount = await prisma.payout.count({
      where: {
        investor_id: investorId,
        amount_paid: null,
      },
    });

    if (unpaidCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete this investor. They have ${unpaidCount} unpaid payout record(s). Mark all payouts as paid or remove them first.`,
        },
        { status: 409 }
      );
    }

    await prisma.investor.delete({ where: { id: investorId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}