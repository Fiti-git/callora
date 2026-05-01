// Compliance module tests. The calling-service does not currently have a
// test runner configured; these tests are written to be runnable under
// either vitest or jest once one is added. They mock @callora/shared so
// no DB connection is required.
//
// To run locally once a runner is wired up:
//   npx vitest run src/compliance/__tests__/compliance.test.ts
//   - or -
//   npx jest src/compliance/__tests__/compliance.test.ts
//
// Until then, this file documents the expected behavior and serves as a
// regression contract.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — runner globals (describe/it/expect/jest|vi) are not in deps.

import {
  complianceCheck,
  injectConsentDisclosure,
  recordingRetentionDays,
  classifyNumber,
} from "../index.js";

// ---------------------------------------------------------------
// Mocking @callora/shared.prisma
// ---------------------------------------------------------------
const mockState = {
  platformDnc: new Map<string, { phoneE164: string; source: string; expiresAt: Date | null }>(),
  tenantDnc: [] as Array<{ phoneHash: string; organizationId: string | null; source: string; createdAt: Date }>,
  subscription: null as null | { plan: { tier: string } },
};

jest.mock("@callora/shared", () => ({
  prisma: {
    dncEntry: {
      findUnique: async ({ where }: any) => mockState.platformDnc.get(where.phoneE164) ?? null,
      upsert: async () => undefined,
    },
    dNCEntry: {
      findFirst: async ({ where }: any) => {
        const orgIds: Array<string | null> = (where.OR ?? []).map((c: any) => c.organizationId);
        return (
          mockState.tenantDnc.find(
            (r) =>
              r.phoneHash === where.phoneHash &&
              orgIds.includes(r.organizationId)
          ) ?? null
        );
      },
    },
    subscription: {
      findUnique: async () => mockState.subscription,
    },
  },
}));

beforeEach(() => {
  mockState.platformDnc.clear();
  mockState.tenantDnc = [];
  mockState.subscription = { plan: { tier: "STARTER" } };
  process.env.DNC_HASH_PEPPER = "test-pepper";
});

describe("classifyNumber", () => {
  it("classifies standard NANP", () => {
    expect(classifyNumber("+14155551234").kind).toBe("standard");
  });
  it("flags premium 1-900", () => {
    expect(classifyNumber("+19005551234").kind).toBe("premium");
  });
  it("flags premium 1-976", () => {
    expect(classifyNumber("+19765551234").kind).toBe("premium");
  });
  it("flags international", () => {
    expect(classifyNumber("+447700900123").kind).toBe("international");
  });
  it("rejects invalid format", () => {
    expect(classifyNumber("415-555-1234").kind).toBe("invalid");
    expect(classifyNumber("+0123").kind).toBe("invalid");
  });
});

describe("complianceCheck", () => {
  it("blocks premium numbers", async () => {
    const r = await complianceCheck("+19005551234", "org_1");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("premium_rate_blocked");
  });

  it("blocks invalid formats", async () => {
    const r = await complianceCheck("notaphone", "org_1");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("invalid_phone_format");
  });

  it("blocks platform DNC hits", async () => {
    mockState.platformDnc.set("+14155551234", {
      phoneE164: "+14155551234",
      source: "ftc",
      expiresAt: null,
    });
    const r = await complianceCheck("+14155551234", "org_1");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/dnc_platform/);
  });

  it("blocks tenant DNC hits", async () => {
    const crypto = require("node:crypto");
    const phone = "+14155559999";
    const hash = crypto
      .createHash("sha256")
      .update(`test-pepper|${phone}`)
      .digest("hex");
    mockState.tenantDnc.push({
      phoneHash: hash,
      organizationId: "org_1",
      source: "manual",
      createdAt: new Date(),
    });
    const r = await complianceCheck(phone, "org_1");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/dnc_tenant/);
  });

  it("allows a clean standard US number", async () => {
    const r = await complianceCheck("+14155551234", "org_1");
    expect(r.allowed).toBe(true);
  });

  it("blocks international on STARTER plan", async () => {
    mockState.subscription = { plan: { tier: "STARTER" } };
    const r = await complianceCheck("+447700900123", "org_1");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("international_not_allowed_on_plan");
  });

  it("allows international on ENTERPRISE plan", async () => {
    mockState.subscription = { plan: { tier: "ENTERPRISE" } };
    const r = await complianceCheck("+447700900123", "org_1");
    expect(r.allowed).toBe(true);
  });

  it("ignores expired platform DNC entries", async () => {
    mockState.platformDnc.set("+14155551234", {
      phoneE164: "+14155551234",
      source: "ftc",
      expiresAt: new Date(Date.now() - 60_000),
    });
    const r = await complianceCheck("+14155551234", "org_1");
    expect(r.allowed).toBe(true);
  });
});

describe("injectConsentDisclosure", () => {
  it("prepends a disclosure with the org name", () => {
    const out = injectConsentDisclosure("You are Alex.", "Acme Co");
    expect(out).toMatch(/Acme Co/);
    expect(out).toMatch(/may be recorded/);
    expect(out).toMatch(/You are Alex\./);
  });
  it("falls back when org name is empty", () => {
    const out = injectConsentDisclosure("base", "");
    expect(out).toMatch(/our team/);
  });
  it("is idempotent", () => {
    const once = injectConsentDisclosure("base", "Acme");
    const twice = injectConsentDisclosure(once, "Acme");
    expect(twice).toBe(once);
  });
});

describe("recordingRetentionDays", () => {
  it("returns plan-tier days", () => {
    expect(recordingRetentionDays("FREE")).toBe(7);
    expect(recordingRetentionDays("STARTER")).toBe(30);
    expect(recordingRetentionDays("PRO")).toBe(90);
    expect(recordingRetentionDays("ENTERPRISE")).toBe(365);
  });
  it("falls back to FREE for unknown tiers", () => {
    expect(recordingRetentionDays("MYSTERY" as any)).toBe(7);
  });
});
