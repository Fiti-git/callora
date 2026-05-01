import express, { type Express } from "express";
import { prisma, makeHealthHandler } from "@callora/shared";
import sendRouter from "./routes/send.js";
import emailComplianceRouter from "./routes/emailCompliance.js";
import emailMarketingRouter from "./routes/emailMarketing.js";
import resendWebhookRouter from "./routes/resendWebhook.js";

/**
 * Mount the Resend inbound webhook on the raw-body parser. MUST be
 * registered BEFORE express.json() so HMAC signature verification sees the
 * unmodified bytes. Same pattern as Stripe in billing-service.
 */
export function mountResendWebhook(app: Express): void {
  // The router itself calls express.raw() on the only route it owns.
  app.use("/api/email", resendWebhookRouter);
}

export function createApp(): Express {
  const app = express();

  // Resend webhook FIRST (raw body for signature verification).
  mountResendWebhook(app);

  // JSON parser for everything else.
  app.use(express.json({ limit: "5mb" }));

  app.get(
    "/health",
    makeHealthHandler({
      serviceName: "notification-service",
      pingDb: () => prisma.$queryRaw`SELECT 1`,
    })
  );

  app.use("/internal", sendRouter);
  app.use("/api/email", emailComplianceRouter);
  app.use("/api/email-marketing", emailMarketingRouter);

  return app;
}

export {
  sendRouter as notificationSendRouter,
  emailComplianceRouter,
  emailMarketingRouter,
  resendWebhookRouter,
};
