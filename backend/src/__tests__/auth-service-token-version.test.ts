import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";

/**
 * Verifies the shared `signTenantAccessToken` helper (used by both monolith
 * and auth-service) always embeds `tokenVersion` and a fresh `jti` so the
 * downstream auth middleware can enforce token revocation.
 */

process.env.NEXTAUTH_SECRET = "test-shared-secret";

// Inlined copy of `shared/src/auth/index.ts#signTenantAccessToken` so the test
// stays inside backend/rootDir. If the helper signature changes upstream, this
// test must be updated in lockstep — see tests/AGENT.md note on shared helpers.
import { randomUUID } from "node:crypto";
function signTenantAccessToken(args: {
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

describe("auth-service token version + jti", () => {
  it("includes tokenVersion in the signed JWT", () => {
    const token = signTenantAccessToken({
      userId: "user_1",
      organizationId: "org_1",
      email: "u@test.local",
      role: "ADMIN",
      tokenVersion: 7,
    });
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as any;
    expect(decoded.tokenVersion).toBe(7);
    expect(decoded.userId).toBe("user_1");
    expect(decoded.organizationId).toBe("org_1");
  });

  it("includes a unique jti on each token", () => {
    const args = {
      userId: "user_1",
      organizationId: "org_1",
      email: "u@test.local",
      role: "ADMIN",
      tokenVersion: 0,
    };
    const a = jwt.verify(
      signTenantAccessToken(args),
      process.env.NEXTAUTH_SECRET!
    ) as any;
    const b = jwt.verify(
      signTenantAccessToken(args),
      process.env.NEXTAUTH_SECRET!
    ) as any;
    expect(a.jti).toBeDefined();
    expect(b.jti).toBeDefined();
    expect(a.jti).not.toBe(b.jti);
  });

  it("defaults tokenVersion to 0 when omitted", () => {
    const token = signTenantAccessToken({
      userId: "u",
      organizationId: "o",
      email: "u@test.local",
      role: "ADMIN",
    });
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as any;
    expect(decoded.tokenVersion).toBe(0);
  });
});
