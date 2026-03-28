// prisma/seed.ts
// =============================================================================
// MehmanGhar Financial OS — Database Seed Script
//
// Seeds three roles and one SuperAdmin user. Idempotent — safe to re-run.
//
// Roles seeded:
//   SuperAdmin — full access to all 14 tabs + user management
//   Admin      — Daily Expenses + Bookings + Monthly Entry
//   Co-Host    — Bookings + Daily Expenses + Rent & Utilities
//                (property operations without financial visibility)
//
// Usage: npx prisma db seed
// =============================================================================

import { config } from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client/client";
import bcrypt from "bcryptjs";

config({ path: ".env.local" });

const pool = new Pool({ connectionString: process.env.DIRECT_URL });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({
  adapter,
} as unknown as ConstructorParameters<typeof PrismaClient>[0]);

// ---------------------------------------------------------------------------
// Tab keys — must match route segments in src/app/(dashboard)/
// ---------------------------------------------------------------------------

const ALL_TABS = [
  "dashboard", "cashflow", "properties", "investors",
  "reports", "insights", "expenses", "payouts",
  "bookings", "crm", "dailyexp", "monthlyentry", "utils", "users",
] as const;

type TabKey = (typeof ALL_TABS)[number];
type CrudMap = { create: boolean; read: boolean; update: boolean; delete: boolean };

// ---------------------------------------------------------------------------
// Permission builders
// ---------------------------------------------------------------------------

function allTabsVisible(): Record<TabKey, boolean> {
  return Object.fromEntries(ALL_TABS.map((t) => [t, true])) as Record<TabKey, boolean>;
}

function allTabsCrud(): Record<TabKey, CrudMap> {
  return Object.fromEntries(
    ALL_TABS.map((t) => [t, { create: true, read: true, update: true, delete: true }])
  ) as Record<TabKey, CrudMap>;
}

/** Admin: Daily Expenses, Bookings, and Monthly Entry visible + full CRUD. */
function adminTabPermissions(): Record<TabKey, boolean> {
  return Object.fromEntries(
    ALL_TABS.map((t) => [t, t === "dailyexp" || t === "bookings" || t === "monthlyentry"])
  ) as Record<TabKey, boolean>;
}

function adminCrudPermissions(): Record<TabKey, CrudMap> {
  const full: CrudMap = { create: true, read: true, update: true, delete: true };
  const none: CrudMap = { create: false, read: false, update: false, delete: false };
  return Object.fromEntries(
    ALL_TABS.map((t) => [t, t === "dailyexp" || t === "bookings" || t === "monthlyentry" ? full : none])
  ) as Record<TabKey, CrudMap>;
}

/** Co-Host: Bookings, Daily Expenses, Rent & Utilities.
 *  Property operations only — no financial analytics visibility.
 *  SuperAdmin can adjust this via the permissions UI. */
function coHostTabPermissions(): Record<TabKey, boolean> {
  const allowed = new Set<TabKey>(["bookings", "dailyexp", "utils"]);
  return Object.fromEntries(
    ALL_TABS.map((t) => [t, allowed.has(t)])
  ) as Record<TabKey, boolean>;
}

function coHostCrudPermissions(): Record<TabKey, CrudMap> {
  const full: CrudMap = { create: true, read: true, update: true, delete: true };
  const none: CrudMap = { create: false, read: false, update: false, delete: false };
  const allowed = new Set<TabKey>(["bookings", "dailyexp", "utils"]);
  return Object.fromEntries(
    ALL_TABS.map((t) => [t, allowed.has(t) ? full : none])
  ) as Record<TabKey, CrudMap>;
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`[seed] Missing env var: ${name}`);
  return v.trim();
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[seed] Starting...");

  const username = requireEnv("SEED_SUPERADMIN_USERNAME");
  const plaintextPassword = requireEnv("SEED_SUPERADMIN_PASSWORD");
  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10);

  // -- SuperAdmin role --
  const superAdminRole = await prisma.role.upsert({
    where:  { name: "SuperAdmin" },
    update: { tab_permissions: allTabsVisible(), crud_permissions: allTabsCrud() },
    create: { name: "SuperAdmin", tab_permissions: allTabsVisible(), crud_permissions: allTabsCrud() },
  });
  console.log(`[seed] SuperAdmin role — id: ${superAdminRole.id}`);

  // -- Admin role --
  const adminRole = await prisma.role.upsert({
    where:  { name: "Admin" },
    update: { tab_permissions: adminTabPermissions(), crud_permissions: adminCrudPermissions() },
    create: { name: "Admin", tab_permissions: adminTabPermissions(), crud_permissions: adminCrudPermissions() },
  });
  console.log(`[seed] Admin role — id: ${adminRole.id}`);

  // -- Co-Host role --
  const coHostRole = await prisma.role.upsert({
    where:  { name: "Co-Host" },
    update: { tab_permissions: coHostTabPermissions(), crud_permissions: coHostCrudPermissions() },
    create: { name: "Co-Host", tab_permissions: coHostTabPermissions(), crud_permissions: coHostCrudPermissions() },
  });
  console.log(`[seed] Co-Host role — id: ${coHostRole.id}`);

  // -- SuperAdmin user --
  const passwordHash = await bcrypt.hash(plaintextPassword, rounds);
  const superAdminUser = await prisma.user.upsert({
    where:  { username },
    update: { password_hash: passwordHash, role_id: superAdminRole.id },
    create: { username, password_hash: passwordHash, role_id: superAdminRole.id },
  });
  console.log(`[seed] SuperAdmin user "${superAdminUser.username}" — id: ${superAdminUser.id}`);

  console.log("[seed] Done.");
}

main()
  .catch((err: unknown) => { console.error("[seed] Fatal:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });