// src/app/api/files/signed-url/route.ts
// =============================================================================
// MehmanGhar Financial OS — Signed URL Generator
//
// POST — generate a time-limited signed URL for a stored file.
//        Body: { bucket: string; path: string; expiresIn?: number }
//        Default expiresIn: 60 seconds (v3 plan Section 3.2 + Section 12).
//
// Any authenticated role may request a signed URL — the URL is scoped to a
// specific file path, not a tab. The proxy.ts middleware ensures only
// authenticated users reach this route.
//
// Returns: { url: string; expiresAt: string }
//
// Calls storage.ts getSignedUrl() exclusively — never imports supabase-js.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getSignedUrl } from "@/lib/storage";

const DEFAULT_EXPIRES_IN = 60; // seconds — v3 plan Section 12

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface SignedUrlResponse {
  url: string;
  expiresAt: string;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<SignedUrlResponse | ErrorResponse>> {
  // proxy.ts guarantees authentication before this route is reached.
  // No specific tab permission required — any authenticated role may request
  // a signed URL. The URL is scoped to a specific file path, not a tab.
  // Decision: no assertPermission() call. If files are ever restricted to
  // specific tabs, add assertPermission(role, tabKey, 'read') here.
  // Validate role header is present (belt-and-suspenders).
  const role = request.headers.get("x-user-role") ?? "";
  if (!role) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.bucket !== "string" || body.bucket.trim() === "") {
    return NextResponse.json(
      { error: "Field \"bucket\" is required and must be a non-empty string." },
      { status: 422 }
    );
  }
  if (typeof body.path !== "string" || body.path.trim() === "") {
    return NextResponse.json(
      { error: "Field \"path\" is required and must be a non-empty string." },
      { status: 422 }
    );
  }

  const bucket = body.bucket.trim();
  const path = body.path.trim();
  const expiresIn =
    typeof body.expiresIn === "number" && body.expiresIn > 0
      ? Math.floor(body.expiresIn)
      : DEFAULT_EXPIRES_IN;

  try {
    const { url } = await getSignedUrl(bucket, path, expiresIn);

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return NextResponse.json({ url, expiresAt });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate signed URL.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}