import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import http from "node:http";

/**
 * invoice.payment_succeeded webhook with an open DunningState should:
 *   - update DunningState.status → RESOLVED
 *   - update Organization.status → ACTIVE
 *   - send DUNNING_RECOVERED email to admin
 *   - write a DUNNING_RESOLVED audit row
 *
 * Stripe SDK + prisma + email + audit are all mocked.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_dummy";

async function postRaw(
  app: express.Express,
  pathStr: string,
  body: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return await new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: pathStr,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
            ...headers,
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
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      req.write(body);
      req.end();
    });
  });
}

describe("invoice.payment_succeeded resolves open dunning state", () => {
  beforeAll(() => {
    vi.resetModules();
  });

  it("RESOLVED + org ACTIVE + DUNNING_RECOVERED email + audit", async () => {
    vi.resetModules();

    const dunningUpdates: any[] = [];
    const orgUpdates: any[] = [];
    const subUpdateMany: any[] = [];
    const audits: any[] = [];
    const emails: any[] = [];

    const openDunning = {
      id: "dun_1",
      organizationId: "org_1",
      invoiceId: "in_1",
      status: "ACTIVE",
      attempt: 1,
    };

    vi.doMock("../services/stripe.js", () => ({
      verifyWebhook: () => ({
        id: "evt_recovery_1",
        type: "invoice.payment_succeeded",
        livemode: false,
        data: { object: { id: "in_1", customer: "cus_1" } },
      }),
      stripe: null,
      ensureStripe: () => null,
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
    }));

    vi.doMock("../lib/email.js", () => ({
      APP_URL: "http://localhost:3000",
      sendEmail: async (to: string, subject: string, _html: string, opts: any) => {
        emails.push({ to, subject, template: opts?.template });
      },
    }));

    vi.doMock("../lib/audit.js", () => ({
      writeAudit: async (params: any) => {
        audits.push(params);
      },
      writeAuditLog: async (_req: any, action: string, entity: any, entityId: any) => {
        audits.push({ action, entity, entityId });
      },
    }));

    vi.doMock("../lib/prisma.js", () => ({
      default: {
        stripeWebhookEvent: {
          findUnique: async () => null,
          upsert: async () => ({}),
          update: async () => ({}),
        },
        dunningState: {
          findUnique: async () => openDunning,
          update: async (args: any) => {
            dunningUpdates.push(args);
            return {};
          },
        },
        organization: {
          findUnique: async () => ({
            users: [{ email: "admin@example.com", name: "Admin" }],
          }),
          update: async (args: any) => {
            orgUpdates.push(args);
            return {};
          },
        },
        subscription: {
          updateMany: async (args: any) => {
            subUpdateMany.push(args);
            return {};
          },
        },
      },
    }));

    const mod = await import("../routes/billing.js");
    const app = express();
    app.use("/api/billing", mod.default);

    const res = await postRaw(
      app,
      "/api/billing/webhook",
      JSON.stringify({ raw: true }),
      { "stripe-signature": "t=1,v1=any" }
    );
    expect(res.status).toBe(200);

    expect(dunningUpdates.find((u) => u.data?.status === "RESOLVED")).toBeTruthy();
    expect(orgUpdates.find((u) => u.data?.status === "ACTIVE")).toBeTruthy();
    expect(subUpdateMany.find((u) => u.data?.status === "ACTIVE")).toBeTruthy();
    expect(emails.some((e) => e.template === "DUNNING_RECOVERED")).toBe(true);
    expect(audits.some((a) => a.action === "DUNNING_RESOLVED")).toBe(true);

    vi.doUnmock("../services/stripe.js");
    vi.doUnmock("../lib/prisma.js");
    vi.doUnmock("../lib/email.js");
    vi.doUnmock("../lib/audit.js");
    vi.resetModules();
  });
});
