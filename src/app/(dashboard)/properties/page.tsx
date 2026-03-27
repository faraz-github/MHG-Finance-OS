// src/app/(dashboard)/properties/page.tsx
// Server Component shell — fetches properties + reports + permissions.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { PropertiesClient } from './PropertiesClient';
import type { SerializableReport } from '../dashboard/page';

export type { SerializableReport };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SerializableProperty {
  id:            string;
  name:          string;
  city:          string;
  state:         string;
  comm:          number;
  capital:       number;
  address:       string | null;
  type:          string;
  rooms:         number;
  assets:        Array<{ name: string; amount: number; type: string }>;
  // Broker fields
  broker_name:   string;
  broker_pct:    number;
  broker_public: boolean;
  // Derived server-side — avoids recalculation in every component
  effectiveComm: number; // broker_public ? comm + broker_pct : comm
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PropertiesPage() {
  const cookieName  = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token       = cookieStore.get(cookieName)?.value ?? '';
  const session     = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  const rolePerms  = await getRolePermissions(session.role);
  const tabPerms   = rolePerms?.tabPermissions  ?? {};
  const crudPerms  = rolePerms?.crudPermissions ?? {};

  if (tabPerms['properties'] !== true) redirect('/dashboard');

  const canCreate = crudPerms['properties']?.create === true;
  const canEdit   = crudPerms['properties']?.update === true;
  const canDelete = crudPerms['properties']?.delete === true;

  // ── Fetch properties ──────────────────────────────────────────────────────
  const rawProps = await prisma.property.findMany({
    select: {
      id: true, name: true, address: true,
      city: true, state: true, comm: true,
      capital: true, type: true, rooms: true, assets: true,
      broker_name: true, broker_pct: true, broker_public: true,
    },
    orderBy: { name: 'asc' },
  });

  const properties: SerializableProperty[] = rawProps.map((p) => {
    const comm       = Number(p.comm)       || 25;
    const brokerPct  = Number(p.broker_pct) || 0;
    const brokerPub  = p.broker_public ?? false;
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
      channels:   (d.channels  as Record<string, number>) ?? {},
      expCats:    (d.expCats   as Record<string, number>) ?? {},
    }];
  });

  return (
    <PropertiesClient
      properties={properties}
      reports={reports}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  );
}
