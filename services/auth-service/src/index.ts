import "dotenv/config";
import express from "express";
import cors from "cors";
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

app.get("/health", (_req, res) => {
  res.json({ service: "auth-service", status: "ok" });
});

app.use("/api/auth", authRouter);

const PORT = Number(process.env.PORT) || 4001;

app.listen(PORT, () => {
  console.log(`[Callora] auth-service listening on port ${PORT}`);
});
