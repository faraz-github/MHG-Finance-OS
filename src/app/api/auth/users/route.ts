// src/app/api/auth/users/route.ts
// =============================================================================
// MehmanGhar Financial OS — List Users API Route
//
// GET /api/auth/users
// SuperAdmin only.
//
// Returns all users with their role name (no password_hash).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";

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
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        created_at: true,
        role: { select: { name: true } },
      },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json({ users }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/auth/users]", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}