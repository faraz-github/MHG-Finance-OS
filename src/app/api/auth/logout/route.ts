// src/app/api/auth/logout/route.ts
// =============================================================================
// MehmanGhar Financial OS — Logout API Route
//
// POST /api/auth/logout
//
// Clears the session cookie and redirects to /login.
// No body or auth check needed — clearing a cookie is always safe.
// If the cookie doesn't exist, the response is the same.
//
// Returns:
//   200 — cookie cleared, returns { success: true }
// =============================================================================

import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true }, { status: 200 });
  clearSessionCookie(response);
  return response;
}