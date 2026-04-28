import "dotenv/config";
import express from "express";
import cors from "cors";
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
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ service: SERVICE, status: "ok" }));

// Vapi public webhook — NO auth (Vapi calls from outside)
app.use("/api/vapi", webhookRouter);
// Manual sync — WITH auth
app.use("/api/vapi", authenticate, vapiSyncRouter);
// Internal service-to-service — NO auth (cluster-internal)
app.use("/internal", internalRouter);

app.listen(PORT, () => {
  console.log(`[Callora] ${SERVICE} listening on port ${PORT}`);
});
