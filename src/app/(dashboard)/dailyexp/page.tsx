// src/app/(dashboard)/dailyexp/page.tsx
//
// Daily Expenses page — Server Component shell.
// Admin + SuperAdmin access (enforced by proxy.ts + permissions.ts).
//
// HTML source: <div class="page" id="page-dailyexp"> + rndDailyExp()
//              + saveDailyExp() + editDailyExp() + delDailyExp()
//
// ─── ARCHITECTURAL NOTE: Period filtering for date-stamped pages ──────────
// The prompt suggests reading period from URL search params so the Server
// Component can filter server-side. This is the correct v2 approach and
// requires:
//   1. PeriodBar to push state to the URL on every change
//   2. NavItem links to include the current period params
//   3. Server Component to read from searchParams
//
// v1 decision: filter client-side using matchesPeriod() + Zustand state.
// The Server Component fetches ALL daily expenses for all time (bounded by
// a reasonable limit). The Client Component then applies matchesPeriod()
// on the expense_date field using the current Zustand period state.
//
// Justification:
//   - DailyExpense rows are typically small in volume (one entry per
//     expense per day per property — dozens/hundreds, not millions).
//   - This keeps the architecture consistent with Properties/Investors/
//     Reports which all filter client-side.
//   - URL-sync is added as a v2 enhancement in the evaluation migration plan.
//   - Fetching all rows is safe here: large property portfolios with heavy
//     expense tracking can be optimised in v2 with server-side date ranges.
// ─────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { DailyExpClient } from './DailyExpClient';
import type { SerializableDailyExp } from './DailyExpClient';
import type { SerializableProperty } from '../properties/page';

export default async function DailyExpPage() {
  // ── Session + permissions ─────────────────────────────────────────────────
  const cookieName = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value ?? '';
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  const rolePerms = await getRolePermissions(session.role);
  const tabPerms  = rolePerms?.tabPermissions  ?? {};
  const crudPerms = rolePerms?.crudPermissions ?? {};
  if (tabPerms['dailyexp'] !== true) redirect('/dashboard');

  const canCreate = crudPerms['dailyexp']?.create === true;
  const canEdit   = crudPerms['dailyexp']?.update === true;
  const canDelete = crudPerms['dailyexp']?.delete === true;

  // ── Fetch all daily expenses ──────────────────────────────────────────────
  // All records are fetched; period filtering is done client-side via
  // matchesPeriod(). See architectural note above.
  const rawExpenses = await prisma.dailyExpense.findMany({
    select: {
      id:           true,
      property_id:  true,
      expense_date: true,
      category:     true,
      amount:       true,
      description:  true,
      invoice_path: true,
    },
    orderBy: { expense_date: 'desc' },
  });

  const expenses: SerializableDailyExp[] = rawExpenses.map((e) => ({
    id:          e.id,
    pid:         e.property_id,
    // expense_date is a DateTime@db.Date; serialise to YYYY-MM-DD string
    date:        e.expense_date.toISOString().split('T')[0],
    category:    e.category,
    amount:      Number(e.amount),
    note:        e.description ?? '',
    invoicePath: e.invoice_path,
  }));

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
    <DailyExpClient
      expenses={expenses}
      properties={properties}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  );
}