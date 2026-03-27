// src/app/api/auth/login/route.ts
// =============================================================================
// MehmanGhar Financial OS — Login API Route
//
// POST /api/auth/login
// Body: { username: string, password: string }
//
// Returns:
//   200 — sets session cookie, returns { id, username, role }
//   400 — missing or invalid body shape
//   401 — invalid credentials
//   500 — unexpected server error
//
// No rate limiting in v1. Add Upstash or Next.js rate limiting in v2.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, signToken, setSessionCookie } from "@/lib/auth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ----------------------------------------------------------
  // 1. Parse and validate request body
  // ----------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).username !== "string" ||
    typeof (body as Record<string, unknown>).password !== "string"
  ) {
    return NextResponse.json(
      { error: "username and password are required." },
      { status: 400 }
    );
  }

  const { username, password } = body as { username: string; password: string };

  if (username.trim() === "" || password === "") {
    return NextResponse.json(
      { error: "username and password must not be empty." },
      { status: 400 }
    );
  }

  // ----------------------------------------------------------
  // 2. Look up the user — include role name for the JWT
  // ----------------------------------------------------------
  try {
    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
      include: { role: { select: { name: true } } },
    });

    // Use constant-time comparison pattern: always call verifyPassword even
    // on a dummy hash when user is not found. This prevents timing attacks
    // that reveal whether a username exists.
    const dummyHash =
      "$2a$12$invalidhashfortimingnormalizationxxxxxxxxxxxxxxxxxxxxxxx";
    const passwordMatch = await verifyPassword(
      password,
      user?.password_hash ?? dummyHash
    );

    if (!user || !passwordMatch) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    // ----------------------------------------------------------
    // 3. Sign the JWT and set the session cookie
    // ----------------------------------------------------------
    const token = await signToken({ sub: user.id, role: user.role.name });

    const response = NextResponse.json(
      {
        id: user.id,
        username: user.username,
        role: user.role.name,
      },
      { status: 200 }
    );

    setSessionCookie(response, token);
    return response;
  } catch (err) {
    console.error("[POST /api/auth/login]", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}