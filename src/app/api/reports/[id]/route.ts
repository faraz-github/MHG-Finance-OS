// src/app/api/reports/[id]/route.ts
// =============================================================================
// MehmanGhar Financial OS — Reports dynamic segment route
//
// DELETE — hard delete by URL segment. SuperAdmin only.
// No PATCH — reports are immutable.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, RoleRequiredError } from "@/lib/permissions";
import { Prisma } from "@/generated/prisma/client/client";

interface ErrorResponse {
  error: string;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: true } | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
  } catch (err) {
    if (err instanceof RoleRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }

  const { id } = await params;

  try {
    await prisma.report.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Report not found." }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}