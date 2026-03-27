// src/app/api/roles/route.ts
// =============================================================================
// MehmanGhar Financial OS — Roles API Route
//
// GET  /api/roles         — list all roles (SuperAdmin only)
// PATCH /api/roles/[id]  — update tab/crud permissions (SuperAdmin only)
//
// Note: role creation and deletion is out of scope for v1.
// SuperAdmin can adjust permissions on existing roles.
// New roles are added via a future migration + seed, not via the UI in v1.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, type TabPermissions, type CrudPermissions } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// GET /api/roles
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
  } catch {
    return NextResponse.json(
      { error: "Forbidden. SuperAdmin access required." },
      { status: 403 }
    );
  }

  try {
    const roles = await prisma.role.findMany({
      select: {
        id: true,
        name: true,
        tab_permissions: true,
        crud_permissions: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ roles }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/roles]", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/roles — update permissions on a role by id
// Body: { id: string, tab_permissions?: TabPermissions, crud_permissions?: CrudPermissions }
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
  } catch {
    return NextResponse.json(
      { error: "Forbidden. SuperAdmin access required." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  if (typeof b?.id !== "string" || b.id.trim() === "") {
    return NextResponse.json(
      { error: "id is required." },
      { status: 400 }
    );
  }

  const id = b.id.trim();

  // Build the update payload — only update fields that were provided
  const updateData: {
    tab_permissions?: TabPermissions;
    crud_permissions?: CrudPermissions;
  } = {};

  if (b.tab_permissions !== undefined) {
    if (typeof b.tab_permissions !== "object" || b.tab_permissions === null) {
      return NextResponse.json(
        { error: "tab_permissions must be an object." },
        { status: 400 }
      );
    }
    updateData.tab_permissions = b.tab_permissions as TabPermissions;
  }

  if (b.crud_permissions !== undefined) {
    if (typeof b.crud_permissions !== "object" || b.crud_permissions === null) {
      return NextResponse.json(
        { error: "crud_permissions must be an object." },
        { status: 400 }
      );
    }
    updateData.crud_permissions = b.crud_permissions as CrudPermissions;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "At least one of tab_permissions or crud_permissions must be provided." },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.role.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        tab_permissions: true,
        crud_permissions: true,
        updated_at: true,
      },
    });

    return NextResponse.json({ role: updated }, { status: 200 });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      return NextResponse.json(
        { error: `Role with id "${id}" not found.` },
        { status: 404 }
      );
    }

    console.error("[PATCH /api/roles]", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}