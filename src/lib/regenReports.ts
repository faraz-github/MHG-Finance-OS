// src/lib/regenReports.ts
// =============================================================================
// MehmanGhar Financial OS — Report Regeneration Library
//
// Server-side port of regenReportsFromOps() from mg-finance-os.html.
//
// Called after every write to bookings, daily-expenses, or monthly-entry.
// Also called after a Restore operation.
//
// Algorithm (verbatim from HTML regenReportsFromOps):
//   1. Group bookings by pid+month+year → revenue, roomRev, nights, channels
//      Cross-month bookings are split pro-rata — remainder in last month.
//   2. Group daily expenses by pid+month+year → total + expCats breakdown
//   3. Union all pid+month+year keys
//   4. For each key: call calcF() with property comm + capital base
//   5. Upsert Report rows. Preserve existing IDs (payout linking).
//   6. Delete auto-generated reports whose underlying data was removed.
//
// Capital base: property.capital (mirrors getCapitalBase in the HTML).
// =============================================================================

import { prisma } from "@/lib/db";
import { calcF } from "@/lib/finance";
import { Prisma } from "@/generated/prisma/client/client";

// ---------------------------------------------------------------------------
// Month name lookup (for report titles)
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ---------------------------------------------------------------------------
// regenReports — main export
// ---------------------------------------------------------------------------

export interface RegenResult {
  reports_written: number;
  reports_deleted: number;
}

