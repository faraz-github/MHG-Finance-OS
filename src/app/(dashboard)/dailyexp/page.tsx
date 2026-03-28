// src/app/(dashboard)/dailyexp/page.tsx
// Daily Expenses page — Server Component shell.
// Admin + SuperAdmin access (enforced by proxy.ts + permissions.ts).
// Period filtering is client-side via matchesPeriod() + Zustand state.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { DailyExpClient } from './DailyExpClient';
import type { SerializableDailyExp, DailyExpProperty } from './DailyExpClient';

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

  // ── Fetch properties — only id, name, city needed for filter + modal ────────
  const rawProps = await prisma.property.findMany({
    select: { id: true, name: true, city: true },
    orderBy: { name: 'asc' },
  });
  const properties: DailyExpProperty[] = rawProps.map((p) => ({
    id:   p.id,
    name: p.name,
    city: p.city ?? '',
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