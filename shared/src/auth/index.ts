import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

export interface TenantTokenPayload {
  userId: string;
  organizationId: string;
  role: string;
  email?: string;
  tokenVersion?: number;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface PlatformTokenPayload {
  platformUserId: string;
  email: string;
  isSuperAdmin: boolean;
  iat?: number;
  exp?: number;
}

export function verifyTenantToken(token: string): TenantTokenPayload {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not configured");
  }
  return jwt.verify(token, secret) as TenantTokenPayload;
}

export function verifyPlatformToken(token: string): PlatformTokenPayload {
  const secret = process.env.PLATFORM_JWT_SECRET;
  if (!secret) {
    throw new Error("PLATFORM_JWT_SECRET is not configured");
  }
  return jwt.verify(token, secret) as PlatformTokenPayload;
}

/**
 * Sign a tenant access token. Always includes `tokenVersion` (defaults to 0)
 * and a fresh `jti` so revocation + replay-tracking work uniformly across the
 * monolith and auth-service.
 */
export function signTenantAccessToken(args: {
  userId: string;
  organizationId: string;
  email: string;
  role: string;
  tokenVersion?: number | null;
  expiresIn?: string;
}): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not configured");
  return jwt.sign(
    {
      userId: args.userId,
      organizationId: args.organizationId,
      email: args.email,
      role: args.role,
      tokenVersion: args.tokenVersion ?? 0,
      jti: randomUUID(),
    },
    secret,
    { expiresIn: args.expiresIn ?? "7d" } as jwt.SignOptions
  );
}

// =====================================================================
// Password complexity policy (Phase 1, Agent 3).
// Mirrors backend/src/lib/passwordPolicy.ts exactly so the monolith and
// every microservice apply identical rules.
// =====================================================================

export interface PasswordChecks {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  digit: boolean;
  special: boolean;
}

const SPECIAL_RE = /[^A-Za-z0-9]/;

export function passwordChecks(pw: string): PasswordChecks {
  return {
    minLength: pw.length >= 8,
    uppercase: /[A-Z]/.test(pw),
    lowercase: /[a-z]/.test(pw),
    digit: /[0-9]/.test(pw),
    special: SPECIAL_RE.test(pw),
  };
}

export function isStrongPassword(pw: string): boolean {
  const c = passwordChecks(pw);
  return c.minLength && c.uppercase && c.lowercase && c.digit && c.special;
}
