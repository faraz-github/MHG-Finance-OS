// src/lib/supabase.ts
// =============================================================================
// MehmanGhar Financial OS — Supabase JS Client Singleton
//
// This module is the ONLY place that imports @supabase/supabase-js.
// It is imported exclusively by src/lib/storage.ts — no API route or
// component may import it directly (v3 plan Section 6.1, 6.2).
//
// Uses SUPABASE_SERVICE_ROLE_KEY for admin-level storage operations.
// This key is server-side only and must never be exposed to the browser.
//
// NEXT_PUBLIC_SUPABASE_URL is read here; despite the NEXT_PUBLIC_ prefix,
// this module only runs on the server (imported by storage.ts which is
// only called from API routes).
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Global cache — prevents multiple client instances in Next.js dev hot-reload
// ---------------------------------------------------------------------------

const globalForSupabase = globalThis as unknown as {
  supabaseAdmin: SupabaseClient | undefined;
};

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

function createSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "[supabase] NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local."
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "[supabase] SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      // Disable automatic session persistence — this is a server-side admin
      // client only. There is no browser session to manage.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Exported singleton
// ---------------------------------------------------------------------------

export const supabaseAdmin: SupabaseClient =
  globalForSupabase.supabaseAdmin ?? createSupabaseAdmin();

if (process.env.NODE_ENV !== "production") {
  globalForSupabase.supabaseAdmin = supabaseAdmin;
}