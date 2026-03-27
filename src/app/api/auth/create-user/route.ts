// src/app/api/auth/create-user/route.ts
// =============================================================================
// MehmanGhar Financial OS — Create User API Route
//
// POST /api/auth/create-user
// SuperAdmin only.
//
// Body: { username: string, password: string, roleId: string }
//
// Returns:
//   201 — user created, returns { id, username, role }
//   400 — missing fields or username already taken
//   401 — not authenticated (handled by proxy.ts)
//   403 — not SuperAdmin
//   500 — unexpected server error
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requireRole } from "@/lib/permissions";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ----------------------------------------------------------
  // 1. Role guard — SuperAdmin only
  // ----------------------------------------------------------
  const role = request.headers.get("x-user-role") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
  } catch {
    return NextResponse.json(
      { error: "Forbidden. SuperAdmin access required." },
      { status: 403 }
    );
  }

  // ----------------------------------------------------------
  // 2. Parse and validate body
  // ----------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  if (
    typeof b?.username !== "string" ||
    typeof b?.password !== "string" ||
    typeof b?.roleId !== "string"
  ) {
    return NextResponse.json(
      { error: "username, password, and roleId are required." },
      { status: 400 }
    );
  }

  const username = b.username.trim();
  const password = b.password;
  const roleId = b.roleId.trim();

  if (username === "" || password === "" || roleId === "") {
    return NextResponse.json(
      { error: "username, password, and roleId must not be empty." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  // ----------------------------------------------------------
  // 3. Create the user
  // ----------------------------------------------------------
  try {
    // Verify the target role exists before creating the user
    const targetRole = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true },
    });

    if (!targetRole) {
      return NextResponse.json(
        { error: `Role with id "${roleId}" does not exist.` },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        username,
        password_hash: passwordHash,
        role_id: roleId,
      },
      include: { role: { select: { name: true } } },
    });

    return NextResponse.json(
      {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role.name,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    // Prisma unique constraint violation on username
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: `Username "${b.username}" is already taken.` },
        { status: 400 }
      );
    }

    console.error("[POST /api/auth/create-user]", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}