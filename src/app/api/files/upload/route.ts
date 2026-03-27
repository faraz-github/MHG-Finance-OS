// src/app/api/files/upload/route.ts
// =============================================================================
// MehmanGhar Financial OS — File Upload Route
//
// POST — upload a file to Supabase Storage via storage.ts adapter.
//        Accepts multipart/form-data with fields:
//          file        — the file blob
//          bucket      — storage bucket name (default: "mg-finance-os")
//          path        — full storage path (e.g. invoices/prop-id/2025/03/exp-id.jpg)
//
// Returns: { path: string }
//
// Enforces:
//   - Max file size: 5 MB (enforced server-side)
//   - Allowed MIME types: image/jpeg, image/png, image/webp, application/pdf
//   - Authentication: any logged-in role (role header checked)
//   - Only calls uploadFile() from storage.ts — never imports supabase-js
//
// v3 plan Section 3.1 + 3.4: invoice_path stored in DB, signed URLs generated
// on demand by /api/files/signed-url route.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { uploadFile } from "@/lib/storage";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BYTES     = 5 * 1024 * 1024; // 5 MB
const DEFAULT_BUCKET = "mg-finance-os";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface UploadResponse {
  path: string;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<UploadResponse | ErrorResponse>> {
  // Any authenticated role may upload — proxy.ts guarantees auth.
  const role = request.headers.get("x-user-role") ?? "";
  if (!role) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data body." },
      { status: 400 }
    );
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json(
      { error: "Field \"file\" is required and must be a file." },
      { status: 422 }
    );
  }

  const pathEntry = formData.get("path");
  if (typeof pathEntry !== "string" || pathEntry.trim() === "") {
    return NextResponse.json(
      { error: "Field \"path\" is required and must be a non-empty string." },
      { status: 422 }
    );
  }

  const bucket =
    typeof formData.get("bucket") === "string" && (formData.get("bucket") as string).trim()
      ? (formData.get("bucket") as string).trim()
      : DEFAULT_BUCKET;

  const storagePath = pathEntry.trim();
  const contentType = fileEntry.type || "application/octet-stream";

  // ── Validate MIME type ─────────────────────────────────────────────────────
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `File type "${contentType}" is not allowed. Accepted: JPEG, PNG, WebP, PDF.` },
      { status: 422 }
    );
  }

  // ── Validate file size ─────────────────────────────────────────────────────
  const arrayBuffer = await fileEntry.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds 5 MB limit (received ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB).` },
      { status: 422 }
    );
  }

  const buffer = Buffer.from(arrayBuffer);

  // ── Upload via storage adapter ─────────────────────────────────────────────
  try {
    const { path: confirmedPath } = await uploadFile(bucket, storagePath, buffer, contentType);
    return NextResponse.json({ path: confirmedPath }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
