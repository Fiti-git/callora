/**
 * Public API auth middleware — Phase 3 Agent 12.
 *
 * Verifies the Bearer-token resolution: valid raw key resolves orgId; revoked
 * keys 401; quota exhausted → 429.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import http from "node:http";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= "0".repeat(64);
process.env.DNC_HASH_PEPPER ||= "test-pepper";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend-webhook";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
    await prisma.$queryRawUnsafe('SELECT 1 FROM "PublicApiKey" LIMIT 1');
    schemaReady = true;
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function getJson(path: string, headers: Record<string, string>): Promise<{ status: number; body: any }> {
  const mod = await import("../routes/publicV1.js");
  const app = express();
  app.use(express.json());
  app.use("/api/v1", mod.default);
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const r = http.request(
        { host: "127.0.0.1", port, method: "GET", path, headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let parsed: any = text;
            try { parsed = JSON.parse(text); } catch {}
            server.close();
            resolve({ status: res.statusCode || 0, body: parsed });
          });
        }
      );
      r.on("error", (e) => { server.close(); reject(e); });
      r.end();
    });
  });
}

describe("public API key auth", () => {
  it.skipIf(!dbUp || !schemaReady)("valid key resolves orgId; revoked → 401; quota → 429", async () => {
    const tag = `pak-${Date.now()}`;
    // Plan with maxApiCallsPerMonth = 2 so we can hit the quota.
    const plan = await prisma.plan.create({
      data: {
        tier: "STARTER",
        name: `S-${tag}`,
        stripePriceId: `price_test_${tag}`,
        monthlyCallQuota: 100,
        monthlyLeadQuota: 100,
        seatLimit: 5,
        priceCents: 0,
        maxApiCallsPerMonth: 2,
      },
    }).catch(async () => prisma.plan.findFirst({ where: { tier: "STARTER" } })) as any;

    const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
    await prisma.subscription.create({
      data: {
        organizationId: org.id,
        planId: plan.id,
        status: "ACTIVE",
      },
    });

    const { generateApiKey } = await import("../middleware/apiKeyAuth.js");
    const { raw, hash, prefix } = generateApiKey();
    const key = await prisma.publicApiKey.create({
      data: { organizationId: org.id, name: "k", keyHash: hash, prefix, scopes: ["read"] },
    });

    // 1st call OK
    const r1 = await getJson("/api/v1/contacts", { authorization: `Bearer ${raw}` });
    expect(r1.status).toBe(200);

    // 2nd call OK (counter = 2 = limit)
    const r2 = await getJson("/api/v1/contacts", { authorization: `Bearer ${raw}` });
    expect(r2.status).toBe(200);

    // 3rd call → 429
    const r3 = await getJson("/api/v1/contacts", { authorization: `Bearer ${raw}` });
    expect(r3.status).toBe(429);
    expect(r3.body.error).toBe("quota_exceeded");

    // Revoke
    await prisma.publicApiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    });
    const r4 = await getJson("/api/v1/contacts", { authorization: `Bearer ${raw}` });
    expect(r4.status).toBe(401);

    // Cleanup
    await prisma.publicApiKey.delete({ where: { id: key.id } });
    await prisma.usageRecord.deleteMany({ where: { organizationId: org.id } });
    await prisma.subscription.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    if (plan && plan.tier === "STARTER" && plan.name.startsWith("S-")) {
      await prisma.plan.deleteMany({ where: { id: plan.id } }).catch(() => {});
    }
  });
});
