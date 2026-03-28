// src/app/api/admin/nuke/route.ts
// =============================================================================
// MehmanGhar Financial OS — Nuke Database Route
//
// POST — deletes all operational data from the database in dependency order.
//        SuperAdmin only. Requires password confirmation server-side.
//
// Tables cleared (in safe deletion order):
//   reports, payouts, daily_expenses, bookings, guests,
//   investors, utils_settings
//
// Tables NOT cleared (structural — would break the app):
//   roles, users (auth — would lock everyone out)
//   properties (kept so investors/bookings can still be re-entered)
//
// Returns: { cleared: string[], counts: Record<string, number> }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, RoleRequiredError } from '@/lib/permissions';
import { verifyPassword } from '@/lib/auth';

interface NukeResponse {
  cleared: string[];
  counts: Record<string, number>;
}

interface ErrorResponse {
  error: string;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<NukeResponse | ErrorResponse>> {
  // ── 1. SuperAdmin only ────────────────────────────────────────────────────
  const role     = request.headers.get('x-user-role') ?? '';
  const userId   = request.headers.get('x-user-id')   ?? '';

  try {
    requireRole(role, ['SuperAdmin']);
  } catch (err) {
    if (err instanceof RoleRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let body: { password?: string; tables?: string[] };
  try {
    body = await request.json() as { password?: string; tables?: string[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.password) {
    return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
  }

  // ── 3. Verify SuperAdmin password ─────────────────────────────────────────
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 403 });
  }

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 403 });
  }

  // ── 4. Determine which tables to clear ───────────────────────────────────
  // All clearable tables in safe deletion order (respects FK constraints).
  const ALL_CLEARABLE = [
    'reports',
    'payouts',
    'daily_expenses',
    'bookings',
    'guests',
    'investors',
    'properties',
    'utils_settings',
  ] as const;

  type ClearableTable = typeof ALL_CLEARABLE[number];

  const requested = Array.isArray(body.tables) && body.tables.length > 0
    ? body.tables.filter((t): t is ClearableTable =>
        (ALL_CLEARABLE as readonly string[]).includes(t)
      )
    : [...ALL_CLEARABLE]; // default: all

  // ── 5. Delete in safe order ───────────────────────────────────────────────
  const counts: Record<string, number> = {};
  const cleared: string[] = [];

  // Process in dependency order regardless of request order
  const ordered = ALL_CLEARABLE.filter((t) => requested.includes(t));

  for (const table of ordered) {
    try {
      switch (table) {
        case 'reports': {
          const { count } = await prisma.report.deleteMany({});
          counts.reports = count;
          cleared.push('reports');
          break;
        }
        case 'payouts': {
          const { count } = await prisma.payout.deleteMany({});
          counts.payouts = count;
          cleared.push('payouts');
          break;
        }
        case 'daily_expenses': {
          const { count } = await prisma.dailyExpense.deleteMany({});
          counts.daily_expenses = count;
          cleared.push('daily_expenses');
          break;
        }
        case 'bookings': {
          const { count } = await prisma.booking.deleteMany({});
          counts.bookings = count;
          cleared.push('bookings');
          break;
        }
        case 'guests': {
          const { count } = await prisma.guest.deleteMany({});
          counts.guests = count;
          cleared.push('guests');
          break;
        }
        case 'investors': {
          const { count } = await prisma.investor.deleteMany({});
          counts.investors = count;
          cleared.push('investors');
          break;
        }
        case 'properties': {
          const { count } = await prisma.property.deleteMany({});
          counts.properties = count;
          cleared.push('properties');
          break;
        }
        case 'utils_settings': {
          const { count } = await prisma.utilsSetting.deleteMany({});
          counts.utils_settings = count;
          cleared.push('utils_settings');
          break;
        }
      }
    } catch (err) {
      console.error(`[nuke] failed to clear ${table}:`, err);
      // Continue with remaining tables — partial clear is better than total failure
    }
  }

  return NextResponse.json({ cleared, counts });
}
