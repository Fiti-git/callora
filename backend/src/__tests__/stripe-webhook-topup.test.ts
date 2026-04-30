import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import http from "node:http";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M2 — webhook handling for PAYG top-up events.
 *
 * - payment_intent.succeeded with kind=PAYG_TOPUP → CreditLedger upsert + TOPUP row
 * - same event delivered twice → no-op (StripeWebhookEvent.processedAt guard)
 * - payment_intent.payment_failed with source=AUTO_RECHARGE → disables + email
 * - payment_intent without PAYG_TOPUP metadata → ignored
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_dummy";
process.env.NODE_ENV = "test";

async function runWebhook(eventObj: any, opts?: { existingProcessed?: boolean }) {
  vi.resetModules();

  const txnRows: any[] = [];
  const ledgerOps: any[] = [];
  const audits: any[] = [];
  const emails: any[] = [];
  const webhookEventStore: Record<string, any> = {};
  if (opts?.existingProcessed) {
    webhookEventStore[eventObj.id ?? "evt_x"] = {
      id: eventObj.id ?? "evt_x",
      processedAt: new Date(),
    };
  }

  vi.doMock("../services/stripe.js", () => ({
    verifyWebhook: () => eventObj,
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    stripe: null,
    ensureStripe: () => null,
  }));

  vi.doMock("../services/stripeBilling.js", () => ({
    ensureStripeCustomer: vi.fn(),
    createSetupIntent: vi.fn(),
    confirmDefaultPaymentMethod: vi.fn(),
    chargeTopUp: vi.fn(),
  }));

  vi.doMock("../lib/email.js", () => ({
    APP_URL: "http://localhost:3000",
    sendEmail: async (to: string, subject: string) => {
      emails.push({ to, subject });
    },
  }));

  vi.doMock("../lib/audit.js", () => ({
    writeAudit: async (a: any) => {
      audits.push(a);
    },
    writeAuditLog: async () => undefined,
  }));

  const ledgerStore: Record<string, any> = {};

  vi.doMock("../lib/prisma.js", () => ({
    default: {
      stripeWebhookEvent: {
        findUnique: async ({ where }: any) => webhookEventStore[where.id] ?? null,
        upsert: async ({ where, create }: any) => {
          if (!webhookEventStore[where.id]) webhookEventStore[where.id] = create;
          return webhookEventStore[where.id];
        },
        update: async ({ where, data }: any) => {
          webhookEventStore[where.id] = { ...webhookEventStore[where.id], ...data };
          return webhookEventStore[where.id];
        },
      },
      creditLedger: {
        update: async ({ where, data }: any) => {
          ledgerOps.push({ kind: "update", where, data });
          ledgerStore[where.organizationId] = {
            ...(ledgerStore[where.organizationId] ?? {}),
            ...data,
          };
          return ledgerStore[where.organizationId];
        },
      },
      creditTransaction: {
        findFirst: async () => null,
      },
      organization: {
        findUnique: async () => ({
          id: "org_a",
          users: [{ email: "admin@x.com", name: "Admin", role: "ADMIN" }],
        }),
      },
      $transaction: async (fn: any) =>
        fn({
          creditLedger: {
            upsert: async ({ where, create, update }: any) => {
              const orgId = where.organizationId;
              const cur = ledgerStore[orgId] ?? { ...create, balanceCents: 0, lifetimeAddedCents: 0 };
              // Apply increments naively
              const incBalance = update?.balanceCents?.increment ?? 0;
              const incLifetime = update?.lifetimeAddedCents?.increment ?? 0;
              const next = ledgerStore[orgId]
                ? {
                    ...cur,
                    balanceCents: (cur.balanceCents ?? 0) + incBalance,
                    lifetimeAddedCents: (cur.lifetimeAddedCents ?? 0) + incLifetime,
                  }
                : { id: "led_" + orgId, organizationId: orgId, ...create };
              ledgerStore[orgId] = next;
              ledgerOps.push({ kind: "upsert", where, create, update });
              return next;
            },
          },
          creditTransaction: {
            findFirst: async () => null,
            create: async ({ data }: any) => {
              txnRows.push(data);
              return { id: "tx_" + txnRows.length, ...data };
            },
          },
        }),
      // Stubs for legacy event handlers
      subscription: {
        update: async () => ({}),
        findFirst: async () => null,
      },
    },
  }));

  vi.doMock("../lib/sentry.js", () => ({
    Sentry: { captureException: vi.fn() },
    sentryEnabled: false,
  }));

  const mod = await import("../routes/billing.js");
  const app = express();
  app.use("/api/billing", mod.default);

  const body = JSON.stringify({ raw: true });
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/api/billing/webhook",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
            "stripe-signature": "t=1,v1=any",
          },
        },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => {
            server.close();
            resolve();
          });
        }
      );
      req.on("error", (e) => {
        server.close();
        reject(e);
      });
      req.write(body);
      req.end();
    });
  });

  vi.doUnmock("../services/stripe.js");
  vi.doUnmock("../services/stripeBilling.js");
  vi.doUnmock("../lib/prisma.js");
  vi.doUnmock("../lib/email.js");
  vi.doUnmock("../lib/audit.js");
  vi.doUnmock("../lib/sentry.js");

  return { txnRows, ledgerOps, audits, emails };
}

