import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

/**
 * Analytics range validation + per-campaign org-scope guard.
 *
 * We mock Prisma to avoid a live DB. The goal is purely to validate:
 *   1. ?from / ?to validation rejects garbage with 400
 *   2. Range > 366 days returns 400
 *   3. /campaigns/:id returns 404 when the campaign belongs to another org
 *      (i.e. findUnique({ where: { id, organizationId } }) returns null)
 */

const findUnique = vi.fn();
const queryRaw = vi.fn(async () => []);
const aggregate = vi.fn(async () => ({ _sum: { cost: 0 }, _avg: { duration: 0 } }));
const groupBy = vi.fn(async () => []);
const count = vi.fn(async () => 0);
const findMany = vi.fn(async () => []);

vi.mock("../lib/prisma.js", () => ({
  default: {
    campaign: { findUnique: (a: any) => findUnique(a), findMany: (a: any) => findMany(a) },
    callLog: { aggregate: (a: any) => aggregate(a), groupBy: (a: any) => groupBy(a), count: (a: any) => count(a) },
    lead: { count: (a: any) => count(a), groupBy: (a: any) => groupBy(a) },
    organization: {
      findUnique: vi.fn(async () => ({ status: "ACTIVE" })),
    },
    user: {
      findUnique: vi.fn(async () => ({ id: "u1", tokenVersion: 0 })),
    },
    $queryRaw: (...args: any[]) => queryRaw(...args),
  },
}));

let port = 0;
let token = "";

beforeAll(async () => {
  // Token must encode the shape AuthRequest expects (organizationId).
  const mod = await import("../routes/analytics.js");
  const app = express();
  app.use(express.json());
  app.use("/api/analytics", mod.default);
  const server = app.listen(0);
  port = (server.address() as any).port;
  token = jwt.sign(
    { userId: "u1", organizationId: "org_a", email: "u@u.test", role: "ADMIN", tokenVersion: 0 },
    process.env.NEXTAUTH_SECRET!,
    { expiresIn: "5m" }
  );
});

function get(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "GET", headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let body: any;
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

describe("Analytics range + per-campaign", () => {
  it("rejects malformed from/to with 400", async () => {
    const r = await get("/api/analytics?from=not-a-date", {
      authorization: `Bearer ${token}`,
    });
    expect(r.status).toBe(400);
  });

  it("rejects ranges over 366 days with 400", async () => {
    const from = "2020-01-01T00:00:00.000Z";
    const to = "2024-01-01T00:00:00.000Z";
    const r = await get(`/api/analytics?from=${from}&to=${to}`, {
      authorization: `Bearer ${token}`,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Range too large/);
  });

  it("returns 404 when the campaign belongs to another org (org-scope)", async () => {
    findUnique.mockResolvedValueOnce(null);
    const r = await get("/api/analytics/campaigns/some_other_org_campaign", {
      authorization: `Bearer ${token}`,
    });
    expect(r.status).toBe(404);
    // Confirm org filter was applied.
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org_a" }),
      })
    );
  });
});
