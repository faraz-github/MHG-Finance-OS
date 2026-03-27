// src/app/api/monthly-entry/route.ts
// =============================================================================
// MehmanGhar Financial OS — Monthly Data Entry API Route
//
// POST — Bulk-create bookings (one per channel) and daily expenses (one per
//        category row) for a given property + month + year.
//        Wraps both in a Prisma $transaction so the operation is atomic.
//
// Called by MonthlyEntryClient.tsx (Monthly Entry page).
//
// Permission: assertPermission(role, 'monthlyentry', 'create')
//             (Monthly entry creates bookings + expenses. It has its own
//              'monthlyentry' permission key per the sidebar navigation audit,
//              fixing the triple permission mismatch with 'reports'/'bookings'.)
//
// No financial calculations — does not call finance.ts.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertPermission,
  PermissionError,
  RoleRequiredError,
} from "@/lib/permissions";
import { Prisma } from "@/generated/prisma/client/client";
import { regenReports } from "@/lib/regenReports";

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

interface ChannelEntry {
  name: string;
  nights: number;
  revenue: number;
}

interface ExpCatEntry {
  category: string;
  amount: number;
}

interface MonthlyEntryBody {
  propertyId: string;
  month: number;
  year: number;
  channels: ChannelEntry[];
  expCats: ExpCatEntry[];
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface SuccessResponse {
  bookings_created: number;
  expenses_created: number;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateBody(
  body: Record<string, unknown>
): { valid: true; data: MonthlyEntryBody } | { valid: false; error: string } {
  if (typeof body.propertyId !== "string" || body.propertyId.trim() === "") {
    return { valid: false, error: 'Field "propertyId" is required.' };
  }
  if (typeof body.month !== "number" || body.month < 1 || body.month > 12) {
    return { valid: false, error: 'Field "month" must be a number between 1 and 12.' };
  }
  if (typeof body.year !== "number" || body.year < 2000 || body.year > 2100) {
    return { valid: false, error: 'Field "year" must be a number between 2000 and 2100.' };
  }
  if (!Array.isArray(body.channels)) {
    return { valid: false, error: 'Field "channels" must be an array.' };
  }
  if (!Array.isArray(body.expCats)) {
    return { valid: false, error: 'Field "expCats" must be an array.' };
  }

  const channels: ChannelEntry[] = [];
  for (const ch of body.channels as Record<string, unknown>[]) {
    if (typeof ch.name !== "string" || ch.name.trim() === "") continue;
    const nights = typeof ch.nights === "number" ? Math.floor(ch.nights) : 0;
    const revenue = typeof ch.revenue === "number" ? ch.revenue : 0;
    if (revenue <= 0) continue;
    channels.push({ name: ch.name.trim(), nights, revenue });
  }

  const expCats: ExpCatEntry[] = [];
  for (const ec of body.expCats as Record<string, unknown>[]) {
    if (typeof ec.category !== "string" || ec.category.trim() === "") continue;
    const amount = typeof ec.amount === "number" ? ec.amount : 0;
    if (amount <= 0) continue;
    expCats.push({ category: ec.category.trim(), amount });
  }

  if (channels.length === 0 && expCats.length === 0) {
    return { valid: false, error: "At least one channel or expense category with a positive amount is required." };
  }

  return {
    valid: true,
    data: {
      propertyId: body.propertyId.trim(),
      month: body.month,
      year: body.year,
      channels,
      expCats,
    },
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
    if (err.code === "P2003") {
      return NextResponse.json(
        { error: "Invalid property ID — property does not exist." },
        { status: 422 }
      );
    }
  }
  return NextResponse.json(
    { error: "An unexpected error occurred." },
    { status: 500 }
  );
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "monthlyentry", "create");
  } catch (err) {
    return handleError(err);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = validateBody(body);
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  const { propertyId, month, year, channels, expCats } = result.data;

  // Build check-in / check-out dates for the booking period.
  // Monthly entry covers the 1st to last day of the month.
  const checkIn = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const checkOut = new Date(Date.UTC(year, month - 1, lastDay));

  // Date for daily expenses — set to 1st of the month (representative date).
  const expenseDate = new Date(Date.UTC(year, month - 1, 1));

  try {
    const txResult = await prisma.$transaction(async (tx) => {
      // ── Create one Booking per channel ──────────────────────────────────
      let bookingsCreated = 0;
      for (const ch of channels) {
        await tx.booking.create({
          data: {
            property_id: propertyId,
            check_in: checkIn,
            check_out: checkOut,
            nights: ch.nights,
            revenue: ch.revenue,
            platform: ch.name,
            status: "confirmed",
            booking_type: "stay",
          },
        });
        bookingsCreated++;
      }

      // ── Create one DailyExpense per expense category ────────────────────
      let expensesCreated = 0;
      for (const ec of expCats) {
        await tx.dailyExpense.create({
          data: {
            property_id: propertyId,
            expense_date: expenseDate,
            category: ec.category,
            amount: ec.amount,
          },
        });
        expensesCreated++;
      }

      return { bookingsCreated, expensesCreated };
    });

    await regenReports();

    return NextResponse.json(
      {
        bookings_created: txResult.bookingsCreated,
        expenses_created: txResult.expensesCreated,
      },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}