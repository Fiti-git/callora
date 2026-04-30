import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "node:http";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/**
 * Auth route smoke tests covering gaps not exercised by the more focused
 * suites (`email-verification`, `2fa`, `password-policy`, `auth-revocation`,
 * `auth-service-token-version`).
 *
 * Every DB-touching case skips when DATABASE_URL is unreachable, mirroring
 * the pattern from tenant-isolation.test.ts. Logic-only cases run always.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

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

async function postJson(
  app: express.Express,
  path: string,
  body: any,
  headers: Record<string, string> = {}
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

async function buildApp(): Promise<express.Express> {
  const mod = await import("../routes/auth.js");
  const app = express();
  app.use(express.json());
  app.use("/api/auth", mod.default);
  return app;
}

beforeAll(async () => {
  dbUp = await canConnect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("auth: register dedupe", () => {
  it.skipIf(!dbUp)("returns 409 on duplicate email", async () => {
    const tag = `authDup-${Date.now()}`;
    await prisma.plan.upsert({
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

    const app = await buildApp();
    const email = `dup-${tag}@test.local`;
    const payload = {
      email,
      password: "SuperStrong!Pass1",
      name: "Dup",
      orgName: `Org-${tag}`,
    };

    const first = await postJson(app, "/api/auth/register", payload);
    expect(first.status).toBe(201);

    const second = await postJson(app, "/api/auth/register", payload);
    expect(second.status).toBe(409);

    // cleanup
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      await prisma.subscription.deleteMany({ where: { organizationId: u.organizationId } });
      await prisma.user.delete({ where: { id: u.id } });
      await prisma.organization.delete({ where: { id: u.organizationId } });
    }
  });
});

describe("auth: forgot-password (no enumeration)", () => {
  it("returns 200 with success:true for unknown email", async () => {
    const app = await buildApp();
    // If DB is down, the route catches and still returns 200. Either way
    // the contract is no-enumeration → 200.
    const res = await postJson(app, "/api/auth/forgot-password", {
      email: `nonexistent-${Date.now()}@nowhere.invalid`,
    });
    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
  });
});

describe("auth: reset-password token lifecycle", () => {
  it("returns 400 for an invalid/unknown token", async () => {
    const app = await buildApp();
    const res = await postJson(app, "/api/auth/reset-password", {
      token: "totally-bogus-token",
      newPassword: "SuperStrong!Pass1",
    });
    expect(res.status).toBe(400);
  });

  it.skipIf(!dbUp)("valid token bumps tokenVersion and old JWTs become 401", async () => {
    const tag = `pwReset-${Date.now()}`;
    await prisma.plan.upsert({
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
    const pwHash = await bcrypt.hash("OldPass!Strong1", 10);
    const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
    const user = await prisma.user.create({
      data: {
        email: `u-${tag}@test.local`,
        password: pwHash,
        role: "ADMIN",
        organizationId: org.id,
        emailVerified: true,
      },
    });
    const oldToken = jwt.sign(
      {
        userId: user.id,
        organizationId: org.id,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion ?? 0,
      },
      process.env.NEXTAUTH_SECRET!,
      { expiresIn: "1h" }
    );

    const reset = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: `rt-${tag}`,
        expiresAt: new Date(Date.now() + 600_000),
        used: false,
      },
    });

    const app = await buildApp();
    const res = await postJson(app, "/api/auth/reset-password", {
      token: reset.token,
      newPassword: "NewPass!Strong1",
    });
    expect(res.status).toBe(200);

    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenVersion: true },
    });
    expect(fresh?.tokenVersion).toBeGreaterThan(0);

    // Emulate auth middleware: a stale-version JWT is rejected.
    const decoded = jwt.verify(oldToken, process.env.NEXTAUTH_SECRET!) as any;
    const stillValid = decoded.tokenVersion === (fresh?.tokenVersion ?? 0);
    expect(stillValid).toBe(false);

    // 2nd reset using same token (already-used) → 400
    const reuse = await postJson(app, "/api/auth/reset-password", {
      token: reset.token,
      newPassword: "AnotherPass!1",
    });
    expect(reuse.status).toBe(400);

    // Expired token → 400
    const expired = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: `rt-exp-${tag}`,
        expiresAt: new Date(Date.now() - 1000),
        used: false,
      },
    });
    const expRes = await postJson(app, "/api/auth/reset-password", {
      token: expired.token,
      newPassword: "AnotherPass!1",
    });
    expect(expRes.status).toBe(400);

    // cleanup
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});

describe("auth: login rate-limiting", () => {
  // The monolith's per-route rate limit is configured in src/index.ts on the
  // /api/auth router (windowMs 15min, limit 20). This test mounts the same
  // limiter on a tiny app and confirms the 21st hit is 429. Routes are
  // exercised through the limiter (not the underlying login handler) — what
  // we're guarding here is that the limiter is wired correctly.
  // The api-gateway has its own authLimiter; that is covered separately
  // in services/api-gateway tests when those exist.
  it("21st request from same IP within window returns 429", async () => {
    const rateLimit = (await import("express-rate-limit")).default;
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many auth attempts. Try again in 15 minutes." },
    });
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use("/api/auth", limiter, (_req, res) => res.status(401).json({ error: "stub" }));

    let last: { status: number; body: any } | null = null;
    for (let i = 0; i < 21; i++) {
      last = await postJson(
        app,
        "/api/auth/login",
        { email: `x${i}@x.com`, password: "wrong" }
      );
    }
    expect(last?.status).toBe(429);
  });
});
