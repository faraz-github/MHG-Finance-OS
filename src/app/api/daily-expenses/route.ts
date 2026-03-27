// src/app/api/daily-expenses/route.ts
// =============================================================================
// MehmanGhar Financial OS — Daily Expenses API Route
//
// Full CRUD for the DailyExpense model.
//
// GET    — list daily expenses with optional filters and pagination.
//          Filters: ?property_id=, ?category=, ?from=, ?to= (on expense_date)
//          Pagination: ?page= (default 1), ?limit= (default 50)
// POST   — create daily expense. SuperAdmin + Admin.
// PUT    — update. SuperAdmin + Admin.
// DELETE — SuperAdmin only. If invoice_path exists, also deletes from storage.
//
// invoice_path is accepted in POST/PUT body but signed URLs are NOT generated
// here — that is handled exclusively by /api/files/signed-url/route.ts
// (v3 plan Section 3.2, built in Prompt 2).
//
// Decimal field (amount) serialized via .toNumber().
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
import { deleteFile } from "@/lib/storage";
import { Prisma } from "@/generated/prisma/client/client";
import { regenReports } from "@/lib/regenReports";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_BUCKET = "mg-finance-os";

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface DailyExpenseRow {
  id: string;
  property_id: string;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  invoice_path: string | null;
  created_at: string;
  updated_at: string;
}

interface DailyExpenseListResponse {
  data: DailyExpenseRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

interface DailyExpenseSingleResponse {
  data: DailyExpenseRow;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

type PrismaDailyExpense = Awaited<
  ReturnType<typeof prisma.dailyExpense.findUniqueOrThrow>
>;

function serializeDailyExpense(e: PrismaDailyExpense): DailyExpenseRow {
  return {
    id: e.id,
    property_id: e.property_id,
    expense_date:
      e.expense_date instanceof Date
        ? e.expense_date.toISOString().slice(0, 10)
        : String(e.expense_date),
    category: e.category,
    description: e.description,
    amount: e.amount.toNumber(),
    invoice_path: e.invoice_path,
    created_at: e.created_at.toISOString(),
    updated_at: e.updated_at.toISOString(),
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
      return NextResponse.json(
        { error: "Daily expense record not found." },
        { status: 404 }
      );
    }
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A duplicate daily expense record exists." },
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
// GET — list daily expenses
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<DailyExpenseListResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "dailyexp", "read");
  } catch (err) {
    return handleError(err);
  }

  const { searchParams } = new URL(request.url);

  const propertyId = searchParams.get("property_id");
  const category = searchParams.get("category");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50)
  );

  const where: Prisma.DailyExpenseWhereInput = {};
  if (propertyId) where.property_id = propertyId;
  if (category) where.category = category;
  if (from || to) {
    where.expense_date = {};
    if (from) where.expense_date.gte = new Date(from);
    if (to) where.expense_date.lte = new Date(to);
  }

  try {
    const [expenses, total] = await Promise.all([
      prisma.dailyExpense.findMany({
        where,
        orderBy: { expense_date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.dailyExpense.count({ where }),
    ]);

    return NextResponse.json({
      data: expenses.map(serializeDailyExpense),
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
// POST — create daily expense (SuperAdmin + Admin)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<DailyExpenseSingleResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "dailyexp", "create");
  } catch (err) {
    return handleError(err);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Normalise camelCase keys sent by DailyExpModal → snake_case used below
  if (body.propertyId !== undefined && body.property_id === undefined)
    body.property_id = body.propertyId;
  if (body.expenseDate !== undefined && body.expense_date === undefined)
    body.expense_date = body.expenseDate;

  // Required fields
  if (typeof body.property_id !== "string" || body.property_id.trim() === "") {
    return NextResponse.json(
      { error: "Field \"property_id\" is required." },
      { status: 422 }
    );
  }
  if (typeof body.expense_date !== "string" || body.expense_date.trim() === "") {
    return NextResponse.json(
      { error: "Field \"expense_date\" is required (YYYY-MM-DD)." },
      { status: 422 }
    );
  }
  if (typeof body.category !== "string" || body.category.trim() === "") {
    return NextResponse.json(
      { error: "Field \"category\" is required and must be a non-empty string." },
      { status: 422 }
    );
  }
  if (typeof body.amount !== "number") {
    return NextResponse.json(
      { error: "Field \"amount\" is required and must be a number." },
      { status: 422 }
    );
  }

  try {
    const expense = await prisma.dailyExpense.create({
      data: {
        property_id: body.property_id.trim(),
        expense_date: new Date(body.expense_date),
        category: body.category.trim(),
        description:
          typeof body.description === "string"
            ? body.description.trim() || null
            : null,
        amount: body.amount,
        // invoice_path accepted but no signed URL generated here —
        // see /api/files/signed-url/route.ts (v3 plan Section 3.2)
        invoice_path:
          typeof body.invoice_path === "string"
            ? body.invoice_path.trim() || null
            : null,
      },
    });

    await regenReports();

    return NextResponse.json(
      { data: serializeDailyExpense(expense) },
      { status: 201 }
    );
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// PUT — update daily expense (SuperAdmin + Admin)
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest
): Promise<NextResponse<DailyExpenseSingleResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "dailyexp", "update");
  } catch (err) {
    return handleError(err);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Normalise camelCase key from DailyExpModal
  if (body.expenseDate !== undefined && body.expense_date === undefined)
    body.expense_date = body.expenseDate;

  const id = body.id;
  if (typeof id !== "string" || id.trim() === "") {
    return NextResponse.json(
      { error: "Field \"id\" is required in the request body." },
      { status: 422 }
    );
  }

  const updateData: Prisma.DailyExpenseUpdateInput = {};
  if (typeof body.expense_date === "string")
    updateData.expense_date = new Date(body.expense_date);
  if (typeof body.category === "string")
    updateData.category = body.category.trim();
  if (body.description !== undefined)
    updateData.description =
      typeof body.description === "string"
        ? body.description.trim() || null
        : null;
  if (typeof body.amount === "number") updateData.amount = body.amount;
  // invoice_path accepted — no signed URL generated here
  if (body.invoice_path !== undefined)
    updateData.invoice_path =
      typeof body.invoice_path === "string"
        ? body.invoice_path.trim() || null
        : null;

  try {
    const expense = await prisma.dailyExpense.update({
      where: { id: id.trim() },
      data: updateData,
    });

    await regenReports();

    return NextResponse.json({ data: serializeDailyExpense(expense) });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE — SuperAdmin only
// If invoice_path is set, deletes the file from storage before the DB record.
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

  const expenseId = id.trim();

  try {
    // Fetch the record to get invoice_path before deletion
    const existing = await prisma.dailyExpense.findUnique({
      where: { id: expenseId },
      select: { id: true, invoice_path: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Daily expense record not found." },
        { status: 404 }
      );
    }

    // Delete storage file if one exists (best-effort — storage errors do not
    // block DB deletion, but are surfaced as a 500 to alert the developer)
    if (existing.invoice_path) {
      try {
        await deleteFile(STORAGE_BUCKET, existing.invoice_path);
      } catch (storageErr) {
        // Storage deletion failed — log the path for manual cleanup,
        // then return 500 rather than silently leaving orphaned files.
        return NextResponse.json(
          {
            error: `Failed to delete invoice file at "${existing.invoice_path}". DB record was not deleted. Please remove the file manually before retrying.`,
          },
          { status: 500 }
        );
      }
    }

    await prisma.dailyExpense.delete({ where: { id: expenseId } });

    await regenReports();

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}