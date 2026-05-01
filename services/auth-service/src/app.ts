import express, { type Express } from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";
import authRouter from "./routes/auth.js";
import developerKeysRouter from "./routes/developerKeys.js";
import meRouter from "./routes/me.js";
import auditLogRouter from "./routes/auditLog.js";

/**
 * Builds the auth-service Express app without starting an HTTP listener.
 * Used by both the standalone server (`index.ts`) and the compact `edge`
 * bundle that mounts this app's routers in-process.
 */
export function createApp(): Express {
  const app = express();
  const TENANT_APP_ORIGIN =
    process.env.TENANT_APP_ORIGIN ?? "http://localhost:3000";

  app.use(cors({ origin: TENANT_APP_ORIGIN, credentials: true }));
  app.use(express.json());

  app.get(
    "/health",
    makeHealthHandler({
      serviceName: "auth-service",
      pingDb: () => prisma.$queryRaw`SELECT 1`,
    })
  );

  app.use("/api/auth", authRouter);
  app.use("/api/developer", developerKeysRouter);
  app.use("/api/me", meRouter);
  app.use("/api/audit-log", auditLogRouter);
  return app;
}

// Re-export the auth router so bundles can mount it under a custom prefix
// (the edge bundle mounts it at `/api/auth` directly without the wrapper).
export { default as authRouter } from "./routes/auth.js";
export { default as developerKeysRouter } from "./routes/developerKeys.js";
export { default as meRouter } from "./routes/me.js";
export { default as auditLogRouter } from "./routes/auditLog.js";
