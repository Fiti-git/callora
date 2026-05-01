import express, { type Express } from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";
import billingRouter, { webhookHandler } from "./routes/billing.js";
import internalRouter from "./routes/internal.js";

/**
 * Mounts the Stripe webhook with the raw body parser. MUST be called
 * BEFORE `express.json()` so Stripe's signature verification sees the
 * unmodified bytes.
 */
export function mountStripeWebhook(app: Express): void {
  app.post(
    "/api/billing/webhook",
    express.raw({ type: "application/json" }),
    webhookHandler
  );
}

/**
 * Mounts the JSON-bodied billing routes (Checkout, Portal, internal).
 * Call this AFTER `express.json()`.
 */
export function mountBillingRoutes(app: Express): void {
  app.use("/api/billing", billingRouter);
  app.use("/internal", internalRouter);
}

export function createApp(): Express {
  const app = express();
  app.use(
    cors({
      origin: process.env.TENANT_APP_ORIGIN || "http://localhost:3000",
      credentials: true,
    })
  );
  // Webhook FIRST (raw body for Stripe signature).
  mountStripeWebhook(app);
  app.use(express.json());
  app.get(
    "/health",
    makeHealthHandler({
      serviceName: "billing-service",
      pingDb: () => prisma.$queryRaw`SELECT 1`,
    })
  );
  mountBillingRoutes(app);
  return app;
}

export { billingRouter, internalRouter as billingInternalRouter };
