// src/app/(dashboard)/cashflow/page.tsx
//
// Cash Flow page — Server Component shell.
// Fetches Report rows + Property rows (id, name, city, comm only — used for
// filter dropdowns and propById lookup). Capital base from investor sum.

import { prisma } from '@/lib/db';
import type { SerializableReport } from '../dashboard/page';
import { CashFlowClient } from './CashFlowClient';
import type { CashFlowProperty } from './CashFlowClient';

export default async function CashFlowPage() {
  // ── Fetch reports ─────────────────────────────────────────────────────────
  const rawReports = await prisma.report.findMany({
    select: {
      id: true,
      property_id: true,
      month: true,
      year: true,
      data: true,
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  const reports: SerializableReport[] = rawReports.flatMap((r) => {
    if (!r.property_id || !r.month) return [];
    const d = r.data as Record<string, unknown>;
    return [{
      id:         r.id,
      pid:        r.property_id,
      month:      r.month,
      year:       r.year,
      rev:        Number(d.rev         ?? 0),
      roomRev:    Number(d.roomRev     ?? d.rev ?? 0),
      exp:        Number(d.exp         ?? 0),
      opProfit:   Number(d.opProfit    ?? 0),
      commission: Number(d.commission  ?? 0),
      mgComm:     Number(d.mgComm     ?? d.commission ?? 0),
      brokerComm: Number(d.brokerComm  ?? 0),
      invProfit:  Number(d.invProfit   ?? 0),
      nights:     Number(d.nights      ?? 0),
      days:       Number(d.days        ?? 0),
      occ:        Number(d.occ         ?? 0),
      roi:        Number(d.roi         ?? 0),
      adr:        Number(d.adr         ?? 0),
      revpar:     Number(d.revpar      ?? 0),
      channels:    (d.channels as Record<string, number>) ?? {},
      expCats:     (d.expCats  as Record<string, number>) ?? {},
      _hasCapital: Boolean(d._hasCapital),
    }];
  });

  // ── Fetch properties — only id, name, city, comm needed ──────────────────
  const rawProps = await prisma.property.findMany({
    select: { id: true, name: true, city: true, comm: true },
    orderBy: { name: 'asc' },
  });

  // Capital base = sum of investor.capital per property (consistent with
  // regenReports, dashboard, and properties page).
  const rawInvestorCapitals = await prisma.investor.findMany({
    select: { property_id: true, capital: true },
  });
  const investorCapitalMap: Record<string, number> = {};
  for (const inv of rawInvestorCapitals) {
    investorCapitalMap[inv.property_id] = (investorCapitalMap[inv.property_id] ?? 0) + Number(inv.capital);
  }

  const properties: CashFlowProperty[] = rawProps.map((p) => ({
    id:      p.id,
    name:    p.name,
    city:    p.city ?? '',
    comm:    Number(p.comm) || 25,
    capital: investorCapitalMap[p.id] ?? 0,
  }));

  return <CashFlowClient reports={reports} properties={properties} />;
}
