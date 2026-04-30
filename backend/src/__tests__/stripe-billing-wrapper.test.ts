import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M2 — Stripe billing wrapper unit tests.
 *
 * Logic-only: Stripe SDK + Prisma are mocked. We assert the wrapper sends
 * the right shape to Stripe (idempotency keys, metadata) and persists to
 * TenantProvisioning correctly.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.NODE_ENV = "test";

type StripeCall = { method: string; args: any[]; opts?: any };
const stripeCalls: StripeCall[] = [];

function makeStripeMock() {
  return {
    customers: {
      create: vi.fn(async (args: any, opts: any) => {
        stripeCalls.push({ method: "customers.create", args: [args], opts });
        return { id: "cus_new_123", metadata: args.metadata };
      }),
      update: vi.fn(async (id: string, args: any) => {
        stripeCalls.push({ method: "customers.update", args: [id, args] });
        return { id };
      }),
    },
    setupIntents: {
      create: vi.fn(async (args: any, opts: any) => {
        stripeCalls.push({ method: "setupIntents.create", args: [args], opts });
        return {
          id: "seti_1",
          client_secret: "seti_1_secret_x",
        };
      }),
    },
    paymentMethods: {
      attach: vi.fn(async (pmId: string, args: any) => {
        stripeCalls.push({ method: "paymentMethods.attach", args: [pmId, args] });
        return { id: pmId };
      }),
    },
    paymentIntents: {
      create: vi.fn(async (args: any, opts: any) => {
        stripeCalls.push({ method: "paymentIntents.create", args: [args], opts });
        return { id: "pi_topup_1", status: "succeeded" };
      }),
    },
    refunds: {
      create: vi.fn(async (args: any, opts: any) => {
        stripeCalls.push({ method: "refunds.create", args: [args], opts });
        return { id: "re_1", amount: args.amount };
      }),
    },
  };
}

const stripeMock = makeStripeMock();

vi.mock("../services/stripe.js", () => ({
  ensureStripe: () => stripeMock,
  stripe: stripeMock,
}));

const provisioningStore: Record<string, any> = {};
const orgs: Record<string, any> = {
  org_a: { id: "org_a", name: "Org A" },
  org_b: { id: "org_b", name: "Org B" },
};
const ctxStore: Record<string, any> = {};

vi.mock("../lib/prisma.js", () => ({
  default: {
    tenantProvisioning: {
      findUnique: vi.fn(async ({ where, select }: any) => {
        const row = provisioningStore[where.organizationId];
        if (!row) return null;
        if (select) {
          const out: any = {};
          for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
          return out;
        }
        return row;
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const orgId = where.organizationId;
        const existing = provisioningStore[orgId];
        provisioningStore[orgId] = existing
          ? { ...existing, ...update }
          : { id: "tp_" + orgId, ...create };
        return provisioningStore[orgId];
      }),
    },
    organization: {
      findUnique: vi.fn(async ({ where }: any) => orgs[where.id] ?? null),
    },
    creditTransaction: {
      findFirst: vi.fn(async ({ where }: any) => ctxStore.debit ?? null),
    },
    creditLedger: {
      upsert: vi.fn(async () => ({ id: "led_1", balanceCents: 2500 })),
    },
    $transaction: vi.fn(async (fn: any) =>
      fn({
        creditLedger: {
          upsert: vi.fn(async () => ({ id: "led_1", balanceCents: 2500 })),
        },
        creditTransaction: {
          findFirst: vi.fn(async () => null),
          create: vi.fn(async (args: any) => ({ id: "tx_new", ...args.data })),
        },
      })
    ),
  },
}));

vi.mock("../lib/sentry.js", () => ({ Sentry: { captureException: vi.fn() }, sentryEnabled: false }));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  stripeCalls.length = 0;
  for (const k of Object.keys(provisioningStore)) delete provisioningStore[k];
  for (const k of Object.keys(ctxStore)) delete ctxStore[k];
  Object.values(stripeMock.customers).forEach((fn: any) => fn.mockClear?.());
  Object.values(stripeMock.setupIntents).forEach((fn: any) => fn.mockClear?.());
  Object.values(stripeMock.paymentIntents).forEach((fn: any) => fn.mockClear?.());
  Object.values(stripeMock.paymentMethods).forEach((fn: any) => fn.mockClear?.());
  Object.values(stripeMock.refunds).forEach((fn: any) => fn.mockClear?.());
});

