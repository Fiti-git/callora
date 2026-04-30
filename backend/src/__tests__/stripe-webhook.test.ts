import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import request from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Stripe webhook tests:
 *
 *  - Source-order regression guard: the webhook router MUST be mounted
 *    BEFORE express.json() in src/index.ts. We grep the source file directly.
 *  - Signature mismatch returns 400 (no DB writes).
 *  - The handler maps event types to org/subscription status transitions.
 *
 * Stripe SDK is mocked so no network or real signature is needed. Status
 * transitions are tested at the handler level (mocked prisma) so the suite
 * stays DB-free in CI bootstrap.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_dummy";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("stripe webhook source order (regression guard)", () => {
  it("mounts /api/billing BEFORE express.json() in src/index.ts", () => {
    const indexPath = path.resolve(__dirname, "..", "index.ts");
    const src = fs.readFileSync(indexPath, "utf8");

    const billingIdx = src.search(/app\.use\(\s*["'`]\/api\/billing["'`]/);
    const jsonIdx = src.search(/app\.use\(\s*express\.json\(/);

    expect(billingIdx).toBeGreaterThanOrEqual(0);
    expect(jsonIdx).toBeGreaterThan(0);
    expect(billingIdx).toBeLessThan(jsonIdx);
  });

  it("mounts /api/vapi (webhook) BEFORE express.json() in src/index.ts", () => {
    const indexPath = path.resolve(__dirname, "..", "index.ts");
    const src = fs.readFileSync(indexPath, "utf8");
    const vapiIdx = src.search(/app\.use\(\s*["'`]\/api\/vapi["'`]/);
    const jsonIdx = src.search(/app\.use\(\s*express\.json\(/);
    expect(vapiIdx).toBeGreaterThanOrEqual(0);
    expect(vapiIdx).toBeLessThan(jsonIdx);
  });
});

describe("stripe webhook signature verification", () => {
  beforeAll(() => {
    vi.resetModules();
  });

  async function postRaw(
    app: express.Express,
    pathStr: string,
    body: string,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: any }> {
    return await new Promise((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = (server.address() as any).port;
        const req = request.request(
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

  it("returns 400 when signature verification throws and does NOT call prisma", async () => {
    // Mock the stripe service: make verifyWebhook throw.
    vi.doMock("../services/stripe.js", () => ({
      verifyWebhook: () => {
        throw new Error("Invalid signature");
      },
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
      stripe: null,
      ensureStripe: () => {
        throw new Error("not configured");
      },
    }));

    const prismaWrites: string[] = [];
    vi.doMock("../lib/prisma.js", () => ({
      default: new Proxy(
        {},
        {
          get() {
            return new Proxy(
              {},
              {
                get(_t, prop: string) {
                  return (..._args: any[]) => {
                    prismaWrites.push(prop);
                    return Promise.resolve(null);
                  };
                },
              }
            );
          },
        }
      ),
    }));

    const mod = await import("../routes/billing.js");
    const app = express();
    app.use("/api/billing", mod.default);

    const res = await postRaw(
      app,
      "/api/billing/webhook",
      JSON.stringify({ id: "evt_test", type: "noop" }),
      { "stripe-signature": "t=1,v1=bad" }
    );
    expect(res.status).toBe(400);
    // No DB write should have happened on a verification failure.
    const mutations = prismaWrites.filter((m) =>
      ["update", "create", "delete", "upsert", "updateMany"].includes(m)
    );
    expect(mutations.length).toBe(0);

    vi.doUnmock("../services/stripe.js");
    vi.doUnmock("../lib/prisma.js");
    vi.resetModules();
  });
});

describe("stripe webhook handler dispatch (mocked prisma)", () => {
  /**
   * Validate that each event type produces the expected org/subscription
   * status updates. We mock prisma + email and capture the calls. The handler
   * is the one in routes/billing.ts. Its signature isn't exported; we route
   * through the HTTP layer with a stubbed verifyWebhook that returns a
   * pre-canned event.
   */

  async function runWithEvent(eventObj: any): Promise<{
    subscriptionUpdates: any[];
    organizationUpdates: any[];
    emails: any[];
  }> {
    vi.resetModules();
    const subscriptionUpdates: any[] = [];
    const organizationUpdates: any[] = [];
    const emails: any[] = [];

    vi.doMock("../services/stripe.js", () => ({
      verifyWebhook: () => eventObj,
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
      stripe: null,
      ensureStripe: () => null,
    }));

    vi.doMock("../lib/email.js", () => ({
      APP_URL: "http://localhost:3000",
      sendEmail: async (to: string, subject: string, _html: string) => {
        emails.push({ to, subject });
      },
    }));

    vi.doMock("../lib/prisma.js", () => ({
      default: {
        subscription: {
          update: async (args: any) => {
            subscriptionUpdates.push(args);
            return {};
          },
          findFirst: async () => ({
            id: "sub_x",
            organizationId: "org_x",
            stripeCustomerId: "cus_x",
            organization: { users: [{ email: "admin@example.com", name: "Admin" }] },
          }),
        },
        organization: {
          update: async (args: any) => {
            organizationUpdates.push(args);
            return {};
          },
        },
        auditLog: { create: async () => ({}) },
      },
    }));

    vi.doMock("../lib/audit.js", () => ({
      writeAudit: async () => undefined,
    }));

    const mod = await import("../routes/billing.js");
    const app = express();
    app.use("/api/billing", mod.default);

    const body = JSON.stringify({ raw: true });
    await new Promise<void>((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = (server.address() as any).port;
        const req = request.request(
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
    vi.doUnmock("../lib/prisma.js");
    vi.doUnmock("../lib/email.js");
    vi.doUnmock("../lib/audit.js");

    return { subscriptionUpdates, organizationUpdates, emails };
  }

  it("checkout.session.completed → org ACTIVE, subscription ACTIVE", async () => {
    const { subscriptionUpdates, organizationUpdates } = await runWithEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { organizationId: "org_test" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    });
    expect(subscriptionUpdates.find((u) => u.data?.status === "ACTIVE")).toBeTruthy();
    expect(organizationUpdates.find((u) => u.data?.status === "ACTIVE")).toBeTruthy();
  });

  it("invoice.payment_failed → subscription + org PAST_DUE; admin email sent", async () => {
    const { subscriptionUpdates, organizationUpdates, emails } = await runWithEvent({
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_x" } },
    });
    expect(subscriptionUpdates.find((u) => u.data?.status === "PAST_DUE")).toBeTruthy();
    expect(organizationUpdates.find((u) => u.data?.status === "PAST_DUE")).toBeTruthy();
    expect(emails.length).toBeGreaterThanOrEqual(1);
  });

  it("customer.subscription.deleted → both CANCELED", async () => {
    const { subscriptionUpdates, organizationUpdates } = await runWithEvent({
      type: "customer.subscription.deleted",
      data: { object: { metadata: { organizationId: "org_test" } } },
    });
    expect(subscriptionUpdates.find((u) => u.data?.status === "CANCELED")).toBeTruthy();
    expect(organizationUpdates.find((u) => u.data?.status === "CANCELED")).toBeTruthy();
  });

  it("customer.subscription.trial_will_end → trial-ending email sent", async () => {
    const { emails } = await runWithEvent({
      type: "customer.subscription.trial_will_end",
      data: { object: { metadata: { organizationId: "org_test" } } },
    });
    expect(emails.some((e) => /trial/i.test(e.subject))).toBe(true);
  });
});
