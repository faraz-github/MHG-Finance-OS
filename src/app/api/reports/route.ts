// src/app/api/reports/route.ts
// =============================================================================
// MehmanGhar Financial OS — Reports API Route
//
// Reports are immutable once created (v3 plan Section 8).
// No PUT method — use DELETE + re-create to correct a report.
//
// GET    — list reports. Supports ?property_id=, ?period_type=, ?year=.
//          Ordered by created_at DESC.
// POST   — create report. SuperAdmin only.
//          The `data` field is the raw calcF() output — stored verbatim.
//          This route does NOT call calcF() or any function from finance.ts.
// DELETE — SuperAdmin only (hard delete for admin correction).
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

interface ReportRow {
  id: string;
  property_id: string | null;
  title: string;
  period_type: string;
  year: number;
  month: number | null;
  data: unknown;
  created_at: string;
}

interface ReportListResponse {
  data: ReportRow[];
}

interface ReportSingleResponse {
  data: ReportRow;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

type PrismaReport = Awaited<ReturnType<typeof prisma.report.findUniqueOrThrow>>;

function serializeReport(r: PrismaReport): ReportRow {
  return {
    id: r.id,
    property_id: r.property_id,
    title: r.title,
    period_type: r.period_type,
    year: r.year,
    month: r.month,
    data: r.data,
    created_at: r.created_at.toISOString(),
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
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A report with these details already exists." },
        { status: 409 }
      );
    }
  }
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

// ---------------------------------------------------------------------------
// GET — list reports
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<ReportListResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "reports", "read");
  } catch (err) {
    return handleError(err);
  }

  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("property_id");
  const periodType = searchParams.get("period_type");
  const yearParam = searchParams.get("year");

  const where: Prisma.ReportWhereInput = {};
  if (propertyId) where.property_id = propertyId;
  if (periodType) where.period_type = periodType;
  if (yearParam) {
    const year = parseInt(yearParam, 10);
    if (!isNaN(year)) where.year = year;
  }

  try {
    const reports = await prisma.report.findMany({
      where,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({ data: reports.map(serializeReport) });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// POST — create report (SuperAdmin only)
// The `data` field is the raw calcF() output passed in from the client.
// This route stores it verbatim — no calculation happens here.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<ReportSingleResponse | ErrorResponse>> {
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
  if (typeof body.title !== "string" || body.title.trim() === "") {
    return NextResponse.json(
      { error: "Field \"title\" is required and must be a non-empty string." },
      { status: 422 }
    );
  }
  if (typeof body.period_type !== "string" || body.period_type.trim() === "") {
    return NextResponse.json(
      { error: "Field \"period_type\" is required." },
      { status: 422 }
    );
  }
  if (typeof body.year !== "number") {
    return NextResponse.json(
      { error: "Field \"year\" is required and must be a number." },
      { status: 422 }
    );
  }
  if (body.data === undefined) {
    return NextResponse.json(
      { error: "Field \"data\" is required. Pass the calcF() output object." },
      { status: 422 }
    );
  }

  try {
    const report = await prisma.report.create({
      data: {
        property_id:
          typeof body.property_id === "string" && body.property_id.trim()
            ? body.property_id.trim()
            : null,
        title: body.title.trim(),
        period_type: body.period_type.trim(),
        year: Math.floor(body.year),
        month:
          typeof body.month === "number" ? Math.floor(body.month) : null,
        // data is stored verbatim — it is the raw calcF() output
        data: body.data as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ data: serializeReport(report) }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE — hard delete (SuperAdmin only)
// Purges the report AND all bookings, daily expenses, AND payout ledger entries
// for that property × month × year — the full source of truth.
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest
): Promise<NextResponse<{ success: true; deleted: { report: number; bookings: number; expenses: number; payouts: number } } | ErrorResponse>> {
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
    // 1. Fetch the report to get property_id, month, year
    const report = await prisma.report.findUnique({
      where: { id: id.trim() },
      select: { id: true, property_id: true, month: true, year: true },
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const { property_id, month, year } = report;

    if (!property_id || !month || !year) {
      await prisma.report.delete({ where: { id: id.trim() } });
      return NextResponse.json({ success: true, deleted: { report: 1, bookings: 0, expenses: 0, payouts: 0 } });
    }

    // 2. Date range covering the full calendar month (UTC)
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd   = new Date(Date.UTC(year, month, 0));  // last day of month

    // 3. Delete bookings, expenses, and payouts atomically, then the report
    const [bookingsResult, expensesResult, payoutsResult] = await prisma.$transaction([
      prisma.booking.deleteMany({
        where: { property_id, check_in: { gte: monthStart, lte: monthEnd } },
      }),
      prisma.dailyExpense.deleteMany({
        where: { property_id, expense_date: { gte: monthStart, lte: monthEnd } },
      }),
      // Payouts are stored with year + month integers — match directly
      prisma.payout.deleteMany({
        where: { property_id, year, month },
      }),
    ]);

    await prisma.report.delete({ where: { id: id.trim() } });

    return NextResponse.json({
      success: true,
      deleted: {
        report:   1,
        bookings: bookingsResult.count,
        expenses: expensesResult.count,
        payouts:  payoutsResult.count,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