export async function regenReports(): Promise<RegenResult> {
  // ── 1. Load all raw data ─────────────────────────────────────────────────
  // Separate awaits so TypeScript infers each Prisma select type precisely.
  const bookings = await prisma.booking.findMany({
    select: {
      property_id: true,
      check_in: true,
      nights: true,
      revenue: true,
      room_amount: true,
      platform: true,
    },
  });

  const dailyExpenses = await prisma.dailyExpense.findMany({
    select: {
      property_id: true,
      expense_date: true,
      category: true,
      amount: true,
    },
  });

  const properties = await prisma.property.findMany({
    select: { id: true, comm: true, broker_pct: true, broker_public: true },
  });

  // Load investors to compute capital base per property.
  // Capital base = sum of investor.capital for investors linked to that property.
  // This matches the report structure: total investment is the sum across all investors.
  const investors = await prisma.investor.findMany({
    select: { property_id: true, capital: true },
  });

  const existingReports = await prisma.report.findMany({
    select: { id: true, property_id: true, month: true, year: true, data: true },
  });

  // ── 2. Build O(1) lookups ────────────────────────────────────────────────
  // Capital base per property = sum of linked investor capitals.
  // If no investors are linked, capital = 0 → calcROI returns null → ROI shows N/A.
  const investorCapitalMap = new Map<string, number>();
  for (const inv of investors) {
    const current = investorCapitalMap.get(inv.property_id) ?? 0;
    investorCapitalMap.set(inv.property_id, current + Number(inv.capital));
  }

  const propMap = new Map<string, { comm: number; effectiveComm: number; mgComm: number; brokerComm: number; capital: number }>();
  for (const p of properties) {
    const comm      = Number(p.comm);
    const brokerPct = Number(p.broker_pct) || 0;
    const brokerPub = p.broker_public ?? false;
    // effectiveComm is what gets passed to calcF — includes broker when broker_public
    // When broker is private, MHG absorbs the broker cut internally; investors still
    // see only MHG's comm% on investor-facing pages.
    const effectiveComm = brokerPub ? comm + brokerPct : comm;
    propMap.set(p.id, {
      comm,
      effectiveComm,
      // These are stored in the report for the commission breakdown display
      mgComm:     comm,
      brokerComm: brokerPub ? brokerPct : 0,
      capital: investorCapitalMap.get(p.id) ?? 0,
    });
  }

  // Existing report id lookup: "pid_month_year" → report.id
  const existingRepMap = new Map<string, string>();
  for (const r of existingReports) {
    if (r.property_id && r.month) {
      existingRepMap.set(`${r.property_id}_${r.month}_${r.year}`, r.id);
    }
  }

  // ── 3. Group bookings by pid+month+year (verbatim HTML logic) ────────────
  interface RevEntry {
    pid: string;
    month: number;
    year: number;
    rev: number;
    roomRev: number;
    nights: number;
    days: number;
    channels: Record<string, number>;
  }

  const revMap = new Map<string, RevEntry>();

  function addRevToMonth(
    pid: string,
    m: number,
    y: number,
    rev: number,
    roomRev: number,
    nights: number,
    source: string
  ) {
    const key = `${pid}_${m}_${y}`;
    if (!revMap.has(key)) {
      revMap.set(key, {
        pid, month: m, year: y,
        rev: 0, roomRev: 0, nights: 0,
        days: new Date(y, m, 0).getDate(), // calendar days in month
        channels: {},
      });
    }
    const entry = revMap.get(key)!;
    entry.rev += rev;
    entry.roomRev += roomRev;
    entry.nights += nights;
    const src = source || "Other";
    entry.channels[src] = (entry.channels[src] ?? 0) + nights;
  }

  for (const b of bookings) {
    if (!b.check_in || !b.property_id) continue;
    const checkIn = b.check_in instanceof Date ? b.check_in : new Date(b.check_in);
    if (isNaN(checkIn.getTime())) continue;

    const totalNights = b.nights ?? 0;
    const totalAmt = Number(b.revenue ?? 0);
    const totalRoom = b.room_amount ? Number(b.room_amount) : totalAmt;
    const source = b.platform ?? "Other";

    if (totalNights <= 0) {
      // Event or zero-night booking — assign to check-in month
      addRevToMonth(
        b.property_id,
        checkIn.getUTCMonth() + 1,
        checkIn.getUTCFullYear(),
        totalAmt, totalRoom, 0, source
      );
      continue;
    }

    // Split cross-month booking pro-rata — remainder to last month
    let nightsLeft = totalNights;
    let revLeft = totalAmt;
    let roomLeft = totalRoom;
    const perNightRev = totalAmt / totalNights;
    const perNightRoom = totalRoom / totalNights;
    let cursor = new Date(Date.UTC(
      checkIn.getUTCFullYear(),
      checkIn.getUTCMonth(),
      checkIn.getUTCDate()
    ));

    while (nightsLeft > 0) {
      const cm = cursor.getUTCMonth() + 1;
      const cy = cursor.getUTCFullYear();
      const daysInMonth = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
      const nightsThisMonth = Math.min(
        nightsLeft,
        daysInMonth - cursor.getUTCDate() + 1
      );
      nightsLeft -= nightsThisMonth;
      // Last chunk gets remainder — no rounding drift
      const revThisMonth =
        nightsLeft <= 0 ? revLeft : Math.round(perNightRev * nightsThisMonth);
      const roomThisMonth =
        nightsLeft <= 0 ? roomLeft : Math.round(perNightRoom * nightsThisMonth);
      addRevToMonth(
        b.property_id, cm, cy,
        revThisMonth, roomThisMonth, nightsThisMonth, source
      );
      revLeft -= revThisMonth;
      roomLeft -= roomThisMonth;
      cursor = new Date(Date.UTC(cy, cm, 1)); // 1st of next month
    }
  }

  // ── 4. Group expenses by pid+month+year ──────────────────────────────────
  interface ExpEntry {
    total: number;
    cats: Record<string, number>;
  }

  const expMap = new Map<string, ExpEntry>();

  for (const e of dailyExpenses) {
    if (!e.expense_date || !e.property_id) continue;
    const d = e.expense_date instanceof Date ? e.expense_date : new Date(e.expense_date);
    if (isNaN(d.getTime())) continue;
    const m = d.getUTCMonth() + 1;
    const y = d.getUTCFullYear();
    const key = `${e.property_id}_${m}_${y}`;
    if (!expMap.has(key)) expMap.set(key, { total: 0, cats: {} });
    const entry = expMap.get(key)!;
    entry.total += Number(e.amount ?? 0);
    const cat = (e.category || "other").toLowerCase();
    entry.cats[cat] = (entry.cats[cat] ?? 0) + Number(e.amount ?? 0);
  }

  // ── 5. Union all keys ────────────────────────────────────────────────────
  const allKeys = new Set([...revMap.keys(), ...expMap.keys()]);

  // ── 6. Build report upsert payloads via calcF ────────────────────────────
  interface UpsertPayload {
    id: string;
    property_id: string;
    month: number;
    year: number;
    title: string;
    period_type: string;
    data: Prisma.InputJsonValue;
  }

  const upserts: UpsertPayload[] = [];
  const validKeys = new Set<string>();

  for (const key of allKeys) {
    const rv = revMap.get(key);
    const ex = expMap.get(key);

    let pid: string, month: number, year: number;
    if (rv) {
      pid = rv.pid; month = rv.month; year = rv.year;
    } else {
      const parts = key.split("_");
      pid = parts[0]; month = Number(parts[1]); year = Number(parts[2]);
    }

    const prop = propMap.get(pid);
    if (!prop) continue; // Property deleted — skip orphaned data

    const rev = rv?.rev ?? 0;
    const roomRev = rv?.roomRev ?? rev;
    const exp = ex?.total ?? 0;
    const nights = rv?.nights ?? 0;
    const days = rv?.days ?? new Date(year, month, 0).getDate();
    const channels = rv?.channels ?? {};
    const expCats = ex?.cats ?? {};

    const f = calcF(rev, exp, prop.effectiveComm, nights, days, prop.capital, roomRev);

    // mgComm = MHG-only portion; brokerComm = broker portion (0 when private)
    // Both derived from the total commission using the stored percentages.
    const totalCommPct = prop.effectiveComm;
    const mgCommAmt    = totalCommPct > 0
      ? Math.round(f.commission * (prop.mgComm / totalCommPct))
      : f.commission;
    const brokerCommAmt = f.commission - mgCommAmt;

    // Preserve existing ID so payout.report_id links remain valid
    const existingId = existingRepMap.get(key);
    const repId = existingId ?? `ar_${pid}_${month}_${year}`;

    upserts.push({
      id: repId,
      property_id: pid,
      month,
      year,
      title: `${MONTH_NAMES[month] ?? String(month)} ${year}`,
      period_type: "monthly",
      data: {
        rev: f.rev,
        roomRev: f.roomRev,
        exp: f.exp,
        opProfit: f.opProfit,
        commission: f.commission,   // total (MHG + broker when public)
        mgComm:     mgCommAmt,      // MHG portion only
        brokerComm: brokerCommAmt,  // broker portion (0 when private)
        invProfit: f.invProfit,
        nights,
        days,
        occ: f.occ,
        roi: f.roi,
        adr: f.adr,
        revpar: f.revpar,
        channels,
        expCats,
        _hasCapital: f._hasCapital,
        _autoGen: true,
      },
    });

    validKeys.add(key);
  }

  // ── 7. Identify stale auto-generated reports to delete ───────────────────
  // Only remove reports flagged with _autoGen:true that have no current data.
  // Manually-created reports (no _autoGen flag) are never deleted.
  const staleIds: string[] = [];
  for (const r of existingReports) {
    if (!r.property_id || !r.month) continue;
    // Skip manually-created reports — only auto-generated ones are managed here
    const data = r.data as Record<string, unknown> | null;
    if (!data?._autoGen) continue;
    const key = `${r.property_id}_${r.month}_${r.year}`;
    if (!validKeys.has(key)) {
      staleIds.push(r.id);
    }
  }

  // ── 8. Persist: delete stale, upsert current ─────────────────────────────
  // Sequential calls instead of $transaction — regen is a full rebuild,
  // not a partial update, so atomicity is not required here.
  if (staleIds.length > 0) {
    await prisma.report.deleteMany({ where: { id: { in: staleIds } } });
  }
  for (const u of upserts) {
    await prisma.report.upsert({
      where: { id: u.id },
      update: { title: u.title, data: u.data },
      create: {
        id: u.id,
        property_id: u.property_id,
        month: u.month,
        year: u.year,
        title: u.title,
        period_type: u.period_type,
        data: u.data,
      },
    });
  }

  return {
    reports_written: upserts.length,
    reports_deleted: staleIds.length,
  };
}
