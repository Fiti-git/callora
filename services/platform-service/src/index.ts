import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") startOtel({ serviceName: "platform-service" });

import express from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";

import platformAuthRouter from "./routes/platform-auth.js";
import organizationsRouter from "./routes/organizations.js";
import plansRouter from "./routes/plans.js";
import metricsRouter from "./routes/metrics.js";

const app = express();
const PORT = Number(process.env.PORT) || 4007;
const SERVICE = "platform-service";

const ADMIN_ORIGIN = process.env.ADMIN_APP_ORIGIN || "http://localhost:3001";

app.use(
  cors({
    origin: ADMIN_ORIGIN,
    credentials: true,
  })
);

app.use(express.json());

app.get(
  "/health",
  makeHealthHandler({
    serviceName: SERVICE,
    pingDb: () => prisma.$queryRaw`SELECT 1`,
  })
);

app.use("/api/platform/auth", platformAuthRouter);
app.use("/api/platform/organizations", organizationsRouter);
app.use("/api/platform/plans", plansRouter);
app.use("/api/platform/metrics", metricsRouter);

app.listen(PORT, () => {
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`);
});