describe("stripeBilling.ensureStripeCustomer", () => {
  it("creates a Customer + persists id when none exists", async () => {
    const { ensureStripeCustomer } = await import("../services/stripeBilling.js");
    const id = await ensureStripeCustomer("org_a");
    expect(id).toBe("cus_new_123");
    const create = stripeCalls.find((c) => c.method === "customers.create");
    expect(create?.opts?.idempotencyKey).toBe("customer:org_a");
    expect(create?.args?.[0]?.metadata?.organizationId).toBe("org_a");
    expect(provisioningStore.org_a.stripeCustomerId).toBe("cus_new_123");
  });

  it("returns existing stripeCustomerId without re-creating", async () => {
    provisioningStore.org_a = { id: "tp", organizationId: "org_a", stripeCustomerId: "cus_existing" };
    const { ensureStripeCustomer } = await import("../services/stripeBilling.js");
    const id = await ensureStripeCustomer("org_a");
    expect(id).toBe("cus_existing");
    expect(stripeCalls.find((c) => c.method === "customers.create")).toBeUndefined();
  });
});

describe("stripeBilling.confirmDefaultPaymentMethod", () => {
  it("attaches PM, sets default on customer, persists to TenantProvisioning", async () => {
    provisioningStore.org_a = { id: "tp", organizationId: "org_a", stripeCustomerId: "cus_existing" };
    const { confirmDefaultPaymentMethod } = await import("../services/stripeBilling.js");
    await confirmDefaultPaymentMethod("org_a", "pm_123");

    expect(stripeCalls.find((c) => c.method === "paymentMethods.attach")?.args).toEqual([
      "pm_123",
      { customer: "cus_existing" },
    ]);
    const update = stripeCalls.find((c) => c.method === "customers.update");
    expect(update?.args[0]).toBe("cus_existing");
    expect(update?.args[1]?.invoice_settings?.default_payment_method).toBe("pm_123");
    expect(provisioningStore.org_a.defaultPaymentMethodId).toBe("pm_123");
  });
});

describe("stripeBilling.chargeTopUp", () => {
  it("uses provided idempotencyKey + correct metadata shape", async () => {
    provisioningStore.org_a = {
      id: "tp",
      organizationId: "org_a",
      stripeCustomerId: "cus_x",
      defaultPaymentMethodId: "pm_x",
    };
    const { chargeTopUp } = await import("../services/stripeBilling.js");
    const result = await chargeTopUp("org_a", 2500, {
      source: "AUTO_RECHARGE",
      idempotencyKey: "auto-org_a-2026-04-30",
    });
    expect(result.paymentIntentId).toBe("pi_topup_1");
    const call = stripeCalls.find((c) => c.method === "paymentIntents.create");
    expect(call?.opts?.idempotencyKey).toBe("auto-org_a-2026-04-30");
    expect(call?.args[0].amount).toBe(2500);
    expect(call?.args[0].metadata.kind).toBe("PAYG_TOPUP");
    expect(call?.args[0].metadata.source).toBe("AUTO_RECHARGE");
    expect(call?.args[0].off_session).toBe(true);
  });

  it("rejects when no payment method on file", async () => {
    provisioningStore.org_a = { id: "tp", organizationId: "org_a", stripeCustomerId: "cus_x" };
    const { chargeTopUp } = await import("../services/stripeBilling.js");
    await expect(
      chargeTopUp("org_a", 2500, { source: "MANUAL" })
    ).rejects.toThrow(/no payment method/i);
  });
});

describe("stripeBilling.refundCreditTransaction", () => {
  it("rejects cross-org access (treated as not found)", async () => {
    // Mock returns null for cross-org. Simulate by returning null:
    const prismaModule = (await import("../lib/prisma.js")) as any;
    prismaModule.default.creditTransaction.findFirst.mockResolvedValueOnce(null);
    const { refundCreditTransaction } = await import("../services/stripeBilling.js");
    await expect(
      refundCreditTransaction("org_b", "tx_belongs_to_org_a", "fraud")
    ).rejects.toThrow(/not found/i);
  });
});
