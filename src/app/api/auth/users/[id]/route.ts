// src/app/api/auth/users/[id]/route.ts
// =============================================================================
// MehmanGhar Financial OS — Delete User + Change Password API Route
//
// DELETE /api/auth/users/[id]  — SuperAdmin only. Cannot delete own account.
// PATCH  /api/auth/users/[id]  — SuperAdmin only. Change another user's password.
//   Body: { password: string }
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/permissions";

type Params = { params: Promise<{ id: string }> };

// ── DELETE /api/auth/users/[id] ───────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const role       = request.headers.get("x-user-role") ?? "";
  const requesterId = request.headers.get("x-user-id") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
  } catch {
    return NextResponse.json(
      { error: "Forbidden. SuperAdmin access required." },
      { status: 403 }
    );
  }

  const { id } = await params;

  if (id === requesterId) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      include: { role: { select: { name: true } } },
    });

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (target.role.name === "SuperAdmin") {
      return NextResponse.json(
        { error: "SuperAdmin accounts cannot be deleted." },
        { status: 400 }
      );
    }

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[DELETE /api/auth/users/[id]]", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

// ── PATCH /api/auth/users/[id] ────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
  } catch {
    return NextResponse.json(
      { error: "Forbidden. SuperAdmin access required." },
      { status: 403 }
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  if (typeof b?.password !== "string" || b.password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      include: { role: { select: { name: true } } },
    });

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (target.role.name === "SuperAdmin") {
      return NextResponse.json(
        { error: "Cannot change SuperAdmin password via this route." },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(b.password);
    await prisma.user.update({
      where: { id },
      data: { password_hash: passwordHash },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[PATCH /api/auth/users/[id]]", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}