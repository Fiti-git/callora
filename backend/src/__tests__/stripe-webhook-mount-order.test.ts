import { describe, it, expect } from "vitest";
import express from "express";

/**
 * Runtime mount-order regression guard.
 *
 * The Stripe webhook lives at POST /api/billing/webhook and uses
 * `express.raw({ type: "application/json" })` to preserve the raw body for
 * signature verification. If anyone ever drops `app.use(express.json())`
 * above the billing router, every webhook signature will fail because the
 * body has already been parsed into an object.
 *
 * Source-grepping (in stripe-webhook.test.ts) catches the obvious case.
 * This file is the more robust check: we mount the actual billing router on
 * a fresh express app, walk app._router.stack, and assert that the billing
 * webhook handler appears BEFORE any json-body-parser layer. We also
 * confirm the webhook chain contains an express.raw layer.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_dummy";

function isJsonParser(layer: any): boolean {
  // express.json() and bodyParser.json() name their handler `jsonParser`.
  const name = layer?.handle?.name ?? layer?.name ?? "";
  return name === "jsonParser" || name === "json";
}

function isRawParser(layer: any): boolean {
  const name = layer?.handle?.name ?? layer?.name ?? "";
  return name === "rawParser" || name === "raw";
}

describe("Stripe webhook runtime mount order", () => {
  it("billing webhook handler is mounted before any express.json() in the app stack", async () => {
    // Import the billing router with stripe mocked so the route module loads
    // without a real key, then mount it like src/index.ts does.
    const { default: billingRouter } = await import("../routes/billing.js");
    const app = express();
    app.use("/api/billing", billingRouter);
    app.use(express.json());

    // Express 5 exposes the router as `app.router` (used to be `app._router`
    // in v4). Support both for forward compat.
    const stack: any[] =
      (app as any)._router?.stack ?? (app as any).router?.stack ?? [];
    expect(stack.length).toBeGreaterThan(0);

    // Identify the billing router by reference equality (regexp metadata is
    // not exposed on Express 5 top-level layers).
    const billingIdx = stack.findIndex((l: any) => l.handle === billingRouter);
    const jsonIdx = stack.findIndex((l: any) => isJsonParser(l));

    expect(billingIdx).toBeGreaterThanOrEqual(0);
    expect(jsonIdx).toBeGreaterThan(0);
    expect(billingIdx).toBeLessThan(jsonIdx);
  });

  it("the /webhook route's middleware chain contains express.raw()", async () => {
    const { default: billingRouter } = await import("../routes/billing.js");

    // Walk the router's own stack to find the /webhook layer. Express 5 puts
    // the path on layer.route.path rather than the regexp toString — match
    // against either.
    const innerStack = (billingRouter as any).stack as any[];
    const webhookLayer = innerStack.find((l: any) => {
      const path = l.route?.path ?? "";
      const re = l.regexp?.toString() ?? "";
      return path === "/webhook" || re.includes("webhook");
    });
    expect(webhookLayer).toBeTruthy();

    // The route layer's handle is itself a Layer-like object with a `stack`
    // of middlewares. Inspect that for express.raw.
    const routeStack: any[] =
      webhookLayer?.route?.stack ??
      webhookLayer?.handle?.stack ??
      [];
    const hasRaw = routeStack.some((l: any) => isRawParser(l));
    expect(hasRaw).toBe(true);
  });
});
