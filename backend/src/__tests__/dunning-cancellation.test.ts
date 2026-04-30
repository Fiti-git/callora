import { describe, it, expect, vi } from "vitest";

/**
 * Day 30 cancellation: a DunningState row at attempt=4, SUSPENDED that hits
 * its nextActionAt should:
 *   - call stripe.subscriptions.cancel(subscriptionId)
 *   - mark DunningState.status = CANCELED
 *   - mark Organization.status = CANCELED
 *   - write an audit row with action = DUNNING_CANCELED
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_dummy";

describe("dunning worker — Day 30 cancellation", () => {
  it("cancels Stripe subscription, marks DunningState/Org CANCELED, audits", async () => {
    vi.resetModules();

    const dunningUpdates: any[] = [];
    const orgUpdates: any[] = [];
    const audits: any[] = [];
    const cancelCalls: string[] = [];

    const stubStripe = {
      subscriptions: {
        cancel: async (id: string) => {
          cancelCalls.push(id);
          return { id, status: "canceled" };
        },
      },
      invoices: {
        pay: async () => ({ status: "open" }),
      },
    };

    vi.doMock("../services/stripe.js", () => ({
      stripe: stubStripe,
      ensureStripe: () => stubStripe,
      verifyWebhook: vi.fn(),
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
    }));

    vi.doMock("../lib/email.js", () => ({
      APP_URL: "http://localhost:3000",
      sendEmail: async () => {},
    }));

    vi.doMock("../lib/audit.js", () => ({
      writeAudit: async (params: any) => {
        audits.push(params);
      },
    }));

    vi.doMock("../lib/prisma.js", () => ({
      default: {
        dunningState: {
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
      },
    }));

    const mod = await import("../workers/dunningWorker.js");

    await mod.processOneDunningRow({
      id: "dun_42",
      organizationId: "org_42",
      invoiceId: "in_42",
      subscriptionId: "sub_42",
      attempt: 4,
      status: "SUSPENDED",
    });

    expect(cancelCalls).toEqual(["sub_42"]);
    expect(dunningUpdates.find((u) => u.data?.status === "CANCELED")).toBeTruthy();
    expect(orgUpdates.find((u) => u.data?.status === "CANCELED")).toBeTruthy();
    expect(audits.find((a) => a.action === "DUNNING_CANCELED")).toBeTruthy();

    vi.doUnmock("../services/stripe.js");
    vi.doUnmock("../lib/prisma.js");
    vi.doUnmock("../lib/email.js");
    vi.doUnmock("../lib/audit.js");
    vi.resetModules();
  });
});
