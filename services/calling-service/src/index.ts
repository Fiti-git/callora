import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") startOtel({ serviceName: "calling-service" });

import "./lib/env.js"; // boot-time env validation, fails loud on missing vars
import express from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";
import vapiSyncRouter from "./routes/vapi-sync.js";
import internalRouter from "./routes/internal.js";
import webhookRouter from "./routes/webhook.js";
import { authenticate } from "./middleware/requireAuth.js";

const app = express();
const PORT = Number(process.env.PORT) || 4004;
const SERVICE = "calling-service";

app.use(
  cors({
    origin: process.env.TENANT_APP_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
// Vapi public webhook FIRST — needs raw body for HMAC signature verification.
// The router itself attaches express.raw() to its /webhook handler.
app.use("/api/vapi", webhookRouter);

app.use(express.json({ limit: "5mb" }));

app.get(
  "/health",
  makeHealthHandler({
    serviceName: SERVICE,
    pingDb: () => prisma.$queryRaw`SELECT 1`,
  })
);

// Manual sync — WITH auth
app.use("/api/vapi", authenticate, vapiSyncRouter);
// Internal service-to-service — NO auth (cluster-internal)
app.use("/internal", internalRouter);

app.listen(PORT, () => {
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`);
});
