// src/proxy.ts
// =============================================================================
// MehmanGhar Financial OS — JWT + Role Guard Proxy
//
// Next.js 16: middleware.ts is deprecated. This file must be named proxy.ts
// and the exported function must be named `proxy`.
//
// Responsibilities:
//   1. Allow public routes through with no token check.
//   2. Extract the session JWT from the HttpOnly cookie.
//   3. Verify the JWT using jose jwtVerify (HS256).
//   4. Reject unauthenticated requests — 401 for API routes, redirect for pages.
//   5. Forward verified user context via x-user-id and x-user-role headers.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, errors as joseErrors } from "jose";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COOKIE_NAME = process.env.COOKIE_NAME ?? "mg_session";
const LOGIN_PATH = "/login";

// ---------------------------------------------------------------------------
// Public routes — no token required.
//
// IMPORTANT: The login and logout API routes MUST be listed here.
// Without this, the proxy intercepts POST /api/auth/login before it reaches
// the route handler (no cookie exists yet → 401 → login always fails).
// ---------------------------------------------------------------------------

const PUBLIC_PATHS: string[] = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

// ---------------------------------------------------------------------------
// Route matcher
// ---------------------------------------------------------------------------

export const config = {
  // Exclude Next.js internals AND all public static file extensions.
  // Without this, /logo.jpg (and any other public assets) are intercepted by
  // the JWT guard on a fresh incognito session — the browser receives a redirect
  // to /login instead of the image file, so the logo never renders on the login page.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:jpg|jpeg|png|gif|webp|svg|ico|woff2?|ttf|otf|css|js)).*)"],
};

// ---------------------------------------------------------------------------
// JWT payload shape
// ---------------------------------------------------------------------------

interface JwtPayload {
  sub: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Proxy entry point
// ---------------------------------------------------------------------------

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // 1. Public routes — pass through immediately.
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 2. Extract session token.
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return rejectRequest(request, pathname, "No session token.");
  }

  // 3. Verify the JWT.
  let payload: JwtPayload;

  try {
    const secret = getJwtSecret();
    const { payload: verified } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    if (
      typeof verified.sub !== "string" ||
      typeof verified["role"] !== "string"
    ) {
      return rejectRequest(request, pathname, "Malformed token payload.");
    }

    payload = {
      sub: verified.sub,
      role: verified["role"] as string,
    };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      return rejectRequest(request, pathname, "Session expired.");
    }
    if (
      err instanceof joseErrors.JWTInvalid ||
      err instanceof joseErrors.JWSInvalid ||
      err instanceof joseErrors.JWSSignatureVerificationFailed
    ) {
      return rejectRequest(request, pathname, "Invalid token.");
    }
    return rejectRequest(request, pathname, "Authentication error.");
  }

  // 4. Token valid — forward user context to API routes and Server Components.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", payload.sub);
  requestHeaders.set("x-user-role", payload.role);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET is missing or too short. Set a strong value in .env.local."
    );
  }
  return new TextEncoder().encode(secret);
}

function rejectRequest(
  request: NextRequest,
  pathname: string,
  reason: string
): NextResponse {
  const isApiRoute = pathname.startsWith("/api/");

  if (isApiRoute) {
    return NextResponse.json(
      { error: "Unauthorised.", reason },
      { status: 401 }
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = LOGIN_PATH;
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}