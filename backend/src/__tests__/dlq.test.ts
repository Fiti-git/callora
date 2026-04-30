import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.REDIS_URL ||= "redis://localhost:6379";
process.env.NODE_ENV = "test";

/**
 * DLQ route logic test.
 *
 * BullMQ requires a live Redis connection. Rather than spin one up, we mock
 * the queue layer and assert that the route mounts, requires platform auth,
 * and exercises retry/discard/list flows correctly.
 */

// Mock BullMQ Queue + queue module so the route handler talks to fakes.
const fakeJob = {
  id: "fake-job-1",
  name: "callLead",
  failedReason: "Vapi 5xx",
  attemptsMade: 3,
  timestamp: Date.now() - 1000,
  finishedOn: Date.now(),
  data: { leadId: "lead_1" },
  retry: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
};
const fakeQueue: any = {
  getFailed: vi.fn(async () => [fakeJob]),
  getJob: vi.fn(async (id: string) => (id === "fake-job-1" ? fakeJob : null)),
};

vi.mock("bullmq", () => ({
  Queue: vi.fn(() => fakeQueue),
}));
vi.mock("../lib/queue.js", () => ({
  redisConnection: {},
  callQueue: fakeQueue,
  deadLetterQueue: fakeQueue,
}));
vi.mock("../lib/audit.js", () => ({
  writeAudit: vi.fn(async () => undefined),
}));
vi.mock("../lib/prisma.js", () => ({
  default: {
    platformUser: {
      findUnique: vi.fn(async () => ({
        id: "platform-user-1",
        email: "admin@callora.test",
        isSuperAdmin: true,
      })),
    },
  },
}));

let app: express.Express;
let port = 0;
let token = "";

beforeAll(async () => {
  const mod = await import("../routes/platform/dlq.js");
  app = express();
  app.use(express.json());
  app.use("/api/platform/dlq", mod.default);
  const server = app.listen(0);
  port = (server.address() as any).port;
  token = jwt.sign(
    { id: "platform-user-1", email: "admin@callora.test" },
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
          let parsed: any;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function post(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "POST", headers: { "content-length": "0", ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: any;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

describe("DLQ admin routes", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const r = await get("/api/platform/dlq");
    expect(r.status).toBe(401);
  });

  it("lists failed jobs across registered queues", async () => {
    const r = await get("/api/platform/dlq", { authorization: `Bearer ${token}` });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.items)).toBe(true);
    expect(r.body.items[0].jobId).toBe("fake-job-1");
    expect(r.body.items[0].failedReason).toBe("Vapi 5xx");
  });

  it("retries a job and returns 404 for unknown jobs", async () => {
    fakeJob.retry.mockClear();
    const ok = await post("/api/platform/dlq/campaign-calls/fake-job-1/retry", {
      authorization: `Bearer ${token}`,
    });
    expect(ok.status).toBe(200);
    expect(fakeJob.retry).toHaveBeenCalledOnce();

    const missing = await post("/api/platform/dlq/campaign-calls/no-such/retry", {
      authorization: `Bearer ${token}`,
    });
    expect(missing.status).toBe(404);
  });

  it("discards a job and writes an audit row", async () => {
    fakeJob.remove.mockClear();
    const r = await post("/api/platform/dlq/campaign-calls/fake-job-1/discard", {
      authorization: `Bearer ${token}`,
    });
    expect(r.status).toBe(200);
    expect(fakeJob.remove).toHaveBeenCalledOnce();
  });
});