beforeEach(() => {
  vi.resetModules();
});

describe("stripe webhook — payment_intent.succeeded (PAYG_TOPUP)", () => {
  it("credits the ledger + writes a TOPUP transaction with positive amount", async () => {
    const { txnRows, audits } = await runWebhook({
      id: "evt_topup_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_1",
          amount: 2500,
          metadata: {
            kind: "PAYG_TOPUP",
            source: "MANUAL",
            organizationId: "org_a",
            amountCents: "2500",
          },
        },
      },
    });
    expect(txnRows.length).toBe(1);
    expect(txnRows[0].kind).toBe("TOPUP");
    expect(txnRows[0].amountCents).toBe(2500);
    expect(txnRows[0].ref).toBe("pi_1");
    expect(audits.find((a) => a.action === "CREDIT_TOPUP_RECEIVED")).toBeTruthy();
  });

  it("AUTO_RECHARGE source → kind = TOPUP_AUTO", async () => {
    const { txnRows } = await runWebhook({
      id: "evt_topup_2",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_2",
          amount: 2500,
          metadata: {
            kind: "PAYG_TOPUP",
            source: "AUTO_RECHARGE",
            organizationId: "org_a",
          },
        },
      },
    });
    expect(txnRows[0]?.kind).toBe("TOPUP_AUTO");
  });

  it("ignores payment_intent without PAYG_TOPUP metadata", async () => {
    const { txnRows, audits } = await runWebhook({
      id: "evt_other",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_x", amount: 1000, metadata: {} } },
    });
    expect(txnRows.length).toBe(0);
    expect(audits.find((a) => a.action === "CREDIT_TOPUP_RECEIVED")).toBeUndefined();
  });

  it("second delivery of the same event is a no-op", async () => {
    const { txnRows } = await runWebhook(
      {
        id: "evt_dup",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_dup",
            amount: 2500,
            metadata: { kind: "PAYG_TOPUP", source: "MANUAL", organizationId: "org_a" },
          },
        },
      },
      { existingProcessed: true }
    );
    expect(txnRows.length).toBe(0);
  });
});

describe("stripe webhook — payment_intent.payment_failed", () => {
  it("AUTO_RECHARGE source disables ledger + sends email + audits AUTO_RECHARGE_FAILED", async () => {
    const { ledgerOps, emails, audits } = await runWebhook({
      id: "evt_fail_1",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_failed",
          metadata: {
            kind: "PAYG_TOPUP",
            source: "AUTO_RECHARGE",
            organizationId: "org_a",
          },
          last_payment_error: { code: "card_declined", message: "declined" },
        },
      },
    });
    expect(
      ledgerOps.find((o) => o.kind === "update" && o.data?.autoRechargeEnabled === false)
    ).toBeTruthy();
    expect(emails.length).toBeGreaterThanOrEqual(1);
    expect(audits.find((a) => a.action === "AUTO_RECHARGE_FAILED")).toBeTruthy();
  });

  it("MANUAL source does NOT disable auto-recharge", async () => {
    const { ledgerOps, audits } = await runWebhook({
      id: "evt_fail_2",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_failed_2",
          metadata: {
            kind: "PAYG_TOPUP",
            source: "MANUAL",
            organizationId: "org_a",
          },
        },
      },
    });
    expect(
      ledgerOps.find((o) => o.kind === "update" && o.data?.autoRechargeEnabled === false)
    ).toBeUndefined();
    expect(audits.find((a) => a.action === "MANUAL_TOPUP_FAILED")).toBeTruthy();
  });
});
