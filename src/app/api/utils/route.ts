// src/app/api/utils/route.ts
// =============================================================================
// MehmanGhar Financial OS — Utils API Route
//
// The Utils tab stores entries as a JSON array in UtilsSetting under the key
// 'utils_entries'. There is no dedicated UtilsEntry table in v1 (v2 will add
// one — see utils/page.tsx schema note).
//
// GET  — return entries array and all settings as { entries, settings }
// POST — append a new entry to the utils_entries array. SuperAdmin + Admin.
// PUT  — upsert a raw UtilsSetting key-value pair (admin config). SuperAdmin only.
//
// PATCH and DELETE on individual entries are handled by /api/utils/[id]/route.ts.
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

const UTILS_STORAGE_KEY = "utils_entries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UtilEntry {
  id: string;
  type: "rent" | "electricity" | "custom";
  pid: string;
  cn: string;
  label: string;
  amount: number;
  dueDate: string;
  paidDate: string;
  status: "pending" | "paid";
  tds: boolean;
  gst: boolean;
  notes: string;
}

interface UtilsGetResponse {
  data: {
    entries: UtilEntry[];
    settings: Record<string, unknown>;
  };
}

interface UtilEntryResponse {
  data: UtilEntry;
}

interface SettingRow {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

interface SettingSingleResponse {
  data: SettingRow;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Helper — load entries array from DB
// ---------------------------------------------------------------------------

export async function loadEntries(): Promise<UtilEntry[]> {
  const setting = await prisma.utilsSetting.findUnique({
    where: { key: UTILS_STORAGE_KEY },
  });
  if (!setting?.value || !Array.isArray(setting.value)) return [];
  return (setting.value as unknown[]).map((raw) => {
    const u = raw as Record<string, unknown>;
    return {
      id: String(u.id ?? ""),
      type: (u.type as UtilEntry["type"]) ?? "rent",
      pid: String(u.pid ?? ""),
      cn: String(u.cn ?? ""),
      label: String(u.label ?? ""),
      amount: Number(u.amount ?? 0),
      dueDate: String(u.dueDate ?? ""),
      paidDate: String(u.paidDate ?? ""),
      status: (u.status as UtilEntry["status"]) ?? "pending",
      tds: Boolean(u.tds),
      gst: Boolean(u.gst),
      notes: String(u.notes ?? ""),
    };
  });
}

// ---------------------------------------------------------------------------
// Helper — save entries array to DB
// ---------------------------------------------------------------------------

export async function saveEntries(entries: UtilEntry[]): Promise<void> {
  await prisma.utilsSetting.upsert({
    where: { key: UTILS_STORAGE_KEY },
    create: {
      key: UTILS_STORAGE_KEY,
      value: entries as unknown as Prisma.InputJsonValue,
      description: "Rent & Utilities entries (JSON array)",
    },
    update: {
      value: entries as unknown as Prisma.InputJsonValue,
    },
  });
}

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

function handleError(err: unknown): NextResponse<ErrorResponse> {
  if (err instanceof PermissionError || err instanceof RoleRequiredError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
}

// ---------------------------------------------------------------------------
// GET — return entries array + all settings map
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<UtilsGetResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "utils", "read");
  } catch (err) {
    return handleError(err);
  }

  try {
    const [entries, allSettings] = await Promise.all([
      loadEntries(),
      prisma.utilsSetting.findMany({ orderBy: { key: "asc" } }),
    ]);

    const settingsMap: Record<string, unknown> = {};
    for (const s of allSettings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json({ data: { entries, settings: settingsMap } });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// POST — create a new utils entry (SuperAdmin + Admin)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<UtilEntryResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    await assertPermission(role, "utils", "create");
  } catch (err) {
    return handleError(err);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body.type !== "string" ||
    !["rent", "electricity", "custom"].includes(body.type)
  ) {
    return NextResponse.json(
      {
        error:
          'Field "type" is required and must be "rent", "electricity", or "custom".',
      },
      { status: 422 }
    );
  }
  if (typeof body.pid !== "string" || body.pid.trim() === "") {
    return NextResponse.json(
      { error: 'Field "pid" (property id) is required.' },
      { status: 422 }
    );
  }

  try {
    const entries = await loadEntries();

    const newId = `util_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const newEntry: UtilEntry = {
      id: newId,
      type: body.type as UtilEntry["type"],
      pid: String(body.pid).trim(),
      cn: typeof body.cn === "string" ? body.cn.trim() : "",
      label: typeof body.label === "string" ? body.label.trim() : "",
      amount:
        typeof body.amount === "number"
          ? body.amount
          : Number(body.amount) || 0,
      dueDate: typeof body.dueDate === "string" ? body.dueDate.trim() : "",
      paidDate:
        typeof body.paidDate === "string" ? body.paidDate.trim() : "",
      status:
        body.status === "paid" || body.status === "pending"
          ? body.status
          : "pending",
      tds: body.tds === true,
      gst: body.gst === true,
      notes: typeof body.notes === "string" ? body.notes.trim() : "",
    };

    entries.push(newEntry);
    await saveEntries(entries);

    return NextResponse.json({ data: newEntry }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// PUT — upsert a raw UtilsSetting key-value pair (SuperAdmin only)
// Used for admin config settings (targets, etc.), not for utils entries.
// Body: { key: string; value: unknown; description?: string }
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest
): Promise<NextResponse<SettingSingleResponse | ErrorResponse>> {
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

  if (typeof body.key !== "string" || body.key.trim() === "") {
    return NextResponse.json(
      { error: 'Field "key" is required and must be a non-empty string.' },
      { status: 422 }
    );
  }
  if (body.value === undefined) {
    return NextResponse.json(
      { error: 'Field "value" is required.' },
      { status: 422 }
    );
  }

  const key = body.key.trim();

  try {
    const setting = await prisma.utilsSetting.upsert({
      where: { key },
      create: {
        key,
        value: body.value as Prisma.InputJsonValue,
        description:
          typeof body.description === "string"
            ? body.description.trim() || null
            : null,
      },
      update: {
        value: body.value as Prisma.InputJsonValue,
        ...(body.description !== undefined && {
          description:
            typeof body.description === "string"
              ? body.description.trim() || null
              : null,
        }),
      },
    });

    return NextResponse.json({
      data: {
        id: setting.id,
        key: setting.key,
        value: setting.value,
        description: setting.description,
        updated_at: setting.updated_at.toISOString(),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}