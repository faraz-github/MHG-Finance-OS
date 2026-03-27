// src/lib/storage.ts
// =============================================================================
// MehmanGhar Financial OS — Storage Provider Abstraction Layer
//
// v3 plan Section 6.3: This module is the ONLY place that calls Supabase
// Storage SDK methods. All callers (upload API route, signed-url API route)
// use the three exported functions below — they never import
// @supabase/supabase-js directly.
//
// If Supabase Storage is replaced with S3, R2, or another provider in the
// future, only this file changes. All callers continue to work without
// modification (v3 plan Section 6.1).
//
// Functions:
//   uploadFile    — upload a Buffer to a bucket at a given path
//   getSignedUrl  — generate a time-limited signed URL for a stored file
//   deleteFile    — remove a file from storage
//
// File display behaviour (v3 plan Section 3.2):
//   Signed URLs are generated on demand, not stored in the database.
//   The database stores the storage path only (e.g. invoices/prop-id/2025/03/exp-id.jpg).
//   URL expiry is controlled by the caller (suggested: 60 seconds per v3 Section 12).
// =============================================================================

import { supabaseAdmin } from "./supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadResult {
  path: string;
}

export interface SignedUrlResult {
  url: string;
}

// ---------------------------------------------------------------------------
// uploadFile
// ---------------------------------------------------------------------------

/**
 * Uploads a file Buffer to the specified bucket at the given path.
 *
 * @param bucket      - Supabase Storage bucket name (e.g. "mg-finance-os")
 * @param path        - Storage path within the bucket (e.g. "invoices/prop-123/2025/03/exp-456.jpg")
 * @param file        - File contents as a Node.js Buffer
 * @param contentType - MIME type (e.g. "image/jpeg", "application/pdf")
 * @returns           - The confirmed storage path
 *
 * Storage path convention (v3 plan Section 3.4):
 *   invoices/[property_id]/[year]/[month]/[expense_id].[ext]
 *   properties/[property_id]/photo.[ext]  (future scope)
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: Buffer,
  contentType: string
): Promise<UploadResult> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, file, {
      contentType,
      upsert: true, // overwrite if the same expense is re-uploaded
    });

  if (error) {
    throw new Error(`[storage] uploadFile failed at "${path}": ${error.message}`);
  }

  return { path: data.path };
}

// ---------------------------------------------------------------------------
// getSignedUrl
// ---------------------------------------------------------------------------

/**
 * Generates a time-limited signed URL for a private bucket file.
 *
 * Signed URLs are generated on demand by the API route — never stored in
 * the database. The database stores only the storage path.
 *
 * @param bucket    - Supabase Storage bucket name
 * @param path      - Storage path within the bucket (as stored in DB)
 * @param expiresIn - URL validity window in seconds (suggested: 60 — v3 Section 12)
 * @returns         - The time-limited signed URL
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number
): Promise<SignedUrlResult> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(
      `[storage] getSignedUrl failed for "${path}": ${error.message}`
    );
  }

  if (!data?.signedUrl) {
    throw new Error(
      `[storage] getSignedUrl returned no URL for "${path}".`
    );
  }

  return { url: data.signedUrl };
}

// ---------------------------------------------------------------------------
// deleteFile
// ---------------------------------------------------------------------------

/**
 * Removes a file from storage.
 *
 * Called when a DailyExpense record is deleted and an invoice_path exists.
 * The caller is responsible for ensuring the DB record is deleted after
 * (or in the same transaction as) the storage deletion.
 *
 * @param bucket - Supabase Storage bucket name
 * @param path   - Storage path within the bucket (as stored in DB)
 */
export async function deleteFile(
  bucket: string,
  path: string
): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    throw new Error(
      `[storage] deleteFile failed for "${path}": ${error.message}`
    );
  }
}