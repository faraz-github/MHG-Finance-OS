// src/app/api/exports/route.ts
// =============================================================================
// MehmanGhar Financial OS — Exports Route
//
// Two callers, two methods — both SuperAdmin only:
//
// GET  — Topbar "Export CSV" and "Backup" buttons.
//        ?model=bookings|daily-expenses|payouts|guests → CSV download
//        ?model=all → Full JSON backup of all tables
//        ?property_id= ?from= ?to= — optional filters (CSV models only)
//
// POST — ReportsClient "Export" cards.
//        Body: { type: string } where type is a report export type
//        ('monthly' | 'property' | 'annual' | 'investor' | 'raw')
//        Returns a CSV of report records matching that type.
//
// CSV is built manually — no external library needed for flat tabular data.
// Decimal fields serialized as plain numbers. Dates as YYYY-MM-DD strings.
// No calls to finance.ts — only stored DB values are exported.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, RoleRequiredError } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function escCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const head = headers.map(escCsv).join(",");
  const body = rows.map((r) => headers.map((h) => escCsv(r[h])).join(","));
  return [head, ...body].join("\n");
}

function toDate(d: unknown): string {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function jsonResponse(data: unknown, filename: string): NextResponse {
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ---------------------------------------------------------------------------
// Model exporters
// ---------------------------------------------------------------------------

async function exportBookings(
  propertyId?: string,
  from?: string,
  to?: string
): Promise<string> {
  const where: Record<string, unknown> = {};
  if (propertyId) where.property_id = propertyId;
  if (from || to) {
    where.check_in = {};
    if (from) (where.check_in as Record<string, unknown>).gte = new Date(from);
    if (to) (where.check_in as Record<string, unknown>).lte = new Date(to);
  }

  const rows = await prisma.booking.findMany({
    where,
    orderBy: { check_in: "desc" },
  });

  const headers = [
    "id", "property_id", "guest_id", "check_in", "check_out", "nights",
    "revenue", "room_amount", "booking_type", "event_type", "event_guests",
    "food_cost", "services", "rating", "platform", "status", "notes",
    "created_at",
  ];

  const data = rows.map((r) => ({
    id: r.id,
    property_id: r.property_id,
    guest_id: r.guest_id,
    check_in: toDate(r.check_in),
    check_out: toDate(r.check_out),
    nights: r.nights,
    revenue: r.revenue.toNumber(),
    room_amount: r.room_amount ? r.room_amount.toNumber() : "",
    booking_type: r.booking_type,
    event_type: r.event_type,
    event_guests: r.event_guests,
    food_cost: r.food_cost ? r.food_cost.toNumber() : "",
    services: r.services,
    rating: r.rating,
    platform: r.platform,
    status: r.status,
    notes: r.notes,
    created_at: toDate(r.created_at),
  }));

  return toCsv(headers, data);
}

async function exportDailyExpenses(
  propertyId?: string,
  from?: string,
  to?: string
): Promise<string> {
  const where: Record<string, unknown> = {};
  if (propertyId) where.property_id = propertyId;
  if (from || to) {
    where.expense_date = {};
    if (from) (where.expense_date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.expense_date as Record<string, unknown>).lte = new Date(to);
  }

  const rows = await prisma.dailyExpense.findMany({
    where,
    orderBy: { expense_date: "desc" },
  });

  const headers = [
    "id", "property_id", "expense_date", "category", "description",
    "amount", "invoice_path", "created_at",
  ];

  const data = rows.map((r) => ({
    id: r.id,
    property_id: r.property_id,
    expense_date: toDate(r.expense_date),
    category: r.category,
    description: r.description,
    amount: r.amount.toNumber(),
    invoice_path: r.invoice_path,
    created_at: toDate(r.created_at),
  }));

  return toCsv(headers, data);
}

async function exportPayouts(
  propertyId?: string
): Promise<string> {
  const where: Record<string, unknown> = {};
  if (propertyId) where.property_id = propertyId;

  const rows = await prisma.payout.findMany({
    where,
    include: {
      property: { select: { name: true } },
      investor: { select: { name: true } },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const headers = [
    "id", "property_id", "property_name", "investor_id", "investor_name",
    "year", "month", "amount_owed", "amount_paid", "paid_on", "reference",
    "status", "notes", "created_at",
  ];

  const data = rows.map((r) => ({
    id: r.id,
    property_id: r.property_id,
    property_name: r.property.name,
    investor_id: r.investor_id,
    investor_name: r.investor.name,
    year: r.year,
    month: r.month,
    amount_owed: r.amount_owed.toNumber(),
    amount_paid: r.amount_paid ? r.amount_paid.toNumber() : "",
    paid_on: toDate(r.paid_on),
    reference: r.reference,
    status: r.amount_paid !== null ? "paid" : "pending",
    notes: r.notes,
    created_at: toDate(r.created_at),
  }));

  return toCsv(headers, data);
}

async function exportGuests(): Promise<string> {
  const rows = await prisma.guest.findMany({
    include: { _count: { select: { bookings: true } } },
    orderBy: { name: "asc" },
  });

  const headers = [
    "id", "name", "email", "phone", "nationality", "city",
    "notes", "booking_count", "created_at",
  ];

  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    nationality: r.nationality,
    city: r.city,
    notes: r.notes,
    booking_count: r._count.bookings,
    created_at: toDate(r.created_at),
  }));

  return toCsv(headers, data);
}

async function exportReportsByType(type: string): Promise<string> {
  const rows = await prisma.report.findMany({
    where:
      type === "raw"
        ? {}
        : { period_type: type === "annual" ? "annual" : "monthly" },
    orderBy: { created_at: "desc" },
  });

  const headers = ["id", "property_id", "title", "period_type", "year", "month", "created_at"];

  const data = rows.map((r) => ({
    id: r.id,
    property_id: r.property_id,
    title: r.title,
    period_type: r.period_type,
    year: r.year,
    month: r.month ?? "",
    created_at: toDate(r.created_at),
  }));

  return toCsv(headers, data);
}

// ---------------------------------------------------------------------------
// Full JSON backup
// ---------------------------------------------------------------------------

async function exportFullBackup(): Promise<unknown> {
  const [
    properties,
    investors,
    guests,
    bookings,
    dailyExpenses,
    payouts,
    reports,
    utilsSettings,
  ] = await Promise.all([
    prisma.property.findMany(),
    prisma.investor.findMany(),
    prisma.guest.findMany(),
    prisma.booking.findMany(),
    prisma.dailyExpense.findMany(),
    prisma.payout.findMany(),
    prisma.report.findMany(),
    prisma.utilsSetting.findMany(),
  ]);

  return {
    _meta: {
      version: "1.0",
      exported_at: new Date().toISOString(),
      source: "mg-finance-os",
    },
    properties: properties.map((p) => ({
      ...p,
      comm: p.comm.toString(),
      capital: p.capital.toString(),
    })),
    investors: investors.map((inv) => ({
      ...inv,
      capital: inv.capital.toString(),
      share_pct: inv.share_pct.toString(),
    })),
    guests,
    bookings: bookings.map((b) => ({
      ...b,
      revenue: b.revenue.toString(),
      room_amount: b.room_amount?.toString() ?? null,
      food_cost: b.food_cost?.toString() ?? null,
    })),
    daily_expenses: dailyExpenses.map((e) => ({
      ...e,
      amount: e.amount.toString(),
    })),
    payouts: payouts.map((p) => ({
      ...p,
      amount_owed: p.amount_owed.toString(),
      amount_paid: p.amount_paid?.toString() ?? null,
    })),
    reports,
    utils_settings: utilsSettings,
  };
}

// ---------------------------------------------------------------------------
// GET — Topbar Export CSV / Backup
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
  } catch (err) {
    if (err instanceof RoleRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model") ?? "";
  const propertyId = searchParams.get("property_id") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  try {
    switch (model) {
      case "bookings": {
        const csv = await exportBookings(propertyId, from, to);
        return csvResponse(csv, "mg-bookings-export.csv");
      }
      case "daily-expenses": {
        const csv = await exportDailyExpenses(propertyId, from, to);
        return csvResponse(csv, "mg-daily-expenses-export.csv");
      }
      case "payouts": {
        const csv = await exportPayouts(propertyId);
        return csvResponse(csv, "mg-payouts-export.csv");
      }
      case "guests": {
        const csv = await exportGuests();
        return csvResponse(csv, "mg-guests-export.csv");
      }
      case "all": {
        const backup = await exportFullBackup();
        const ts = new Date().toISOString().slice(0, 10);
        return jsonResponse(backup, `mg-finance-backup-${ts}.json`);
      }
      default:
        return NextResponse.json(
          {
            error:
              'Invalid ?model= parameter. Use: bookings, daily-expenses, payouts, guests, or all.',
          },
          { status: 400 }
        );
    }
  } catch {
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — ReportsClient export cards
// Body: { type: string } — report export types from the HTML card grid
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
  } catch (err) {
    if (err instanceof RoleRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type.trim() : "";

  if (!type) {
    return NextResponse.json(
      { error: 'Field "type" is required.' },
      { status: 422 }
    );
  }

  try {
    const csv = await exportReportsByType(type);
    return csvResponse(csv, `mg-${type}-export.csv`);
  } catch {
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}