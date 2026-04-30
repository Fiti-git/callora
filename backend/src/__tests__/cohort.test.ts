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
 * /api/analytics/cohort returns shape `{ period, thisPeriod, lastPeriod }`.
 * Verified with a mocked Prisma — we only assert wiring + parameter validation,
 * not actual aggregation values (those are integration territory).
 */

vi.mock("../lib/prisma.js", () => ({
  default: {
    campaign: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
    callLog: {
      aggregate: vi.fn(async () => ({ _sum: { cost: 0 }, _avg: { duration: 0 } })),
      groupBy: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    lead: { count: vi.fn(async () => 0), groupBy: vi.fn(async () => []) },
    organization: { findUnique: vi.fn(async () => ({ status: "ACTIVE" })) },
    user: { findUnique: vi.fn(async () => ({ id: "u1", tokenVersion: 0 })) },
    $queryRaw: vi.fn(async () => []),
  },
}));

let port = 0;
let token = "";

beforeAll(async () => {
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

describe("GET /api/analytics/cohort", () => {
  it("rejects unknown period with 400", async () => {
    const r = await get("/api/analytics/cohort?period=year", {
      authorization: `Bearer ${token}`,
    });
    expect(r.status).toBe(400);
  });

  it("returns thisPeriod + lastPeriod for period=week", async () => {
    const r = await get("/api/analytics/cohort?period=week", {
      authorization: `Bearer ${token}`,
    });
    expect(r.status).toBe(200);
    expect(r.body.period).toBe("week");
    expect(r.body.thisPeriod).toBeDefined();
    expect(r.body.lastPeriod).toBeDefined();
    // The four headline metrics are surfaced via funnel + costs.
    expect(r.body.thisPeriod.funnel).toBeDefined();
    expect(r.body.thisPeriod.costs).toBeDefined();
  });

  it("returns thisPeriod + lastPeriod for period=month and defaults when omitted", async () => {
    const r = await get("/api/analytics/cohort?period=month", {
      authorization: `Bearer ${token}`,
    });
    expect(r.status).toBe(200);
    expect(r.body.period).toBe("month");

    const dflt = await get("/api/analytics/cohort", { authorization: `Bearer ${token}` });
    expect(dflt.status).toBe(200);
    expect(dflt.body.period).toBe("month");
  });
});
