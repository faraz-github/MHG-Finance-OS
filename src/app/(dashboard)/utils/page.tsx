// src/app/(dashboard)/utils/page.tsx
//
// Rent & Utilities Tracker — Server Component shell.
//
// HTML source: <div class="page" id="page-utils"> + rndUtils()
//              + saveUtil() + editUtil() + delUtil() + toggleUtilStatus()
//
// ─── STORAGE NOTE ────────────────────────────────────────────────────────
// No UtilsEntry model exists in the Prisma schema. The HTML stored Utils[]
// in localStorage. For v1, entries are stored as a JSON array in the
// UtilsSetting table under key = 'utils_entries'.
//
// This mirrors the pattern used for targets (key = 'targets_Y_M').
// UtilsSetting already exists in the schema: { id, key String @unique, value Json }.
//
// The evaluation migration plan will add a proper UtilsEntry model:
//   model UtilsEntry {
//     id          String   @id @default(cuid())
//     property_id String
//     type        String   // 'rent' | 'electricity' | 'custom'
//     label       String?
//     cn          String?
//     amount      Decimal  @db.Decimal(14,2)
//     due_date    DateTime @db.Date
//     paid_date   DateTime? @db.Date
//     status      String   @default("pending")
//     tds         Boolean  @default(false)
//     gst         Boolean  @default(false)
//     notes       String?
//     created_at  DateTime @default(now())
//     updated_at  DateTime @updatedAt
//     property    Property @relation(...)
//     @@map("utils_entries")
//   }
//
// The Phase 6 /api/utils route will read/write from UtilsSetting (key-value)
// in v1 and migrate to the UtilsEntry table in v2 with no UI changes needed.
// ─────────────────────────────────────────────────────────────────────────

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRolePermissions } from '@/lib/permissions';
import { UtilsClient } from './UtilsClient';
import type { UtilEntry, UtilsProperty } from './UtilsClient';

const UTILS_STORAGE_KEY = 'utils_entries';

export default async function UtilsPage() {
  // ── Session + permissions ─────────────────────────────────────────────────
  const cookieName  = process.env.COOKIE_NAME ?? 'mg_session';
  const cookieStore = await cookies();
  const token       = cookieStore.get(cookieName)?.value ?? '';
  const session     = token ? await verifyToken(token) : null;
  if (!session) redirect('/login');

  const rolePerms = await getRolePermissions(session.role);
  const tabPerms  = rolePerms?.tabPermissions  ?? {};
  const crudPerms = rolePerms?.crudPermissions ?? {};
  if (tabPerms['utils'] !== true) redirect('/dashboard');

  const canCreate = crudPerms['utils']?.create === true;
  const canEdit   = crudPerms['utils']?.update === true;
  const canDelete = crudPerms['utils']?.delete === true;

  // ── Fetch utils entries from UtilsSetting key-value store ─────────────────
  let entries: UtilEntry[] = [];
  try {
    const setting = await prisma.utilsSetting.findUnique({
      where: { key: UTILS_STORAGE_KEY },
    });
    if (setting?.value && Array.isArray(setting.value)) {
      entries = (setting.value as unknown[]).map((raw) => {
        const u = raw as Record<string, unknown>;
        return {
          id:       String(u.id ?? ''),
          type:     (u.type as UtilEntry['type']) ?? 'rent',
          pid:      String(u.pid ?? ''),
          cn:       String(u.cn ?? ''),
          label:    String(u.label ?? ''),
          amount:   Number(u.amount ?? 0),
          dueDate:  String(u.dueDate ?? ''),
          paidDate: String(u.paidDate ?? ''),
          status:   (u.status as UtilEntry['status']) ?? 'pending',
          tds:      Boolean(u.tds),
          gst:      Boolean(u.gst),
          notes:    String(u.notes ?? ''),
        };
      });
    }
  } catch {
    // UtilsSetting key not yet created — safe empty default
  }

  // ── Fetch properties — only id, name, city needed for filter + modal ─────
  const rawProps = await prisma.property.findMany({
    select: { id: true, name: true, city: true },
    orderBy: { name: 'asc' },
  });
  const properties: UtilsProperty[] = rawProps.map((p) => ({
    id:   p.id,
    name: p.name,
    city: p.city ?? '',
  }));

  return (
    <UtilsClient
      entries={entries}
      properties={properties}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  );
}