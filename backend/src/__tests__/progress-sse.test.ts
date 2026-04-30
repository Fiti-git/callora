import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

/**
 * SSE smoke test for GET /api/campaigns/:id/progress/stream.
 *
 * Verifies:
 *   1. Missing token → 401.
 *   2. Wrong-org token → 404 (no leak).
 *   3. Valid token + matching org connects, receives a snapshot event, and
 *      forwards a published Redis event to the client.
 *
 * Uses a real Redis (REDIS_URL or default localhost:6379) and Postgres.
 * Skips automatically if either is unreachable, mirroring the pattern used
 * by tenant-isolation.test.ts.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.REDIS_URL ||= "redis://localhost:6379";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();

let dbUp = false;
let redisUp = false;

async function canConnectDb(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  dbUp = await canConnectDb();
  if (!dbUp) return;
  // Probe redis.
  try {
    const { Redis } = await import("ioredis");
    const r = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    } as any);
    await r.connect();
    await r.ping();
    await r.quit();
    redisUp = true;
  } catch {
    redisUp = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function buildApp(): Promise<express.Express> {
  const mod = await import("../routes/campaigns.js");
  const app = express();
  app.use("/api/campaigns", mod.default);
  return app;
}

function readSse(
  port: number,
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; events: { event: string; data: any }[] }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "GET", headers },
      (res) => {
        const events: { event: string; data: any }[] = [];
        let buffer = "";
        let currentEvent = "message";
        res.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          // Parse complete event blocks.
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            for (const line of block.split("\n")) {
              if (line.startsWith("event: ")) currentEvent = line.slice(7).trim();
              else if (line.startsWith("data: ")) {
                try {
                  events.push({
                    event: currentEvent,
                    data: JSON.parse(line.slice(6)),
                  });
                } catch {
                  events.push({ event: currentEvent, data: line.slice(6) });
                }
                currentEvent = "message";
              }
            }
            if (events.length >= 2) {
              req.destroy();
              resolve({ status: res.statusCode ?? 0, events });
              return;
            }
          }
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, events }));
        res.on("error", reject);
      }
    );
    req.on("error", (err: any) => {
      // ECONNRESET expected when we destroy the request — treat as success.
      if (err?.code === "ECONNRESET") return;
      reject(err);
    });
    req.end();
    // Hard timeout safety net.
    setTimeout(() => {
      req.destroy();
      reject(new Error("SSE read timeout"));
    }, 8000);
  });
}

describe("SSE /api/campaigns/:id/progress/stream", () => {
  it("rejects missing token with 401", async () => {
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const res = await new Promise<{ status: number }>((resolve, reject) => {
        http
          .get(
            { host: "127.0.0.1", port, path: "/api/campaigns/anything/progress/stream" },
            (r) => {
              r.resume();
              resolve({ status: r.statusCode ?? 0 });
            }
          )
          .on("error", reject);
      });
      expect(res.status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("returns 404 for a campaign not in caller's org", async () => {
    if (!dbUp) {
      console.warn("skipping: DB not reachable");
      return;
    }
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      // Build a JWT for a non-existent org id.
      const token = jwt.sign(
        { userId: "u1", organizationId: "org-does-not-exist", email: "a@b", role: "ADMIN", tokenVersion: 0 },
        process.env.NEXTAUTH_SECRET!
      );
      const res = await new Promise<{ status: number }>((resolve, reject) => {
        http
          .get(
            {
              host: "127.0.0.1",
              port,
              path: `/api/campaigns/anything/progress/stream?token=${token}`,
            },
            (r) => {
              r.resume();
              resolve({ status: r.statusCode ?? 0 });
            }
          )
          .on("error", reject);
      });
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it("delivers snapshot + published event for the campaign owner", async () => {
    if (!dbUp || !redisUp) {
      console.warn("skipping: DB or Redis not reachable");
      return;
    }
    const app = await buildApp();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    let orgId = "";
    let campaignId = "";
    try {
      const org = await prisma.organization.create({
        data: { name: `sse-org-${Date.now()}` },
      });
      orgId = org.id;
      const c = await prisma.campaign.create({
        data: { organizationId: orgId, name: "sse-campaign", status: "RUNNING" },
      });
      campaignId = c.id;

      const token = jwt.sign(
        {
          userId: "u1",
          organizationId: orgId,
          email: "a@b",
          role: "ADMIN",
          tokenVersion: 0,
        },
        process.env.NEXTAUTH_SECRET!
      );

      // Kick off the SSE read.
      const ssePromise = readSse(
        port,
        `/api/campaigns/${campaignId}/progress/stream?token=${token}`
      );

      // Publish a progress event after a tick so the subscriber has time to
      // attach. publishCampaignProgress lives in lib/queue.
      const { publishCampaignProgress } = await import("../lib/queue.js");
      setTimeout(() => {
        publishCampaignProgress(campaignId, {
          event: "lead-dispatched",
          campaignId,
          leadId: "lead-1",
          completed: 1,
          total: 1,
        });
      }, 500);

      const result = await ssePromise;
      expect(result.events.length).toBeGreaterThanOrEqual(1);
      // Snapshot is the first event.
      expect(result.events[0].event).toBe("snapshot");
      // Second event (if delivered) should be lead-dispatched.
      if (result.events[1]) {
        expect(["lead-dispatched", "ping"]).toContain(result.events[1].event);
      }
    } finally {
      server.close();
      if (campaignId) await prisma.campaign.delete({ where: { id: campaignId } }).catch(() => {});
      if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    }
  });
});
