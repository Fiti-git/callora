import { describe, it, expect, vi } from "vitest";
import express from "express";
import http from "node:http";

/**
 * Same Stripe event id processed twice must short-circuit the second time.
 * The handler logic (org/sub status updates, audit) should run exactly once.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_dummy";

async function postRaw(app: express.Express, body: string): Promise<{ status: number; body: any }> {
  return await new Promise((resolve, reject) => {
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
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let parsed: any;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = text;
            }
            server.close();
            resolve({ status: res.statusCode || 0, body: parsed });
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

describe("Stripe webhook idempotency", () => {
  it("second delivery of the same event id is a no-op (no extra side-effects)", async () => {
    vi.resetModules();

    const subscriptionUpdates: any[] = [];
    const organizationUpdates: any[] = [];
    let processedAt: Date | null = null;
    let upsertCalls = 0;
    let processedMarkCalls = 0;

    vi.doMock("../services/stripe.js", () => ({
      verifyWebhook: () => ({
        id: "evt_idem_1",
        type: "checkout.session.completed",
        livemode: false,
        data: {
          object: {
            metadata: { organizationId: "org_idem" },
            customer: "cus_idem",
            subscription: "sub_idem",
          },
        },
      }),
      stripe: null,
      ensureStripe: () => null,
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
    }));

    vi.doMock("../lib/email.js", () => ({
      APP_URL: "http://localhost:3000",
      sendEmail: async () => {},
    }));

    vi.doMock("../lib/audit.js", () => ({
      writeAudit: async () => {},
      writeAuditLog: async () => {},
    }));

    vi.doMock("../lib/prisma.js", () => ({
      default: {
        stripeWebhookEvent: {
          findUnique: async ({ where }: any) => {
            if (processedAt && where.id === "evt_idem_1") {
              return { id: where.id, processedAt };
            }
            return null;
          },
          upsert: async () => {
            upsertCalls++;
            return {};
          },
          update: async ({ data }: any) => {
            processedMarkCalls++;
            if (data?.processedAt) processedAt = data.processedAt;
            return {};
          },
        },
        subscription: {
          update: async (args: any) => {
            subscriptionUpdates.push(args);
            return {};
          },
          findFirst: async () => null,
        },
        organization: {
          update: async (args: any) => {
            organizationUpdates.push(args);
            return {};
          },
        },
        dunningState: {
          findUnique: async () => null,
          upsert: async () => ({}),
        },
      },
    }));

    const mod = await import("../routes/billing.js");
    const app = express();
    app.use("/api/billing", mod.default);

    const body = JSON.stringify({ raw: true });

    const r1 = await postRaw(app, body);
    expect(r1.status).toBe(200);
    expect(r1.body?.duplicate).not.toBe(true);
    const subUpdatesAfterFirst = subscriptionUpdates.length;
    const orgUpdatesAfterFirst = organizationUpdates.length;
    expect(subUpdatesAfterFirst).toBeGreaterThan(0);

    const r2 = await postRaw(app, body);
    expect(r2.status).toBe(200);
    expect(r2.body?.duplicate).toBe(true);
    // No additional DB mutations on the second call.
    expect(subscriptionUpdates.length).toBe(subUpdatesAfterFirst);
    expect(organizationUpdates.length).toBe(orgUpdatesAfterFirst);

    vi.doUnmock("../services/stripe.js");
    vi.doUnmock("../lib/prisma.js");
    vi.doUnmock("../lib/email.js");
    vi.doUnmock("../lib/audit.js");
    vi.resetModules();
  });
});
