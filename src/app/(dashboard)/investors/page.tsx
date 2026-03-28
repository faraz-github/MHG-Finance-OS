// src/app/(dashboard)/investors/page.tsx
//
// Investors page — Server Component shell.
// Fetches investors, properties, and reports; computes ROI server-side
// using calcROI() from src/lib/finance.ts.
//
// HTML source: <div class="page" id="page-investors"> + rndInvs() +
//              computeInvestorROI()
//
// ─── SCHEMA GAPS ──────────────────────────────────────────────────────────
// 1. Investor.contact / Investor.email — not in schema. Mapped to notes
//    (the only free-text field available). Add contact + email columns in
//    the Phase 5 evaluation migration.
// 2. Investor.property_id (single FK) vs HTML's pids[] (multi-property).
//    v1 treats property_id as the single linked property. Multi-property
//    linking is a v2 schema change.
// ──────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { calcROI } from '@/lib/finance';
import { InvestorsClient } from './InvestorsClient';
import type { SerializableProperty } from '../properties/page';
import type { SerializableReport } from '../dashboard/page';

// ---------------------------------------------------------------------------
// Exported type — used by InvestorsClient
// ---------------------------------------------------------------------------

export interface SerializableInvestor {
  id: string;
  name: string;
  /** Investor contact — phone or email */
  contact: string;
  capital: number;
  sharePct: number;
  propertyId: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InvestorsPage() {
  // ── Session ───────────────────────────────────────────────────────────────
  const cookieName = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value ?? '';
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  // ── Permissions ───────────────────────────────────────────────────────────
  const rolePerms = await getRolePermissions(session.role);
  const tabPerms  = rolePerms?.tabPermissions  ?? {};
  const crudPerms = rolePerms?.crudPermissions ?? {};
  if (tabPerms['investors'] !== true) redirect('/dashboard');

  const canCreate = crudPerms['investors']?.create === true;
  const canEdit   = crudPerms['investors']?.update === true;
  const canDelete = crudPerms['investors']?.delete === true;

  // ── Fetch investors ───────────────────────────────────────────────────────
  const rawInvestors = await prisma.investor.findMany({
    select: {
      id:          true,
      name:        true,
      contact:     true,
      capital:     true,
      share_pct:   true,
      property_id: true,
    },
    orderBy: { name: 'asc' },
  });

  const investors: SerializableInvestor[] = rawInvestors.map((i) => ({
    id:         i.id,
    name:       i.name,
    contact:    i.contact ?? '',
    capital:    Number(i.capital),
    sharePct:   Number(i.share_pct),
    propertyId: i.property_id,
  }));

  // ── Fetch properties (for modal + table display) ──────────────────────────
  const rawProps = await prisma.property.findMany({
    select: {
      id: true, name: true, address: true, city: true, state: true,
      comm: true, capital: true, type: true, rooms: true, assets: true,
      broker_name: true, broker_pct: true, broker_public: true,
    },
    orderBy: { name: 'asc' },
  });

  const properties: SerializableProperty[] = rawProps.map((p) => {
    const comm      = Number(p.comm)       || 25;
    const brokerPct = Number(p.broker_pct) || 0;
    const brokerPub = p.broker_public ?? false;
    return {
      id:            p.id,
      name:          p.name,
      city:          p.city ?? '',
      state:         p.state ?? '',
      comm,
      capital:       Number(p.capital) || 0,
      address:       p.address,
      type:          p.type ?? '',
      rooms:         Number(p.rooms) || 0,
      assets:        (p.assets as SerializableProperty['assets']) ?? [],
      broker_name:   p.broker_name ?? '',
      broker_pct:    brokerPct,
      broker_public: brokerPub,
      effectiveComm: brokerPub ? comm + brokerPct : comm,
    };
  });

  // ── Fetch reports (for period payout + detail panel) ──────────────────────
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

  // ── computeInvestorROI ────────────────────────────────────────────────────
  // Each investor's actual profit = property invProfit × (sharePct / 100).
  // ROI = investor's actual profit / investor's own capital.
  const investorRoi: Record<string, number | null> = {};
  investors.forEach((inv) => {
    const invReps   = reports.filter((r) => r.pid === inv.propertyId);
    const totProfit = invReps.reduce((s, r) => s + r.invProfit * (inv.sharePct / 100), 0);
    investorRoi[inv.id] = calcROI(totProfit, inv.capital);
  });

  return (
    <InvestorsClient
      investors={investors}
      properties={properties}
      reports={reports}
      investorRoi={investorRoi}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  );
}