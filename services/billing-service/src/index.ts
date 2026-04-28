import "dotenv/config";
import express from "express";
import cors from "cors";
import billingRouter, { webhookHandler } from "./routes/billing.js";

const app = express();
const PORT = Number(process.env.PORT) || 4006;
const SERVICE = "billing-service";

app.use(
  cors({
    origin: process.env.TENANT_APP_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

// Stripe webhook MUST receive the raw body for signature verification.
// Mount it BEFORE express.json() so it's not parsed as JSON.
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  webhookHandler
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: SERVICE, status: "ok" });
});

app.use("/api/billing", billingRouter);

app.listen(PORT, () => {
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`);
});
