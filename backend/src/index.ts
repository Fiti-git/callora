import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import authRoutes from "./routes/auth.js";
import settingsRoutes from "./routes/settings.js";
import campaignsRoutes from "./routes/campaigns.js";
import leadsRoutes from "./routes/leads.js";
import statsRoutes from "./routes/stats.js";
import blacklistRoutes from "./routes/blacklist.js";
import analyticsRoutes from "./routes/analytics.js";
import vapiSyncRoutes from "./routes/vapi-sync.js";
import contactsRoutes from "./routes/contacts.js";
import notesRoutes from "./routes/notes.js";
import tasksRoutes from "./routes/tasks.js";
import dealsRoutes from "./routes/deals.js";
import demoRoutes from "./routes/demo.js";
import platformAuthRoutes from "./routes/platform/auth.js";
import platformOrgsRoutes from "./routes/platform/organizations.js";
import platformPlansRoutes from "./routes/platform/plans.js";
import platformMetricsRoutes from "./routes/platform/metrics.js";
import billingRoutes from "./routes/billing.js";
import "./workers/index.js";

const app = express();
const PORT = process.env.PORT || 4000;

const tenantOrigin = process.env.TENANT_APP_ORIGIN || "http://localhost:3000";
const adminOrigin = process.env.ADMIN_APP_ORIGIN || "http://localhost:3001";
const allowedOrigins = [tenantOrigin, adminOrigin];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);
// Billing router first — its /webhook path uses raw body (Stripe signature verification)
app.use("/api/billing", billingRoutes);

app.use(express.json());

// Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Tenant API routes
app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/blacklist", blacklistRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/vapi", vapiSyncRoutes);
app.use("/api/contacts", contactsRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/deals", dealsRoutes);
app.use("/api/demo", demoRoutes);

// Platform (super-admin) API routes
app.use("/api/platform/auth", platformAuthRoutes);
app.use("/api/platform/organizations", platformOrgsRoutes);
app.use("/api/platform/plans", platformPlansRoutes);
app.use("/api/platform/metrics", platformMetricsRoutes);

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`🚀 Backend running on http://0.0.0.0:${PORT}`);
});
