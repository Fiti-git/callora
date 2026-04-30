/**
 * Per-org rate limiter — middleware contract.
 *
 *   - Allows up to `points` requests per `duration` per organisation.
 *   - 429 response shape: { error: "RATE_LIMITED", retryAfter, scope: "org" }
 *   - Sets Retry-After header.
 *   - Tenant A's bucket does NOT bleed into tenant B's bucket.
 */
import { describe, it, expect, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import http from "node:http";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

async function fetchPath(port: number, path: string, orgId: string): Promise<{ status: number; body: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { host: "127.0.0.1", port, method: "POST", path, headers: { "x-test-org": orgId } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: any = text;
          try { parsed = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
        });
      }
    );
    r.on("error", reject);
    r.end();
  });
}

describe("orgRateLimit middleware", () => {
  let mod: typeof import("../middleware/orgRateLimit.js");

  beforeEach(async () => {
    mod = await import("../middleware/orgRateLimit.js");
    mod.__resetOrgRateLimitForTests();
  });

  it("allows up to N requests per org then 429s with retryAfter and Retry-After header", async () => {
    const limiter = mod.orgRateLimit({ name: "test-burst", points: 5, duration: 60 });

    // Simulate `authenticate` having already populated req.user.organizationId.
    const fakeAuth = (req: Request, _res: Response, next: NextFunction) => {
      const orgId = (req.headers["x-test-org"] as string) || "org-a";
      (req as any).user = { id: "u", organizationId: orgId, role: "ADMIN" };
      next();
    };

    const app = express();
    app.post("/limited", fakeAuth, limiter, (_req, res) => res.json({ ok: true }));
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      // First five requests succeed.
      for (let i = 0; i < 5; i++) {
        const r = await fetchPath(port, "/limited", "org-a");
        expect(r.status).toBe(200);
      }
      // Sixth blows the budget.
      const blocked = await fetchPath(port, "/limited", "org-a");
      expect(blocked.status).toBe(429);
      expect(blocked.body.error).toBe("RATE_LIMITED");
      expect(blocked.body.scope).toBe("org");
      expect(typeof blocked.body.retryAfter).toBe("number");
      expect(blocked.body.retryAfter).toBeGreaterThan(0);
      expect(blocked.headers["retry-after"]).toBeTruthy();
    } finally {
      server.close();
    }
  });

  it("isolates buckets between orgs — tenant B unaffected by tenant A's rejection", async () => {
    const limiter = mod.orgRateLimit({ name: "test-isolation", points: 2, duration: 60 });
    const fakeAuth = (req: Request, _res: Response, next: NextFunction) => {
      const orgId = (req.headers["x-test-org"] as string) || "anon";
      (req as any).user = { id: "u", organizationId: orgId, role: "ADMIN" };
      next();
    };
    const app = express();
    app.post("/limited", fakeAuth, limiter, (_req, res) => res.json({ ok: true }));
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      // Burn org-a's budget.
      expect((await fetchPath(port, "/limited", "org-a")).status).toBe(200);
      expect((await fetchPath(port, "/limited", "org-a")).status).toBe(200);
      expect((await fetchPath(port, "/limited", "org-a")).status).toBe(429);

      // org-b is unaffected.
      expect((await fetchPath(port, "/limited", "org-b")).status).toBe(200);
      expect((await fetchPath(port, "/limited", "org-b")).status).toBe(200);
      expect((await fetchPath(port, "/limited", "org-b")).status).toBe(429);
    } finally {
      server.close();
    }
  });

  it("falls through (does not block) when no org context is resolved", async () => {
    const limiter = mod.orgRateLimit({ name: "test-noctx", points: 1, duration: 60 });
    const app = express();
    app.post("/limited", limiter, (_req, res) => res.json({ ok: true }));
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      // No req.user.organizationId — limiter must not 429 the request.
      // The IP-keyed limiter is expected to handle these cases instead.
      for (let i = 0; i < 3; i++) {
        const r = await fetchPath(port, "/limited", "ignored");
        expect(r.status).toBe(200);
      }
    } finally {
      server.close();
    }
  });
});
