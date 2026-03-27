// src/app/(dashboard)/insights/page.tsx
//
// Smart Insights page — Server Component shell.
//
// Fetches: Report rows, Property rows, and the current-period targets
// from the UtilsSetting table (key = `targets_${year}_${month}`).
//
// HTML source: <div class="page" id="page-insights"> + rndInsights()
//              + genInsights() + saveTargets()
//
// Targets storage decision:
//   HTML:         localStorage key `mhg_targets_${cY}_${cM}`
//   Full-stack:   UtilsSetting table, key = `targets_${year}_${month}`
//   No schema change needed — UtilsSetting already exists with (key, value Json).

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { InsightsClient } from './InsightsClient';
import type { SerializableReport } from '../dashboard/page';
import type { SerializableProperty } from '../properties/page';

export default async function InsightsPage() {
  // ── Session + permissions ─────────────────────────────────────────────────
  const cookieName = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value ?? '';
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  const rolePerms = await getRolePermissions(session.role);
  const tabPerms  = rolePerms?.tabPermissions ?? {};
  if (tabPerms['insights'] !== true) redirect('/dashboard');

  // ── Current period defaults (server-side — matches Zustand defaults) ───────
  // The Zustand store derives cM/cY from new Date() on the client.
  // We use the same logic here so the pre-fetched targets match.
  const now = new Date();
  const cM  = now.getMonth() + 1;
  const cY  = now.getFullYear();

  // ── Fetch targets for current period ──────────────────────────────────────
  // Key pattern: `targets_${year}_${month}` — same as /api/targets POST handler
  const targetKey = `targets_${cY}_${cM}`;
  let initialTargets: Record<string, number> = {};
  try {
    const setting = await prisma.utilsSetting.findUnique({
      where: { key: targetKey },
    });
    if (setting?.value && typeof setting.value === 'object') {
      initialTargets = setting.value as Record<string, number>;
    }
  } catch {
    // UtilsSetting may not have this key yet — initialTargets stays {}
  }

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
      invProfit:  Number(d.invProfit  ?? 0),
      nights:     Number(d.nights     ?? 0),
      days:       Number(d.days       ?? 0),
      occ:        Number(d.occ        ?? 0),
      roi:        Number(d.roi        ?? 0),
      adr:        Number(d.adr        ?? 0),
      revpar:     Number(d.revpar     ?? 0),
      channels:   (d.channels as Record<string, number>) ?? {},
      expCats:    (d.expCats  as Record<string, number>) ?? {},
    }];
  });

  // ── Fetch properties ──────────────────────────────────────────────────────
  const rawProps = await prisma.property.findMany({
    select: { id: true, name: true, address: true, city: true, state: true, comm: true, capital: true, type: true, rooms: true, assets: true },
    orderBy: { name: 'asc' },
  });

  const properties: SerializableProperty[] = rawProps.map((p) => ({
    id:      p.id,
    name:    p.name,
    city:    p.city ?? '',
    state:   p.state ?? '',
    comm:    Number(p.comm) || 25,
    capital: Number(p.capital) || 0,
    address: p.address,
    type:    p.type ?? '',
    rooms:   Number(p.rooms) || 0,
    assets:  (p.assets as SerializableProperty['assets']) ?? [],
  }));

  return (
    <InsightsClient
      reports={reports}
      properties={properties}
      initialTargets={initialTargets}
    />
  );
}