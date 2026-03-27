// src/app/api/regen-reports/route.ts
// =============================================================================
// MehmanGhar Financial OS — Report Regeneration Endpoint
//
// POST — Triggers a full report regeneration from current bookings + expenses.
//        Delegates to src/lib/regenReports.ts.
//        Called automatically after every write to bookings, daily-expenses,
//        and monthly-entry. Also available for manual triggers (e.g. Restore).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { regenReports } from "@/lib/regenReports";

interface ErrorResponse {
  error: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  const role = request.headers.get("x-user-role") ?? "";
  if (!role) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await regenReports();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Regen failed.";
    return NextResponse.json<ErrorResponse>({ error: msg }, { status: 500 });
  }
}
