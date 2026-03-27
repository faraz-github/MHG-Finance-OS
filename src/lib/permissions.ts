// src/lib/permissions.ts
// =============================================================================
// MehmanGhar Financial OS — Role Permission Checks
//
// Used by API routes to enforce per-tab CRUD access.
// Used by the Sidebar to determine tab visibility.
//
// The permission data is stored in the `roles` table as JSON columns:
//   tab_permissions  — { [tabKey]: boolean }
//   crud_permissions — { [tabKey]: { create, read, update, delete } }
//
// proxy.ts has already verified the JWT and set x-user-role on every request.
// API routes call `assertPermission()` with the role name from that header.
//
// Role data is fetched per-request (no in-memory cache in v1). A simple
// caching layer can be added in v2 if role lookups become a bottleneck.
// =============================================================================

import { prisma } from "./db";

// ---------------------------------------------------------------------------
// Types — mirror the JSON column shapes defined in schema.prisma comments
// ---------------------------------------------------------------------------

export type TabKey =
  | "dashboard"
  | "cashflow"
  | "properties"
  | "investors"
  | "reports"
  | "insights"
  | "expenses"
  | "payouts"
  | "bookings"
  | "crm"
  | "dailyexp"
  | "monthlyentry"
  | "utils"
  | "users";

export type CrudAction = "create" | "read" | "update" | "delete";

export interface TabPermissions {
  [tabKey: string]: boolean;
}

export interface CrudPermissions {
  [tabKey: string]: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
  };
}

// ---------------------------------------------------------------------------
// getRolePermissions — fetch role from DB by name
// ---------------------------------------------------------------------------

interface RolePermissions {
  tabPermissions: TabPermissions;
  crudPermissions: CrudPermissions;
}

/**
 * Fetches the permission objects for a role by name.
 * Returns null if the role does not exist.
 */
export async function getRolePermissions(
  roleName: string
): Promise<RolePermissions | null> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
    select: { tab_permissions: true, crud_permissions: true },
  });

  if (!role) return null;

  return {
    tabPermissions: role.tab_permissions as TabPermissions,
    crudPermissions: role.crud_permissions as CrudPermissions,
  };
}

// ---------------------------------------------------------------------------
// canAccessTab — check if a role can see a tab
// ---------------------------------------------------------------------------

/**
 * Returns true if the role has tab visibility for the given tab.
 */
export async function canAccessTab(
  roleName: string,
  tab: TabKey
): Promise<boolean> {
  const permissions = await getRolePermissions(roleName);
  if (!permissions) return false;
  return permissions.tabPermissions[tab] === true;
}

// ---------------------------------------------------------------------------
// canPerformAction — check CRUD permission on a tab
// ---------------------------------------------------------------------------

/**
 * Returns true if the role can perform the given CRUD action on the given tab.
 */
export async function canPerformAction(
  roleName: string,
  tab: TabKey,
  action: CrudAction
): Promise<boolean> {
  const permissions = await getRolePermissions(roleName);
  if (!permissions) return false;
  return permissions.crudPermissions[tab]?.[action] === true;
}

// ---------------------------------------------------------------------------
// assertPermission — throws a structured error if permission is denied
// ---------------------------------------------------------------------------

/**
 * Asserts that the given role can perform an action on a tab.
 * Throws a PermissionError (caught by API route error handlers) if denied.
 *
 * Usage in API routes:
 *   const role = request.headers.get("x-user-role") ?? "";
 *   await assertPermission(role, "bookings", "create");
 */
export class PermissionError extends Error {
  public readonly status = 403;

  constructor(role: string, tab: TabKey, action: CrudAction) {
    super(
      `[permissions] Role "${role}" does not have "${action}" access to tab "${tab}".`
    );
    this.name = "PermissionError";
  }
}

export async function assertPermission(
  roleName: string,
  tab: TabKey,
  action: CrudAction
): Promise<void> {
  const allowed = await canPerformAction(roleName, tab, action);
  if (!allowed) {
    throw new PermissionError(roleName, tab, action);
  }
}

// ---------------------------------------------------------------------------
// requireRole — assert an exact role match (for SuperAdmin-only routes)
// ---------------------------------------------------------------------------

/**
 * Throws a 403 PermissionError if the given role name is not in the allowed list.
 *
 * Usage:
 *   requireRole(role, ["SuperAdmin"]);
 */
export class RoleRequiredError extends Error {
  public readonly status = 403;

  constructor(required: string[]) {
    super(
      `[permissions] This route requires one of: ${required.join(", ")}.`
    );
    this.name = "RoleRequiredError";
  }
}

export function requireRole(
  roleName: string,
  allowed: string[]
): void {
  if (!allowed.includes(roleName)) {
    throw new RoleRequiredError(allowed);
  }
}