// src/app/api/targets/route.ts
// =============================================================================
// MehmanGhar Financial OS — Targets API Route
//
// GET  — fetch targets for a given year + month
//        Query params: ?year=2025&month=3
//        Returns: { targets: { revenue, occupancy, roi, expense_limit } }
//
// POST — upsert targets for a given year + month
//        Body: { year: number; month: number; targets: Targets }
//        Returns: { targets: Targets }
//
// Storage: UtilsSetting table, key = `targets_{year}_{month}`
// Value shape: { revenue: number; occupancy: number; roi: number; expense_limit: number }
//
// Used by:
//   - Smart Insights page (Save Targets button)
//   - Dashboard Expense Goal card (Set/Edit button)
//   - Both read the same key — expense_limit is shared between them
//
// Any authenticated role may read targets.
// Any authenticated role may write targets (SuperAdmin + Admin in practice
// via tab permissions — API does not restrict further).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Targets {
  revenue:       number;
  occupancy:     number;
  roi:           number;
  expense_limit: number;
}

interface TargetsResponse {
  targets: Targets;
}

interface ErrorResponse {
  error: string;
}

const BLANK_TARGETS: Targets = {
  revenue: 0, occupancy: 0, roi: 0, expense_limit: 0,
};

function targetKey(year: number, month: number): string {
  return `targets_${year}_${month}`;
}

function sanitizeTargets(raw: unknown): Targets {
  if (!raw || typeof raw !== 'object') return { ...BLANK_TARGETS };
  const r = raw as Record<string, unknown>;
  return {
    revenue:       Number(r.revenue       ?? 0) || 0,
    occupancy:     Number(r.occupancy     ?? 0) || 0,
    roi:           Number(r.roi           ?? 0) || 0,
    expense_limit: Number(r.expense_limit ?? 0) || 0,
  };
}

// ---------------------------------------------------------------------------
// GET — fetch targets for year + month
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest
): Promise<NextResponse<TargetsResponse | ErrorResponse>> {
  const role = request.headers.get('x-user-role') ?? '';
  if (!role) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year  = parseInt(searchParams.get('year')  ?? '0');
  const month = parseInt(searchParams.get('month') ?? '0');

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'Query params "year" and "month" (1–12) are required.' },
      { status: 422 }
    );
  }

  try {
    const setting = await prisma.utilsSetting.findUnique({
      where: { key: targetKey(year, month) },
    });

    const targets = setting?.value
      ? sanitizeTargets(setting.value)
      : { ...BLANK_TARGETS };

    return NextResponse.json({ targets });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch targets.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — upsert targets for year + month
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse<TargetsResponse | ErrorResponse>> {
  const role = request.headers.get('x-user-role') ?? '';
  if (!role) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const year  = parseInt(String(body.year  ?? '0'));
  const month = parseInt(String(body.month ?? '0'));

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'Fields "year" and "month" (1–12) are required.' },
      { status: 422 }
    );
  }

  const incoming = sanitizeTargets(body.targets);

  // Merge with existing so a partial update (e.g. only expense_limit from
  // the Dashboard goal card) does not wipe the other Insights targets.
  let existing: Targets = { ...BLANK_TARGETS };
  try {
    const current = await prisma.utilsSetting.findUnique({
      where: { key: targetKey(year, month) },
    });
    if (current?.value) existing = sanitizeTargets(current.value);
  } catch {
    // No existing row — start from blank
  }

  // Only overwrite fields that were explicitly sent (non-zero or explicitly
  // present). Fields not in body.targets keep their existing values.
  const rawTargets = (body.targets ?? {}) as Record<string, unknown>;
  const merged: Targets = {
    revenue:       'revenue'       in rawTargets ? incoming.revenue       : existing.revenue,
    occupancy:     'occupancy'     in rawTargets ? incoming.occupancy     : existing.occupancy,
    roi:           'roi'           in rawTargets ? incoming.roi           : existing.roi,
    expense_limit: 'expense_limit' in rawTargets ? incoming.expense_limit : existing.expense_limit,
  };

  try {
    await prisma.utilsSetting.upsert({
      where:  { key: targetKey(year, month) },
      create: {
        key:         targetKey(year, month),
        value:       merged,
        description: `Monthly targets for ${year}-${String(month).padStart(2, '0')}`,
      },
      update: {
        value: merged,
      },
    });

    return NextResponse.json({ targets: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save targets.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
