// src/app/(dashboard)/expenses/page.tsx
//
// Expense Intelligence page — Server Component shell.
// Read-only analysis derived from Report.data.expCats JSON.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { ExpensesClient } from './ExpensesClient';
import type { ExpensesProperty } from './ExpensesClient';
import type { SerializableReport } from '../dashboard/page';

export default async function ExpensesPage() {
  const cookieName = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value ?? '';
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  const rolePerms = await getRolePermissions(session.role);
  const tabPerms  = rolePerms?.tabPermissions ?? {};
  if (tabPerms['expenses'] !== true) redirect('/dashboard');

  // ── Fetch reports ─────────────────────────────────────────────────────────
  const rawReports = await prisma.report.findMany({
    select: { id: true, property_id: true, month: true, year: true, data: true },
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
      rev:        Number(d.rev        ?? 0),
      roomRev:    Number(d.roomRev    ?? d.rev ?? 0),
      exp:        Number(d.exp        ?? 0),
      opProfit:   Number(d.opProfit   ?? 0),
      commission: Number(d.commission ?? 0),
      mgComm:     Number(d.mgComm     ?? d.commission ?? 0),
      brokerComm: Number(d.brokerComm  ?? 0),
      invProfit:  Number(d.invProfit  ?? 0),
      nights:     Number(d.nights     ?? 0),
      days:       Number(d.days       ?? 0),
      occ:        Number(d.occ        ?? 0),
      roi:        Number(d.roi        ?? 0),
      adr:        Number(d.adr        ?? 0),
      revpar:     Number(d.revpar     ?? 0),
      channels:    (d.channels as Record<string, number>) ?? {},
      expCats:     (d.expCats  as Record<string, number>) ?? {},
      _hasCapital: Boolean(d._hasCapital),
    }];
  });

  // ── Fetch properties — id, name, city, comm + investor capital sum ────────
  const rawProps = await prisma.property.findMany({
    select: { id: true, name: true, city: true, comm: true },
    orderBy: { name: 'asc' },
  });

  const rawInvestorCapitals = await prisma.investor.findMany({
    select: { property_id: true, capital: true },
  });
  const investorCapitalMap: Record<string, number> = {};
  for (const inv of rawInvestorCapitals) {
    investorCapitalMap[inv.property_id] = (investorCapitalMap[inv.property_id] ?? 0) + Number(inv.capital);
  }

  const properties: ExpensesProperty[] = rawProps.map((p) => ({
    id:      p.id,
    name:    p.name,
    city:    p.city ?? '',
    comm:    Number(p.comm) || 25,
    capital: investorCapitalMap[p.id] ?? 0,
  }));

  return <ExpensesClient reports={reports} properties={properties} />;
}
