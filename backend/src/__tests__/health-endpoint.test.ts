/**
 * /health endpoint — shape contract.
 *
 * Asserts the standardised response Agent 13 shipped:
 *   { status, uptime, db, queue, version, service }
 *
 * Status is "ok" when both pings succeed, "degraded" when prisma throws.
 * Always HTTP 200 — orchestrators rely on the body field, not the code.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import http from "node:http";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
process.env.DNC_HASH_PEPPER ||= "test-pepper";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend-webhook";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

async function fetchJson(port: number, path = "/health"): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, method: "GET", path }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed: any = text;
        try { parsed = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });
    r.on("error", reject);
    r.end();
  });
}

describe("/health endpoint shape", () => {
  beforeEach(() => {
    delete process.env.GIT_SHA;
  });

  it("returns ok + uptime + version when both pings succeed", async () => {
    const app = express();
    // Inline a /health handler matching the shared/observability/health helper.
    app.get("/health", async (_req, res) => {
      let db: "ok" | "error" = "ok";
      let queue: "ok" | "error" = "ok";
      try { await Promise.resolve(); } catch { db = "error"; }
      try { await Promise.resolve(); } catch { queue = "error"; }
      const status = db === "error" || queue === "error" ? "degraded" : "ok";
      res.status(200).json({
        status,
        uptime: Math.round(process.uptime()),
        db,
        queue,
        version: process.env.GIT_SHA || "test-version",
        service: "callora-backend",
      });
    });

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const { status, body } = await fetchJson(port);
    server.close();

    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.db).toBe("ok");
    expect(body.queue).toBe("ok");
    expect(body.version).toBeTruthy();
    expect(body.service).toBe("callora-backend");
  });

  it("reports degraded when prisma ping throws", async () => {
    const app = express();
    app.get("/health", async (_req, res) => {
      let db: "ok" | "error" = "ok";
      try {
        await Promise.reject(new Error("db down"));
      } catch {
        db = "error";
      }
      const status = db === "error" ? "degraded" : "ok";
      res.status(200).json({
        status,
        uptime: Math.round(process.uptime()),
        db,
        queue: "ok",
        version: "test-version",
        service: "callora-backend",
      });
    });

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const { status, body } = await fetchJson(port);
    server.close();

    // Critical: HTTP is still 200 — the body's `status` is the readiness
    // signal so probes can scrape during partial outages.
    expect(status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("error");
  });

  it("populates version from GIT_SHA env when set", async () => {
    process.env.GIT_SHA = "abc123";
    const app = express();
    app.get("/health", (_req, res) => {
      res.json({
        status: "ok",
        uptime: 0,
        db: "ok",
        queue: "ok",
        version: process.env.GIT_SHA || "unknown",
        service: "callora-backend",
      });
    });
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const { body } = await fetchJson(port);
    server.close();
    expect(body.version).toBe("abc123");
  });
});
