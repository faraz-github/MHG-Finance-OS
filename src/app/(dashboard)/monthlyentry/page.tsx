// src/app/(dashboard)/monthlyentry/page.tsx
//
// Monthly Entry page — Server Component shell.
// SuperAdmin + Admin access; gated on the 'monthlyentry' tab permission.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { MonthlyEntryClient } from './MonthlyEntryClient';
import type { MonthlyEntryProperty } from './MonthlyEntryClient';

export default async function MonthlyEntryPage() {
  const cookieName  = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token       = cookieStore.get(cookieName)?.value ?? '';
  const session     = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  const rolePerms = await getRolePermissions(session.role);
  const tabPerms  = rolePerms?.tabPermissions  ?? {};
  const crudPerms = rolePerms?.crudPermissions ?? {};

  if (tabPerms['monthlyentry'] !== true) redirect('/dashboard');
  const canCreate = crudPerms['monthlyentry']?.create === true;

  // ── Fetch properties — only id + name needed for the property selector ─────
  const rawProps = await prisma.property.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const properties: MonthlyEntryProperty[] = rawProps.map((p) => ({
    id:   p.id,
    name: p.name,
  }));

  return (
    <MonthlyEntryClient
      properties={properties}
      canCreate={canCreate}
    />
  );
}