import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import express from "express";
import request from "node:http";
import { PrismaClient } from "@prisma/client";

/**
 * Tests for the Vapi webhook:
 *  - rejects missing/invalid HMAC signatures with 401
 *  - upserts on vapiCallId so duplicate deliveries don't create duplicate rows
 *
 * The HMAC test is pure (no DB). The idempotency test is gated on a reachable
 * DATABASE_URL — same pattern as tenant-isolation.test.ts.
 */

const SECRET = "test-vapi-secret-" + Date.now();
process.env.VAPI_WEBHOOK_SECRET = SECRET;
// Provide other required env so importing the route module doesn't blow up.
process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

const prisma = new PrismaClient();
let dbUp = false;

async function canConnect(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

async function postJson(
  app: express.Express,
  path: string,
  body: any,
  headers: Record<string, string>
): Promise<{ status: number; body: any }> {
  return await new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const data = typeof body === "string" ? body : JSON.stringify(body);
      const req = request.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(data),
            ...headers,
          },
        },
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
            server.close();
            resolve({ status: res.statusCode || 0, body: parsed });
          });
        }
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      req.write(data);
      req.end();
    });
  });
}

beforeAll(async () => {
  dbUp = await canConnect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("vapi webhook signature verification", () => {
  it("rejects requests with no signature header (401)", async () => {
    const mod = await import("../routes/vapi-webhook.js");
    const app = express();
    app.use("/api/vapi", mod.default);

    const res = await postJson(app, "/api/vapi/webhook", { type: "ping" }, {});
    expect(res.status).toBe(401);
  });

  it("rejects requests with an invalid signature (401)", async () => {
    const mod = await import("../routes/vapi-webhook.js");
    const app = express();
    app.use("/api/vapi", mod.default);

    const res = await postJson(
      app,
      "/api/vapi/webhook",
      { type: "ping" },
      { "x-vapi-signature": "deadbeef".repeat(8) }
    );
    expect(res.status).toBe(401);
  });

  it("accepts requests with a valid signature", async () => {
    const mod = await import("../routes/vapi-webhook.js");
    const app = express();
    app.use("/api/vapi", mod.default);

    const body = JSON.stringify({ type: "noop" });
    const sig = sign(body);
    const res = await postJson(
      app,
      "/api/vapi/webhook",
      body,
      { "x-vapi-signature": sig }
    );
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
  });
});

describe("vapi webhook idempotency (upsert on vapiCallId)", () => {
  it.skipIf(!dbUp)("two webhooks for the same vapiCallId result in one CallLog", async () => {
    const tag = `vapiIdem-${Date.now()}`;
    const freePlan = await prisma.plan.upsert({
      where: { tier: "FREE" },
      update: {},
      create: {
        tier: "FREE",
        name: `Free (${tag})`,
        stripePriceId: `price_test_${tag}`,
        monthlyCallQuota: 100,
        monthlyLeadQuota: 100,
        seatLimit: 5,
        priceCents: 0,
      },
    });
    void freePlan;

    const org = await prisma.organization.create({
      data: { name: `Org-${tag}` },
    });
    const campaign = await prisma.campaign.create({
      data: { name: `Camp-${tag}`, organizationId: org.id, status: "RUNNING" },
    });
    const lead = await prisma.lead.create({
      data: {
        businessName: `Biz-${tag}`,
        phone: "+15555550100",
        campaignId: campaign.id,
        organizationId: org.id,
      },
    });

    const vapiCallId = `vapi-${tag}`;

    // Initial PENDING row (campaign worker would have created this).
    await prisma.callLog.create({
      data: { leadId: lead.id, duration: 0, status: "PENDING", vapiCallId },
    });

    // Simulate two upserts (webhook delivered twice).
    for (let i = 0; i < 2; i++) {
      await prisma.callLog.upsert({
        where: { vapiCallId },
        update: { status: "COMPLETED", duration: 30 + i },
        create: { leadId: lead.id, status: "COMPLETED", duration: 30, vapiCallId },
      });
    }

    const rows = await prisma.callLog.findMany({ where: { vapiCallId } });
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("COMPLETED");

    // cleanup
    await prisma.callLog.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
