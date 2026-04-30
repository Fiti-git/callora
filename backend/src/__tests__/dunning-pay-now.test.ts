import { describe, it, expect, vi } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";

/**
 * POST /api/billing/dunning/pay-now
 *
 *  - Cross-org dunning state must 404 (tenant isolation).
 *  - Successful Stripe charge marks DunningState=RESOLVED + Org=ACTIVE.
 *  - Permissive auth: PAST_DUE org must be allowed through.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_dummy";

function makeToken(orgId: string, role: string = "ADMIN", userId: string = "user_1"): string {
  return jwt.sign(
    { userId, organizationId: orgId, email: "admin@example.com", role, tokenVersion: 0 },
    process.env.NEXTAUTH_SECRET as string
  );
}

async function postJson(
  app: express.Express,
  pathStr: string,
  token: string
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
            "content-length": 2,
            authorization: `Bearer ${token}`,
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
      req.write("{}");
      req.end();
    });
  });
}

describe("POST /api/billing/dunning/pay-now", () => {
  it("returns 404 when no open dunning state exists for caller's org", async () => {
    vi.resetModules();

    vi.doMock("../services/stripe.js", () => ({
      verifyWebhook: vi.fn(),
      stripe: { invoices: { pay: async () => ({ status: "paid" }) } },
      ensureStripe: () => ({}),
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
    }));
    vi.doMock("../lib/email.js", () => ({ APP_URL: "http://l", sendEmail: async () => {} }));
    vi.doMock("../lib/audit.js", () => ({
      writeAudit: async () => {},
      writeAuditLog: async () => {},
    }));
    vi.doMock("../lib/prisma.js", () => ({
      default: {
        organization: {
          findUnique: async () => ({ status: "PAST_DUE" }),
          update: async () => ({}),
        },
        user: {
          findUnique: async () => ({ id: "user_1", tokenVersion: 0 }),
        },
        dunningState: {
          // Cross-org: caller is org_A, only org_B has an open row.
          findFirst: async ({ where }: any) =>
            where.organizationId === "org_A" ? null : { id: "dun_other", invoiceId: "in_other" },
          update: async () => ({}),
        },
        subscription: {
          updateMany: async () => ({}),
        },
      },
    }));

    const mod = await import("../routes/billing.js");
    const app = express();
    app.use("/api/billing", mod.default);

    const r = await postJson(app, "/api/billing/dunning/pay-now", makeToken("org_A"));
    expect(r.status).toBe(404);

    vi.doUnmock("../services/stripe.js");
    vi.doUnmock("../lib/prisma.js");
    vi.doUnmock("../lib/email.js");
    vi.doUnmock("../lib/audit.js");
    vi.resetModules();
  });

  it("successful pay marks DunningState RESOLVED + org ACTIVE", async () => {
    vi.resetModules();

    const dunningUpdates: any[] = [];
    const orgUpdates: any[] = [];

    vi.doMock("../services/stripe.js", () => ({
      verifyWebhook: vi.fn(),
      stripe: { invoices: { pay: async () => ({ status: "paid" }) } },
      ensureStripe: () => ({}),
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
    }));
    vi.doMock("../lib/email.js", () => ({ APP_URL: "http://l", sendEmail: async () => {} }));
    vi.doMock("../lib/audit.js", () => ({
      writeAudit: async () => {},
      writeAuditLog: async () => {},
    }));
    vi.doMock("../lib/prisma.js", () => ({
      default: {
        organization: {
          findUnique: async () => ({ status: "PAST_DUE" }),
          update: async (args: any) => {
            orgUpdates.push(args);
            return {};
          },
        },
        user: {
          findUnique: async () => ({ id: "user_1", tokenVersion: 0 }),
        },
        dunningState: {
          findFirst: async () => ({
            id: "dun_pay",
            organizationId: "org_pay",
            invoiceId: "in_pay",
            status: "ACTIVE",
            attempt: 1,
          }),
          update: async (args: any) => {
            dunningUpdates.push(args);
            return {};
          },
        },
        subscription: {
          updateMany: async () => ({}),
        },
      },
    }));

    const mod = await import("../routes/billing.js");
    const app = express();
    app.use("/api/billing", mod.default);

    const r = await postJson(app, "/api/billing/dunning/pay-now", makeToken("org_pay"));
    expect(r.status).toBe(200);
    expect(r.body.paid).toBe(true);
    expect(dunningUpdates.find((u) => u.data?.status === "RESOLVED")).toBeTruthy();
    expect(orgUpdates.find((u) => u.data?.status === "ACTIVE")).toBeTruthy();

    vi.doUnmock("../services/stripe.js");
    vi.doUnmock("../lib/prisma.js");
    vi.doUnmock("../lib/email.js");
    vi.doUnmock("../lib/audit.js");
    vi.resetModules();
  });
});
