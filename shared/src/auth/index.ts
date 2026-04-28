import jwt from "jsonwebtoken";

export interface TenantTokenPayload {
  userId: string;
  organizationId: string;
  role: string;
  email?: string;
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
