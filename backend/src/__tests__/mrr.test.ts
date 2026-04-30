import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
let dbUp = false;
let schemaReady = false;

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
  } catch {
    dbUp = false;
  }
  if (dbUp) {
    try {
      await prisma.$queryRawUnsafe('SELECT "maxCallsPerMonth" FROM "Plan" LIMIT 1');
      schemaReady = true;
    } catch {
      schemaReady = false;
    }
  }
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/platform/metrics/mrr", () => {
  it("computes MRR by summing priceCents over ACTIVE subs", async () => {
    if (!dbUp) {
      console.warn("skipping: DB not reachable");
      return;
    }
    if (!schemaReady) {
      console.warn("skipping: schema is stale (Plan.maxCallsPerMonth missing)");
      return;
    }
    const mod = await import("../routes/platform/mrr.js");
    const app = express();
    app.use(express.json());
    app.use("/api/platform/metrics/mrr", mod.default);
    const server = app.listen(0);
    const port = (server.address() as any).port;

    const orgIds: string[] = [];
    let plan1Id = "";
    let plan2Id = "";
    let platformUserId = "";
    try {
      const tag = Date.now();
      const plan1 = await prisma.plan.create({
        data: {
          tier: "STARTER",
          name: "mrr-test-1",
          stripePriceId: `mrr_p1_${tag}`,
          monthlyCallQuota: 100,
          monthlyLeadQuota: 100,
          seatLimit: 1,
          priceCents: 4900,
        },
      }).catch(async () => {
        // tier is unique — fall back to existing.
        return prisma.plan.findUniqueOrThrow({ where: { tier: "STARTER" } });
      });
      plan1Id = plan1.id;
      const plan2 = await prisma.plan.create({
        data: {
          tier: "PRO",
          name: "mrr-test-2",
          stripePriceId: `mrr_p2_${tag}`,
          monthlyCallQuota: 1000,
          monthlyLeadQuota: 1000,
          seatLimit: 5,
          priceCents: 19900,
        },
      }).catch(async () => prisma.plan.findUniqueOrThrow({ where: { tier: "PRO" } }));
      plan2Id = plan2.id;

      // 2 active on plan1, 1 active on plan2, 1 trialing (excluded).
      for (let i = 0; i < 2; i++) {
        const o = await prisma.organization.create({ data: { name: `mrr-${tag}-${i}-a` } });
        orgIds.push(o.id);
        await prisma.subscription.create({
          data: { organizationId: o.id, planId: plan1.id, status: "ACTIVE" },
        });
      }
      const o3 = await prisma.organization.create({ data: { name: `mrr-${tag}-x-b` } });
      orgIds.push(o3.id);
      await prisma.subscription.create({
        data: { organizationId: o3.id, planId: plan2.id, status: "ACTIVE" },
      });
      const o4 = await prisma.organization.create({ data: { name: `mrr-${tag}-x-t` } });
      orgIds.push(o4.id);
      await prisma.subscription.create({
        data: { organizationId: o4.id, planId: plan1.id, status: "TRIALING" },
      });

      const pu = await prisma.platformUser.create({
        data: {
          email: `mrr-platform-${tag}@x.test`,
          passwordHash: "x",
          isSuperAdmin: true,
        },
      });
      platformUserId = pu.id;
      const token = jwt.sign({ id: pu.id, email: pu.email }, process.env.PLATFORM_JWT_SECRET!);

      const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        http
          .get(
            {
              host: "127.0.0.1",
              port,
              path: "/api/platform/metrics/mrr",
              headers: { Authorization: `Bearer ${token}` },
            },
            (r) => {
              const chunks: Buffer[] = [];
              r.on("data", (c) => chunks.push(c));
              r.on("end", () =>
                resolve({
                  status: r.statusCode ?? 0,
                  body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
                })
              );
            }
          )
          .on("error", reject);
      });

      expect(res.status).toBe(200);
      // MRR must include at least our two plan1 + one plan2 = 4900*2 + 19900 = 29700 cents.
      // The DB may have other ACTIVE subs from other tests, so we only check >=.
      expect(res.body.totalMrrCents).toBeGreaterThanOrEqual(29700);
      const tier1 = res.body.breakdownByPlan.find((b: any) => b.tier === "STARTER");
      const tier2 = res.body.breakdownByPlan.find((b: any) => b.tier === "PRO");
      expect(tier1).toBeTruthy();
      expect(tier2).toBeTruthy();
      expect(tier1.count).toBeGreaterThanOrEqual(2);
      expect(tier2.count).toBeGreaterThanOrEqual(1);
    } finally {
      server.close();
      for (const oid of orgIds) {
        await prisma.subscription.deleteMany({ where: { organizationId: oid } }).catch(() => {});
        await prisma.organization.delete({ where: { id: oid } }).catch(() => {});
      }
      if (platformUserId)
        await prisma.platformUser.delete({ where: { id: platformUserId } }).catch(() => {});
      // Don't delete plans — they're shared with other tests via unique tier.
      void plan1Id;
      void plan2Id;
    }
  });
});
