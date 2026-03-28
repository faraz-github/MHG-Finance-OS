// src/app/api/payouts/recalc/route.ts
// =============================================================================
// MehmanGhar Financial OS — Payouts Recalculate Route
//
// POST — updates amount_owed on all PENDING payout records.
//
// Formula (matches Investors page + regenReports):
//   amount_owed = report.data.invProfit × (investor.share_pct / 100)
//
// report.data.invProfit = property-level investor pool after MHG commission.
// investor.share_pct    = this investor's % share of that pool.
//
// SuperAdmin only.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, RoleRequiredError } from "@/lib/permissions";

interface RecalcResponse {
  updated: number;
  message: string;
}

interface ErrorResponse {
  error: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<RecalcResponse | ErrorResponse>> {
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
    // ── 1. Load all pending payouts ─────────────────────────────────────────
    const pendingPayouts = await prisma.payout.findMany({
      where: { amount_paid: null },
      select: {
        id:          true,
        property_id: true,
        investor_id: true,
        year:        true,
        month:       true,
      },
    });

    if (pendingPayouts.length === 0) {
      return NextResponse.json({
        updated: 0,
        message: "No pending payouts to recalculate.",
      });
    }

    // ── 2. Load investors — need share_pct for each ─────────────────────────
    const investorIds = [...new Set(pendingPayouts.map((p) => p.investor_id))];
    const investors = await prisma.investor.findMany({
      where: { id: { in: investorIds } },
      select: { id: true, share_pct: true },
    });
    const investorMap = new Map<string, number>();
    for (const inv of investors) {
      investorMap.set(inv.id, Number(inv.share_pct));
    }

    // ── 3. Load monthly reports — need invProfit from data JSON ────────────
    const propertyIds = [...new Set(pendingPayouts.map((p) => p.property_id))];
    const reports = await prisma.report.findMany({
      where: {
        property_id: { in: propertyIds },
        period_type: "monthly",
        month:       { not: null },
      },
      select: {
        property_id: true,
        year:        true,
        month:       true,
        data:        true,
      },
    });

    // Build lookup: "property_id:year:month" → invProfit
    const invProfitMap = new Map<string, number>();
    for (const r of reports) {
      if (!r.property_id || !r.month) continue;
      const data = r.data as Record<string, unknown>;
      const invProfit = typeof data.invProfit === "number" ? data.invProfit : 0;
      invProfitMap.set(`${r.property_id}:${r.year}:${r.month}`, invProfit);
    }

    // ── 4. Update each pending payout ───────────────────────────────────────
    let updatedCount = 0;

    for (const payout of pendingPayouts) {
      const sharePct   = investorMap.get(payout.investor_id) ?? 0;
      const invProfit  = invProfitMap.get(
        `${payout.property_id}:${payout.year}:${payout.month}`
      ) ?? null;

      // Skip if no report exists for this period or investor has no share_pct
      if (invProfit === null || sharePct <= 0) continue;

      // Per-investor amount = property investor pool × their profit share %
      const amountOwed = +(invProfit * (sharePct / 100)).toFixed(2);

      await prisma.payout.update({
        where: { id: payout.id },
        data:  { amount_owed: amountOwed },
      });
      updatedCount++;
    }

    return NextResponse.json({
      updated: updatedCount,
      message: updatedCount > 0
        ? `${updatedCount} pending payout(s) recalculated.`
        : "No matching report data found. Ensure reports exist for the relevant periods.",
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
