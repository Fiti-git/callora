import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 5 Agent M7 — verify that `GET /api/me/status` surfaces the
 * `balanceCents`, `lowBalanceThresholdCents`, and `payg.isLowBalance`/
 * `payg.isOutOfCredits` flags that the dashboard banners depend on.
 *
 * Skip-if-no-DB pattern (mirrors auth.test.ts). Pure shape assertions
 * gated on `dbUp`.
 */

process.env.NODE_ENV = "test";
process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.DNC_HASH_PEPPER ||= "test-dnc-pepper";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend-webhook-secret";
process.env.STRIPE_PRICE_PAYG_TOPUP_25 ||= "price_test_25";
process.env.PAYG_LOW_BALANCE_ALERT_CENTS ||= "1000";
process.env.PAYG_AUTO_RECHARGE_DEFAULT_THRESHOLD_CENTS ||= "1000";
process.env.PAYG_AUTO_RECHARGE_DEFAULT_AMOUNT_CENTS ||= "2500";
process.env.PLATFORM_VAPI_PRIVATE_KEY ||= "test-vapi-platform";
process.env.PLATFORM_GEMINI_API_KEY ||= "test-gemini-platform";
process.env.PLATFORM_GOOGLE_PLACES_API_KEY ||= "test-places-platform";
process.env.PAYG_MARKUP_PCT ||= "30";
process.env.PAYG_GEMINI_CENTS_PER_QUALIFICATION ||= "5";
process.env.PAYG_PLACES_CENTS_PER_SEARCH ||= "5";
process.env.PAYG_EMAIL_CENTS_PER_SEND ||= "1";
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

async function fetchRoute(
  app: express.Express,
  method: string,
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.request(
        { host: "127.0.0.1", port, method, path, headers },
        (res) => {
          let buf = "";
          res.on("data", (c) => (buf += c));
          res.on("end", () => {
            server.close();
            try {
              resolve({ status: res.statusCode!, body: buf ? JSON.parse(buf) : null });
            } catch {
              resolve({ status: res.statusCode!, body: buf });
            }
          });
        }
      );
      req.on("error", reject);
      req.end();
    });
  });
}

describe("GET /api/me/status — PAYG flags", () => {
  beforeAll(async () => {
    dbUp = await canConnect();
  });
  afterAll(async () => {
    if (dbUp) await prisma.$disconnect();
  });

  it.skipIf(!dbUp)("returns balance + flags; isOutOfCredits true on PAUSED_NO_CREDIT", async () => {
    const orgId = `org_m7_${Date.now()}`;
    const userId = `usr_m7_${Date.now()}`;
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "M7 Smoke Org",
        status: "PAUSED_NO_CREDIT",
        users: {
          create: {
            id: userId,
            email: `m7+${Date.now()}@example.com`,
            password: "x",
            name: "M7",
            role: "ADMIN",
            tokenVersion: 0,
          },
        },
      },
    });
    await prisma.creditLedger.create({
      data: { organizationId: orgId, balanceCents: 0 },
    });

    const meRoute = (await import("../routes/me.js")).default;
    const app = express();
    app.use("/api/me", meRoute);

    const token = jwt.sign(
      { userId, organizationId: orgId, role: "ADMIN", tokenVersion: 0 },
      process.env.NEXTAUTH_SECRET!
    );
    const res = await fetchRoute(app, "GET", "/api/me/status", {
      authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.balanceCents).toBe(0);
    expect(res.body.lowBalanceThresholdCents).toBe(1000);
    expect(res.body.payg.isOutOfCredits).toBe(true);
    expect(res.body.payg.isLowBalance).toBe(false);

    // Cleanup
    await prisma.creditLedger.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });

  it.skipIf(!dbUp)("isLowBalance true when 0 < balance < threshold and status not paused", async () => {
    const orgId = `org_m7b_${Date.now()}`;
    const userId = `usr_m7b_${Date.now()}`;
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "M7 Low Balance Org",
        status: "ACTIVE",
        users: {
          create: {
            id: userId,
            email: `m7b+${Date.now()}@example.com`,
            password: "x",
            name: "M7b",
            role: "ADMIN",
            tokenVersion: 0,
          },
        },
      },
    });
    await prisma.creditLedger.create({
      data: { organizationId: orgId, balanceCents: 500 },
    });

    const meRoute = (await import("../routes/me.js")).default;
    const app = express();
    app.use("/api/me", meRoute);
    const token = jwt.sign(
      { userId, organizationId: orgId, role: "ADMIN", tokenVersion: 0 },
      process.env.NEXTAUTH_SECRET!
    );
    const res = await fetchRoute(app, "GET", "/api/me/status", {
      authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.balanceCents).toBe(500);
    expect(res.body.payg.isLowBalance).toBe(true);
    expect(res.body.payg.isOutOfCredits).toBe(false);

    await prisma.creditLedger.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });
});
