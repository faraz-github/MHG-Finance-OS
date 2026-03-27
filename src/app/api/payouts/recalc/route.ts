// src/app/api/payouts/recalc/route.ts
// =============================================================================
// MehmanGhar Financial OS — Payouts Recalculate Route
//
// POST — updates amount_owed on all PENDING payout records by reading the
//        corresponding Report's stored data JSON.
//
// The Report.data JSON is the raw calcF() output stored at report creation
// time. This route reads the investor_profit value from that stored output
// (keyed by investor_id) and sets it as amount_owed on the pending payout.
//
// This does NOT call finance.ts — it reads pre-computed values already
// stored in the reports table. The calculation was done when the report
// was created via POST /api/reports.
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
    // Fetch all pending payouts (amount_paid IS NULL)
    const pendingPayouts = await prisma.payout.findMany({
      where: { amount_paid: null },
      select: {
        id: true,
        property_id: true,
        investor_id: true,
        year: true,
        month: true,
      },
    });

    if (pendingPayouts.length === 0) {
      return NextResponse.json({
        updated: 0,
        message: "No pending payouts to recalculate.",
      });
    }

    // Fetch relevant reports (monthly, with property_id)
    const reports = await prisma.report.findMany({
      where: {
        property_id: { not: null },
        period_type: "monthly",
        month: { not: null },
      },
      select: {
        property_id: true,
        year: true,
        month: true,
        data: true,
      },
    });

    // Build a lookup: "property_id:year:month" → report data
    const reportMap = new Map<string, unknown>();
    for (const r of reports) {
      if (r.property_id && r.month) {
        reportMap.set(`${r.property_id}:${r.year}:${r.month}`, r.data);
      }
    }

    let updatedCount = 0;

    for (const payout of pendingPayouts) {
      const key = `${payout.property_id}:${payout.year}:${payout.month}`;
      const reportData = reportMap.get(key);
      if (!reportData || typeof reportData !== "object" || reportData === null) continue;

      // Report data shape from calcF(): may include investors array or
      // investor_profits map. We look for common shapes used by the HTML.
      // Shape 1: { investors: [{ id, profit }] }
      // Shape 2: { investorProfits: { [investor_id]: number } }
      const data = reportData as Record<string, unknown>;

      let newAmountOwed: number | null = null;

      if (Array.isArray(data.investors)) {
        const match = (data.investors as Array<Record<string, unknown>>).find(
          (inv) => inv.id === payout.investor_id || inv.investor_id === payout.investor_id
        );
        if (match && typeof match.profit === "number") {
          newAmountOwed = match.profit;
        } else if (match && typeof match.investor_profit === "number") {
          newAmountOwed = match.investor_profit;
        }
      }

      if (
        newAmountOwed === null &&
        typeof data.investorProfits === "object" &&
        data.investorProfits !== null
      ) {
        const profits = data.investorProfits as Record<string, number>;
        if (typeof profits[payout.investor_id] === "number") {
          newAmountOwed = profits[payout.investor_id];
        }
      }

      if (newAmountOwed === null) continue;

      await prisma.payout.update({
        where: { id: payout.id },
        data: { amount_owed: newAmountOwed },
      });
      updatedCount++;
    }

    return NextResponse.json({
      updated: updatedCount,
      message:
        updatedCount > 0
          ? `${updatedCount} pending payout(s) recalculated from stored report data.`
          : "No matching report data found for pending payouts. Ensure reports have been generated first.",
    });
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}