// src/lib/auth.ts
// =============================================================================
// MehmanGhar Financial OS — Auth Helpers
//
// Two responsibilities:
//   1. JWT — sign and verify HS256 tokens stored in an HttpOnly cookie.
//   2. bcrypt — hash and compare passwords.
//
// This module is the ONLY place that imports jose and bcryptjs.
// All auth API routes use these helpers — never jose/bcryptjs directly.
//
// Token payload shape:
//   { sub: userId, role: roleName, iat, exp }
//
// Cookie settings:
//   HttpOnly — not readable by JS in the browser
//   SameSite=Strict — no cross-site sends
//   Secure — HTTPS only in production
//   Path=/ — valid across the entire app
//   Max-Age=7 days — matches JWT expiry
// =============================================================================

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import bcrypt from "bcryptjs";
import { type NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Constants — must match proxy.ts and .env.local
// ---------------------------------------------------------------------------

const COOKIE_NAME = process.env.COOKIE_NAME ?? "mg_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionPayload {
  sub: string;   // user id (cuid)
  role: string;  // role name: "SuperAdmin" | "Admin" | ...
}

// ---------------------------------------------------------------------------
// Internal — JWT secret as Uint8Array for jose
// ---------------------------------------------------------------------------

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "[auth] JWT_SECRET is missing or too short. Set a strong value (≥32 chars) in .env.local."
    );
  }
  return new TextEncoder().encode(secret);
}

// ---------------------------------------------------------------------------
// JWT — sign
// ---------------------------------------------------------------------------

/**
 * Signs a new JWT with the user id and role name.
 * Expiry: 7 days from now.
 */
export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getJwtSecret());
}

// ---------------------------------------------------------------------------
// JWT — verify
// ---------------------------------------------------------------------------

/**
 * Verifies a JWT string and returns the session payload.
 * Returns null if the token is invalid, expired, or malformed.
 * Throws on unexpected errors.
 */
export async function verifyToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    });

    if (typeof payload.sub !== "string" || typeof payload["role"] !== "string") {
      return null;
    }

    return {
      sub: payload.sub,
      role: payload["role"] as string,
    };
  } catch (err) {
    if (
      err instanceof joseErrors.JWTExpired ||
      err instanceof joseErrors.JWTInvalid ||
      err instanceof joseErrors.JWSInvalid ||
      err instanceof joseErrors.JWSSignatureVerificationFailed
    ) {
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Cookie — set session cookie on a response
// ---------------------------------------------------------------------------

/**
 * Attaches the session cookie to a NextResponse.
 * Call this after signing the token on successful login.
 */
export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

// ---------------------------------------------------------------------------
// Cookie — clear session cookie on logout
// ---------------------------------------------------------------------------

/**
 * Clears the session cookie on a NextResponse.
 * Call this on logout — sets maxAge=0 to expire the cookie immediately.
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

// ---------------------------------------------------------------------------
// Cookie — read session token from an incoming request
// ---------------------------------------------------------------------------

/**
 * Reads and verifies the session cookie from an incoming request.
 * Returns the verified payload or null if absent / invalid.
 */
export async function getSessionFromRequest(
  request: NextRequest
): Promise<SessionPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// ---------------------------------------------------------------------------
// bcrypt — hash password
// ---------------------------------------------------------------------------

/**
 * Hashes a plaintext password using bcrypt.
 * Rounds are read from BCRYPT_ROUNDS env var (default: 12 per v3 plan).
 */
export async function hashPassword(plaintext: string): Promise<string> {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10);
  return bcrypt.hash(plaintext, rounds);
}

// ---------------------------------------------------------------------------
// bcrypt — verify password
// ---------------------------------------------------------------------------

/**
 * Compares a plaintext password against a bcrypt hash.
 * Returns true if they match.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}