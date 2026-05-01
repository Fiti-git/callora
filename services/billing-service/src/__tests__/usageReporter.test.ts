import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createUsageRecord: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  itemsCreate: vi.fn(),
  getServiceSecret: vi.fn().mockResolvedValue("sk_test_xxx"),
  subscriptionFindUnique: vi.fn(),
}));

vi.mock("stripe", () => {
  function StripeCtor(this: any, _key: string, _opts?: any) {
    this.subscriptionItems = {
      createUsageRecord: mocks.createUsageRecord,
      create: mocks.itemsCreate,
    };
    this.subscriptions = { retrieve: mocks.subscriptionsRetrieve };
    this.checkout = { sessions: { create: vi.fn() } };
    this.billingPortal = { sessions: { create: vi.fn() } };
    this.webhooks = { constructEvent: vi.fn() };
  }
  return { default: StripeCtor };
});

vi.mock("../config.js", () => ({
  getServiceSecret: mocks.getServiceSecret,
}));

vi.mock("@callora/shared", () => ({
  prisma: {
    subscription: { findUnique: mocks.subscriptionFindUnique },
  },
  timeVendorCall: async (...args: any[]) => {
    const fn = args[args.length - 1];
    return typeof fn === "function" ? fn() : undefined;
  },
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
}));

import { reportUsage, setMeterItemCache } from "../services/stripe.js";

beforeEach(() => {
  mocks.createUsageRecord.mockReset();
  mocks.subscriptionsRetrieve.mockReset();
  mocks.subscriptionFindUnique.mockReset();
  mocks.subscriptionFindUnique.mockResolvedValue({
    stripeSubscriptionId: "sub_123",
  });
  process.env.STRIPE_METER_CALL_MINUTES = "price_call_minutes";
  setMeterItemCache("org_x", "call_minutes", "si_calls_x");
});

describe("reportUsage", () => {
  it("sends idempotencyKey shaped 'usage:{orgId}:{meter}:{hourBucket}'", async () => {
    mocks.createUsageRecord.mockResolvedValue({ id: "mbur_1" });
    const result = await reportUsage("org_x", "call_minutes", 5, "2026-04-30T14");
    expect(result).toEqual({ ok: true, usageRecordId: "mbur_1" });
    expect(mocks.createUsageRecord).toHaveBeenCalledTimes(1);
    const args = mocks.createUsageRecord.mock.calls[0];
    expect(args[0]).toBe("si_calls_x");
    expect(args[1]).toMatchObject({ quantity: 5, action: "increment" });
    expect(args[2]).toEqual({
      idempotencyKey: "usage:org_x:call_minutes:2026-04-30T14",
    });
  });

  it("returns ok:false when org has no Stripe subscription", async () => {
    mocks.subscriptionFindUnique.mockResolvedValueOnce(null);
    const out = await reportUsage("org_no_sub", "call_minutes", 1, "2026-04-30T15");
    expect(out).toEqual({ ok: false, reason: "no stripe subscription" });
    expect(mocks.createUsageRecord).not.toHaveBeenCalled();
  });

  it("rejects non-positive quantities", async () => {
    const out = await reportUsage("org_x", "call_minutes", 0, "2026-04-30T16");
    expect(out.ok).toBe(false);
  });
});
