import "dotenv/config";
import { startOtel } from "@callora/shared";
if (process.env.NODE_ENV !== "test") startOtel({ serviceName: "auth-service" });

import express from "express";
import cors from "cors";
import { prisma, makeHealthHandler } from "@callora/shared";
import authRouter from "./routes/auth.js";

const app = express();

const TENANT_APP_ORIGIN = process.env.TENANT_APP_ORIGIN ?? "http://localhost:3000";

app.use(
  cors({
    origin: TENANT_APP_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());

app.get(
  "/health",
  makeHealthHandler({
    serviceName: "auth-service",
    pingDb: () => prisma.$queryRaw`SELECT 1`,
  })
);

app.use("/api/auth", authRouter);

const PORT = Number(process.env.PORT) || 4001;

app.listen(PORT, () => {
  console.log(`[Callora] auth-service listening on port ${PORT}`);
});
