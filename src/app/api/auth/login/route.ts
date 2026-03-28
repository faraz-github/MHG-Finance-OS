// src/app/api/auth/login/route.ts
// =============================================================================
// MehmanGhar Financial OS — Login API Route
//
// POST /api/auth/login
// Body: { username: string, password: string }
//
// Returns:
//   200 — sets session cookie, returns { id, username, role, landingPath }
//   400 — missing or invalid body shape
//   401 — invalid credentials
//   500 — unexpected server error
//
// landingPath: the first tab the role has access to, in sidebar order.
// SuperAdmin always lands on /dashboard.
// Other roles land on their first permitted tab so they never hit a redirect
// wall if /dashboard is not in their permissions.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, signToken, setSessionCookie } from "@/lib/auth";

// Sidebar tab order — first permitted tab wins.
// Must mirror the order in Sidebar.tsx NAV_SECTIONS.
const TAB_ORDER: Array<{ key: string; path: string }> = [
  { key: "dashboard",    path: "/dashboard"    },
  { key: "properties",   path: "/properties"   },
  { key: "investors",    path: "/investors"     },
  { key: "cashflow",     path: "/cashflow"      },
  { key: "payouts",      path: "/payouts"       },
  { key: "reports",      path: "/reports"       },
  { key: "insights",     path: "/insights"      },
  { key: "expenses",     path: "/expenses"      },
  { key: "crm",          path: "/crm"           },
  { key: "dailyexp",     path: "/dailyexp"      },
  { key: "bookings",     path: "/bookings"      },
  { key: "monthlyentry", path: "/monthlyentry"  },
  { key: "utils",        path: "/utils"         },
  { key: "users",        path: "/users"         },
];

function getLandingPath(tabPermissions: Record<string, boolean>): string {
  for (const { key, path } of TAB_ORDER) {
    if (tabPermissions[key] === true) return path;
  }
  // Fallback — should never happen if the role has at least one tab
  return "/dashboard";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).username !== "string" ||
    typeof (body as Record<string, unknown>).password !== "string"
  ) {
    return NextResponse.json(
      { error: "username and password are required." },
      { status: 400 }
    );
  }

  const { username, password } = body as { username: string; password: string };

  if (username.trim() === "" || password === "") {
    return NextResponse.json(
      { error: "username and password must not be empty." },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
      include: {
        role: {
          select: { name: true, tab_permissions: true },
        },
      },
    });

    const dummyHash =
      "$2a$12$invalidhashfortimingnormalizationxxxxxxxxxxxxxxxxxxxxxxx";
    const passwordMatch = await verifyPassword(
      password,
      user?.password_hash ?? dummyHash
    );

    if (!user || !passwordMatch) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const token = await signToken({ sub: user.id, role: user.role.name });

    const tabPerms = (user.role.tab_permissions ?? {}) as Record<string, boolean>;
    const landingPath = getLandingPath(tabPerms);

    const response = NextResponse.json(
      {
        id:          user.id,
        username:    user.username,
        role:        user.role.name,
        landingPath,
      },
      { status: 200 }
    );

    setSessionCookie(response, token);
    return response;
  } catch (err) {
    console.error("[POST /api/auth/login]", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}