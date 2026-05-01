import express, { type Express } from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";

import platformAuthRouter from "./routes/platform-auth.js";
import organizationsRouter from "./routes/organizations.js";
import plansRouter from "./routes/plans.js";
import metricsRouter from "./routes/metrics.js";
import riskRouter from "./routes/risk.js";
import numbersRouter from "./routes/numbers.js";
import spendCapRouter from "./routes/spendCap.js";
import dncRouter from "./routes/dnc.js";
import internalRateLimitRouter from "./routes/internal-rate-limit.js";
import auditRouter from "./routes/audit.js";
import impersonateRouter from "./routes/impersonate.js";
import quotaCreditRouter from "./routes/quotaCredit.js";
import mrrRouter from "./routes/mrr.js";
import emailsRouter from "./routes/emails.js";
import dlqRouter from "./routes/dlq.js";
import provisioningRouter from "./routes/provisioning.js";
import secretsRouter from "./routes/secrets.js";

export function createApp(): Express {
  const app = express();
  const ADMIN_ORIGIN = process.env.ADMIN_APP_ORIGIN || "http://localhost:3001";

  app.use(cors({ origin: ADMIN_ORIGIN, credentials: true }));
  app.use(express.json());

  app.get(
    "/health",
    makeHealthHandler({
      serviceName: "platform-service",
      pingDb: () => prisma.$queryRaw`SELECT 1`,
    })
  );

  app.use("/api/platform/auth", platformAuthRouter);
  app.use("/api/platform/organizations", organizationsRouter);
  app.use("/api/platform/plans", plansRouter);
  app.use("/api/platform/metrics", metricsRouter);
  app.use("/api/platform/risk", riskRouter);
  app.use("/api/platform/numbers", numbersRouter);
  app.use("/api/platform/spend-cap", spendCapRouter);
  app.use("/api/platform/dnc", dncRouter);
  app.use("/api/platform/audit", auditRouter);
  app.use("/api/platform/impersonate", impersonateRouter);
  app.use("/api/platform/quota-credit", quotaCreditRouter);
  app.use("/api/platform/mrr", mrrRouter);
  app.use("/api/platform/emails", emailsRouter);
  app.use("/api/platform/dlq", dlqRouter);
  app.use("/api/platform/provisioning", provisioningRouter);
  app.use("/api/platform/secrets", secretsRouter);
  app.use("/internal/rate-limit", internalRateLimitRouter);
  return app;
}

export {
  platformAuthRouter,
  organizationsRouter,
  plansRouter,
  metricsRouter,
  riskRouter,
  numbersRouter,
  spendCapRouter,
  dncRouter,
  internalRateLimitRouter,
  auditRouter,
  impersonateRouter,
  quotaCreditRouter,
  mrrRouter,
  emailsRouter,
  dlqRouter,
  provisioningRouter,
  secretsRouter,
};
