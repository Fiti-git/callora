import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 5 Agent M2 — end-to-end credit top-up flow.
 *
 * DB-gated: requires a live DATABASE_URL with the current schema (CreditLedger
 * + CreditTransaction + TenantProvisioning). Skips gracefully on stale schemas.
 *
 * Stripe SDK is mocked at module scope. We exercise the *handler* path by
 * feeding a synthetic event into the same code that the webhook calls.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
  } catch {
    dbUp = false;
  }
  if (dbUp) {
    try {
      await prisma.$queryRawUnsafe('SELECT "balanceCents" FROM "CreditLedger" LIMIT 1');
      schemaReady = true;
    } catch {
      schemaReady = false;
    }
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PAYG top-up end-to-end flow", () => {
  it("two consecutive succeeded events accumulate ledger balance to $50", async () => {
    if (!dbUp || !schemaReady) {
      console.warn("skipping: DB or schema not ready");
      return;
    }

    // Stripe SDK + webhook signature verification mocked.
    vi.resetModules();
    vi.doMock("../services/stripe.js", () => ({
      verifyWebhook: (rawBody: Buffer) => JSON.parse(rawBody.toString()),
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
      stripe: {},
      ensureStripe: () => ({}),
    }));
    vi.doMock("../services/stripeBilling.js", () => ({
      ensureStripeCustomer: vi.fn(),
      createSetupIntent: vi.fn(),
      confirmDefaultPaymentMethod: vi.fn(),
      chargeTopUp: vi.fn(),
    }));

    const express = (await import("express")).default;
    const http = await import("node:http");
    const billingMod = await import("../routes/billing.js");

    const app = express();
    app.use("/api/billing", billingMod.default);

    // Set up a fresh org + ensure no pre-existing rows.
    const orgId = "test-topup-org-" + Date.now();
    await prisma.organization.create({
      data: { id: orgId, name: "Topup Test Org", status: "ACTIVE" },
    });

    async function postEvent(eventId: string, paymentIntentId: string) {
      const body = JSON.stringify({
        id: eventId,
        type: "payment_intent.succeeded",
        livemode: false,
        data: {
          object: {
            id: paymentIntentId,
            amount: 2500,
            metadata: {
              kind: "PAYG_TOPUP",
              source: "MANUAL",
              organizationId: orgId,
              amountCents: "2500",
            },
          },
        },
      });
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
                "stripe-signature": "any",
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
    }

    try {
      await postEvent("evt_topup_a", "pi_a");
      let ledger = await prisma.creditLedger.findUnique({ where: { organizationId: orgId } });
      expect(ledger?.balanceCents).toBe(2500);

      await postEvent("evt_topup_b", "pi_b");
      ledger = await prisma.creditLedger.findUnique({ where: { organizationId: orgId } });
      expect(ledger?.balanceCents).toBe(5000);

      const txns = await prisma.creditTransaction.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "asc" },
      });
      expect(txns.length).toBe(2);
      expect(txns.every((t) => t.kind === "TOPUP")).toBe(true);
      expect(txns.map((t) => t.amountCents)).toEqual([2500, 2500]);

      // Audit row was written.
      const audits = await prisma.auditLog.findMany({
        where: { organizationId: orgId, action: "CREDIT_TOPUP_RECEIVED" },
      });
      expect(audits.length).toBe(2);
    } finally {
      // Cleanup
      await prisma.creditTransaction
        .deleteMany({ where: { organizationId: orgId } })
        .catch(() => undefined);
      await prisma.creditLedger
        .delete({ where: { organizationId: orgId } })
        .catch(() => undefined);
      await prisma.auditLog
        .deleteMany({ where: { organizationId: orgId } })
        .catch(() => undefined);
      await prisma.stripeWebhookEvent
        .deleteMany({ where: { id: { in: ["evt_topup_a", "evt_topup_b"] } } })
        .catch(() => undefined);
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    }
  });
});
