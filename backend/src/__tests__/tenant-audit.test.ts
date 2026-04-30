import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

/**
 * Tenant AuditLog helper — verifies the writeAuditLog branch logic without
 * a live DB. The Prisma client is mocked so we can inspect the row that
 * *would* be inserted.
 *
 * Coverage mirrors the spec:
 *   - Tenant requests resolve to actorType=TENANT_USER + targetOrganizationId.
 *   - Platform requests resolve to actorType=PLATFORM_USER.
 *   - Impersonated tenant requests are attributed to the platform user, with
 *     the original tenant userId stored in metadata.impersonatedTenantUserId.
 *   - When prisma.auditLog.create throws, writeAuditLog SWALLOWS the error
 *     (must not break the user's request).
 */

let captured: any[] = [];
let createShouldThrow = false;

vi.mock("../lib/prisma.js", () => ({
  default: {
    auditLog: {
      create: async (args: any) => {
        if (createShouldThrow) throw new Error("DB down");
        captured.push(args.data);
        return { id: "a1" };
      },
    },
  },
}));

vi.mock("../lib/sentry.js", () => ({
  Sentry: { captureException: () => {} },
  sentryEnabled: false,
}));

beforeEach(() => {
  captured = [];
  createShouldThrow = false;
});

describe("writeAuditLog actor-type resolution", () => {
  it("attributes tenant requests to TENANT_USER and stamps targetOrganizationId", async () => {
    const { writeAuditLog } = await import("../lib/audit.js");
    const fakeReq: any = {
      user: { userId: "u1", organizationId: "org1", email: "x", role: "ADMIN" },
    };
    await writeAuditLog(fakeReq, "LEAD_CREATE", "Lead", "lead1", { name: "x" });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      actorType: "TENANT_USER",
      actorId: "u1",
      organizationId: "org1",
      targetOrganizationId: "org1",
      action: "LEAD_CREATE",
      entity: "Lead",
      entityId: "lead1",
    });
    expect(captured[0].metadata).toMatchObject({ diff: { name: "x" } });
  });

  it("attributes platform requests to PLATFORM_USER", async () => {
    const { writeAuditLog } = await import("../lib/audit.js");
    const fakeReq: any = {
      platformUser: { id: "p1", email: "a@a", isSuperAdmin: true },
    };
    await writeAuditLog(fakeReq, "ORG_SUSPEND", "Organization", "orgX");
    expect(captured[0]).toMatchObject({
      actorType: "PLATFORM_USER",
      actorId: "p1",
    });
  });

  it("attributes impersonated tenant requests to the platform user", async () => {
    const { writeAuditLog } = await import("../lib/audit.js");
    const fakeReq: any = {
      user: {
        userId: "u_tenant",
        organizationId: "org1",
        email: "x",
        role: "ADMIN",
        impersonatedBy: "p_root",
      },
    };
    await writeAuditLog(fakeReq, "DEAL_DELETE", "Deal", "d1");
    expect(captured[0]).toMatchObject({
      actorType: "PLATFORM_USER",
      actorId: "p_root",
      // Tenant org still recorded so the act is visible to the affected tenant.
      targetOrganizationId: "org1",
    });
    expect(captured[0].metadata).toMatchObject({
      impersonatedTenantUserId: "u_tenant",
    });
  });

  it("does not throw when prisma.auditLog.create fails", async () => {
    createShouldThrow = true;
    const { writeAuditLog } = await import("../lib/audit.js");
    const fakeReq: any = {
      user: { userId: "u1", organizationId: "org1", email: "x", role: "ADMIN" },
    };
    // The call must resolve, not reject.
    await expect(
      writeAuditLog(fakeReq, "LEAD_CREATE", "Lead", "l1")
    ).resolves.toBeUndefined();
    expect(captured).toHaveLength(0);
  });
});
