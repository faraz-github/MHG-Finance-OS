// src/app/api/daily-expenses/[id]/route.ts
// =============================================================================
// MehmanGhar Financial OS — Daily Expenses dynamic segment route
//
// PATCH  — update daily expense. SuperAdmin + Admin.
// DELETE — SuperAdmin only. Deletes storage file if invoice_path is set.
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

const STORAGE_BUCKET = "mg-finance-os";

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

interface ErrorResponse {
  error: string;
}

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
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ data: DailyExpenseRow } | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "dailyexp", "update");
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
  if (body.invoice_path !== undefined)
    updateData.invoice_path =
      typeof body.invoice_path === "string"
        ? body.invoice_path.trim() || null
        : null;

  try {
    const expense = await prisma.dailyExpense.update({
      where: { id },
      data: updateData,
    });
    await regenReports();
    return NextResponse.json({ data: serializeDailyExpense(expense) });
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
    const existing = await prisma.dailyExpense.findUnique({
      where: { id },
      select: { id: true, invoice_path: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Daily expense record not found." },
        { status: 404 }
      );
    }

    if (existing.invoice_path) {
      try {
        await deleteFile(STORAGE_BUCKET, existing.invoice_path);
      } catch {
        return NextResponse.json(
          {
            error: `Failed to delete invoice file at "${existing.invoice_path}". DB record was not deleted. Please remove the file manually before retrying.`,
          },
          { status: 500 }
        );
      }
    }

    await prisma.dailyExpense.delete({ where: { id } });
    await regenReports();
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}