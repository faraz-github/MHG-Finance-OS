// src/app/(dashboard)/cashflow/page.tsx
//
// Cash Flow page — Server Component shell.
//
// Fetches Report rows + Property rows and passes both to <CashFlowClient />.
// Properties are needed so the PageFilterBar can populate city/property
// dropdowns and propById can resolve city+comm for filter logic.

import { prisma } from '@/lib/db';
import type { SerializableReport } from '../dashboard/page';
import type { SerializableProperty } from '../properties/page';
import { CashFlowClient } from './CashFlowClient';

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
      invProfit:  Number(d.invProfit   ?? 0),
      nights:     Number(d.nights      ?? 0),
      days:       Number(d.days        ?? 0),
      occ:        Number(d.occ         ?? 0),
      roi:        Number(d.roi         ?? 0),
      adr:        Number(d.adr         ?? 0),
      revpar:     Number(d.revpar      ?? 0),
      channels:   (d.channels as Record<string, number>) ?? {},
      expCats:    (d.expCats  as Record<string, number>) ?? {},
    }];
  });

  // ── Fetch properties (needed for city/property filter dropdowns) ──────────
  const rawProps = await prisma.property.findMany({
    select: { id: true, name: true, city: true, comm: true, capital: true },
    orderBy: { name: 'asc' },
  });

  const properties: SerializableProperty[] = rawProps.map((p) => ({
    id:      p.id,
    name:    p.name,
    city:    p.city ?? '',
    state:   '',
    comm:    Number(p.comm)    || 25,
    capital: Number(p.capital) || 0,
    address: null,
    type:    '',
    rooms:   0,
    assets:  [],
  }));

  return <CashFlowClient reports={reports} properties={properties} />;
}
