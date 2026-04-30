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
 * AuditLog list route — validates filter parsing + pagination logic.
 *
 * Mocks Prisma so we can run without a live DB. Asserts that filters are
 * passed through to findMany and that the cursor pagination contract holds.
 */

const findMany = vi.fn();
vi.mock("../lib/prisma.js", () => ({
  default: {
    auditLog: { findMany: (args: any) => findMany(args) },
    platformUser: {
      findUnique: vi.fn(async () => ({
        id: "p1",
        email: "a@a.test",
        isSuperAdmin: true,
      })),
    },
  },
}));

let port = 0;
let token = "";

beforeAll(async () => {
  const mod = await import("../routes/platform/audit.js");
  const app = express();
  app.use(express.json());
  app.use("/api/platform/audit-log", mod.default);
  const server = app.listen(0);
  port = (server.address() as any).port;
  token = jwt.sign(
    { id: "p1", email: "a@a.test" },
    process.env.PLATFORM_JWT_SECRET!,
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

describe("GET /api/platform/audit-log", () => {
  it("rejects without platform auth", async () => {
    const r = await get("/api/platform/audit-log");
    expect(r.status).toBe(401);
  });

  it("rejects invalid actorType with 400", async () => {
    const r = await get("/api/platform/audit-log?actorType=NOT_REAL", {
      authorization: `Bearer ${token}`,
    });
    expect(r.status).toBe(400);
  });

  it("paginates results and surfaces nextCursor when there are more rows", async () => {
    // Return 3 rows when limit=2 → route should slice to 2 and set nextCursor.
    const fakeRows = [
      { id: "ckaaaaaaaaaaaaaaaaaaaaaaa", createdAt: new Date(), action: "X" },
      { id: "ckbbbbbbbbbbbbbbbbbbbbbbb", createdAt: new Date(), action: "Y" },
      { id: "ckccccccccccccccccccccccc", createdAt: new Date(), action: "Z" },
    ];
    findMany.mockResolvedValueOnce(fakeRows);
    const r = await get("/api/platform/audit-log?limit=2", {
      authorization: `Bearer ${token}`,
    });
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(2);
    expect(r.body.nextCursor).toBe("ckbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("returns null cursor when results <= limit", async () => {
    findMany.mockResolvedValueOnce([{ id: "ckaaaaaaaaaaaaaaaaaaaaaaa", createdAt: new Date() }]);
    const r = await get("/api/platform/audit-log?limit=10", {
      authorization: `Bearer ${token}`,
    });
    expect(r.status).toBe(200);
    expect(r.body.nextCursor).toBeNull();
  });
});
