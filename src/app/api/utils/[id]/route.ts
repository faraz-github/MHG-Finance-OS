// src/app/api/utils/[id]/route.ts
// =============================================================================
// MehmanGhar Financial OS — Utils Entry dynamic segment route
//
// PATCH  — update a single entry in the utils_entries JSON array.
//          SuperAdmin + Admin.
// DELETE — remove a single entry from the utils_entries JSON array.
//          SuperAdmin only.
//
// Both operations load the full array, mutate it in memory, then save it back.
// This is safe for v1 usage (low concurrency, small dataset).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { loadEntries, saveEntries } from "@/app/api/utils/route";
import type { UtilEntry } from "@/app/api/utils/route";
import {
  assertPermission,
  requireRole,
  PermissionError,
  RoleRequiredError,
} from "@/lib/permissions";

interface ErrorResponse {
  error: string;
}

function handleError(err: unknown): NextResponse<ErrorResponse> {
  if (err instanceof PermissionError || err instanceof RoleRequiredError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

// ---------------------------------------------------------------------------
// PATCH — update a single entry
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ data: UtilEntry } | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "utils", "update");
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

  try {
    const entries = await loadEntries();
    const idx = entries.findIndex((e) => e.id === id);

    if (idx === -1) {
      return NextResponse.json(
        { error: "Utils entry not found." },
        { status: 404 }
      );
    }

    const existing = entries[idx];

    const updated: UtilEntry = {
      ...existing,
      ...(typeof body.type === "string" &&
      ["rent", "electricity", "custom"].includes(body.type)
        ? { type: body.type as UtilEntry["type"] }
        : {}),
      ...(typeof body.pid === "string" ? { pid: body.pid.trim() } : {}),
      ...(typeof body.cn === "string" ? { cn: body.cn.trim() } : {}),
      ...(typeof body.label === "string" ? { label: body.label.trim() } : {}),
      ...(body.amount !== undefined
        ? {
            amount:
              typeof body.amount === "number"
                ? body.amount
                : Number(body.amount) || 0,
          }
        : {}),
      ...(typeof body.dueDate === "string" ? { dueDate: body.dueDate.trim() } : {}),
      ...(typeof body.paidDate === "string"
        ? { paidDate: body.paidDate.trim() }
        : {}),
      ...(body.status === "paid" || body.status === "pending"
        ? { status: body.status }
        : {}),
      ...(body.tds !== undefined ? { tds: body.tds === true } : {}),
      ...(body.gst !== undefined ? { gst: body.gst === true } : {}),
      ...(typeof body.notes === "string" ? { notes: body.notes.trim() } : {}),
    };

    entries[idx] = updated;
    await saveEntries(entries);

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove a single entry
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
    const entries = await loadEntries();
    const idx = entries.findIndex((e) => e.id === id);

    if (idx === -1) {
      return NextResponse.json(
        { error: "Utils entry not found." },
        { status: 404 }
      );
    }

    entries.splice(idx, 1);
    await saveEntries(entries);

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}