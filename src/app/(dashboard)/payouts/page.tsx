// src/app/(dashboard)/payouts/page.tsx
//
// Payout Ledger page — Server Component shell.
// Fetches Payout rows joined with Property and Investor names.
//
// HTML source: <div class="page" id="page-payouts"> + rndPayouts()
//              + togglePayStatus() + updPendingBadge()
//
// ─── SCHEMA NOTES ────────────────────────────────────────────────────────
// 1. HTML payout.ref → NOT IN SCHEMA. Needs migration:
//      model Payout { reference String? }
//    Until migrated: Ref column shows '—'. Safe fallback.
//
// 2. HTML payout.status ('pending'|'paid') → derived from DB:
//    - amount_paid IS NOT NULL AND paid_on IS NOT NULL → 'paid'
//    - otherwise → 'pending'
//
// 3. HTML payout.paidDate (dd/mm/yyyy) → DB: paid_on (DateTime @db.Date)
//    Serialised to YYYY-MM-DD string.
//
// 4. HTML payout.repId (link to report) → NOT IN SCHEMA (v2 enhancement).
//
// ─── SIDEBAR PENDING BADGE ───────────────────────────────────────────────
// The Sidebar.tsx built in Run 1 has a pending badge on the "Payout Ledger"
// nav item that currently renders with display:none.
// To wire it: add this query to Sidebar.tsx (Server Component):
//
//   const pendingCount = await prisma.payout.count({
//     where: {
//       AND: [
//         { amount_paid: null },
//         { paid_on:     null },
//       ],
//     },
//   });
//
// Then pass `pendingCount` to the NavItem for Payouts and replace the
// static <span class="badge" style="display:none;">0</span> with:
//   {pendingCount > 0 && <span className={styles.badge}>{pendingCount}</span>}
//
// This is the cleanest place to do it — Sidebar is already a Server
// Component and fetches the session. The full wiring instruction will be
// in the Phase 5 evaluation.
// ─────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { PayoutsClient } from './PayoutsClient';

// ---------------------------------------------------------------------------
// Exported serialisable type
// ---------------------------------------------------------------------------

export interface SerializablePayout {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyCity: string;
  investorId:      string;
  investorName:    string;
  investorContact: string;
  year: number;
  month: number;
  amountOwed: number;
  /** 'paid' when amount_paid IS NOT NULL, else 'pending' */
  status: 'pending' | 'paid';
  /** YYYY-MM-DD or null */
  paidOn: string | null;
  /** Payment reference / UTR / transaction ID */
  reference: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PayoutsPage() {
  // ── Session + permissions ─────────────────────────────────────────────────
  const cookieName = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value ?? '';
  const session = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  const rolePerms = await getRolePermissions(session.role);
  const tabPerms  = rolePerms?.tabPermissions ?? {};
  if (tabPerms['payouts'] !== true) redirect('/dashboard');

  // ── Fetch payouts with property + investor names ──────────────────────────
  const rawPayouts = await prisma.payout.findMany({
    select: {
      id:          true,
      property_id: true,
      investor_id: true,
      year:        true,
      month:       true,
      amount_owed: true,
      amount_paid: true,
      paid_on:     true,
      reference:   true,
      notes:       true,
      property:    { select: {
        name: true,
        city: true,
      }},
      investor:    { select: { name: true, contact: true } },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  const payouts: SerializablePayout[] = rawPayouts.map((p) => ({
    id:           p.id,
    propertyId:   p.property_id,
    propertyName: p.property.name,
    propertyCity: p.property.city ?? '',
    investorId:      p.investor_id,
    investorName:    p.investor.name,
    investorContact: p.investor.contact ?? '',
    year:         p.year,
    month:        p.month,
    amountOwed:   Number(p.amount_owed),
    status:       (p.amount_paid !== null && p.paid_on !== null) ? 'paid' : 'pending',
    paidOn:       p.paid_on ? p.paid_on.toISOString().split('T')[0] : null,
    reference:    p.reference,
    notes:        p.notes,
  }));

  return (
    <PayoutsClient
      payouts={payouts}
    />
  );
}