// src/app/api/payouts/sync/route.ts
// =============================================================================
// MehmanGhar Financial OS — Payouts Sync Route
//
// POST — creates missing payout records for each investor by reading existing
//        Report records. If a report exists for a property+year+month and an
//        investor has no payout record for that period, one is created as
//        pending with amount_owed = 0 (to be filled manually or via recalc).
//
// This is the "Sync from Reports" button in PayoutsClient.
// SuperAdmin only.
//
// No financial calculations — does NOT call finance.ts.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, RoleRequiredError } from "@/lib/permissions";

interface SyncResponse {
  count: number;
  message: string;
}

interface ErrorResponse {
  error: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<SyncResponse | ErrorResponse>> {
  const role = request.headers.get("x-user-role") ?? "";

  try {
    requireRole(role, ["SuperAdmin"]);
  } catch (err) {
    if (err instanceof RoleRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }

  try {
    // Fetch all monthly/quarterly reports with a property_id
    const reports = await prisma.report.findMany({
      where: {
        property_id: { not: null },
        period_type: { in: ["monthly", "quarterly"] },
        month: { not: null },
      },
      select: {
        property_id: true,
        year: true,
        month: true,
      },
    });

    if (reports.length === 0) {
      return NextResponse.json({ count: 0, message: "No monthly reports found to sync from." });
    }

    // Fetch all investors
    const investors = await prisma.investor.findMany({
      select: { id: true, property_id: true },
    });

    // Fetch existing payout combinations to avoid duplicates
    const existingPayouts = await prisma.payout.findMany({
      select: { investor_id: true, year: true, month: true },
    });

    const existingSet = new Set(
      existingPayouts.map((p) => `${p.investor_id}:${p.year}:${p.month}`)
    );

    // Build list of missing payout records
    const toCreate: Array<{
      property_id: string;
      investor_id: string;
      year: number;
      month: number;
      amount_owed: number;
    }> = [];

    for (const report of reports) {
      if (!report.property_id || !report.month) continue;
      const propertyInvestors = investors.filter(
        (inv) => inv.property_id === report.property_id
      );
      for (const inv of propertyInvestors) {
        const key = `${inv.id}:${report.year}:${report.month}`;
        if (!existingSet.has(key)) {
          toCreate.push({
            property_id: report.property_id,
            investor_id: inv.id,
            year: report.year,
            month: report.month,
            amount_owed: 0,
          });
          existingSet.add(key); // prevent duplicates within this batch
        }
      }
    }

    if (toCreate.length === 0) {
      return NextResponse.json({
        count: 0,
        message: "All payout records are already up to date.",
      });
    }

    await prisma.payout.createMany({ data: toCreate });

    return NextResponse.json({
      count: toCreate.length,
      message: `${toCreate.length} payout record(s) created. Set amount_owed via recalculate or manually.`,
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}