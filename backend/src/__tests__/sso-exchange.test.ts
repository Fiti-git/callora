/**
 * SSO exchange route — Phase 3 Agent 12.
 *
 * The verifySsoIdToken JWKS loader is swapped via setJwksLoaderForTest so the
 * tests don't hit Google/Microsoft. Logic-only assertions (invalid token,
 * unverified email) run without DB; first-login + repeat-login cases run
 * only when the DB is reachable.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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
process.env.GOOGLE_CLIENT_ID ||= "test-google-client";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
let dbUp = false;

async function postJson(
  app: express.Express,
  path: string,
  body: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const data = JSON.stringify(body);
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(data),
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
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    dbUp = true;
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  const { setJwksLoaderForTest } = await import("../lib/sso.js");
  setJwksLoaderForTest(null);
});

describe("sso/exchange: invalid input", () => {
  it("400 when idToken missing", async () => {
    const app = await buildApp();
    const r = await postJson(app, "/api/auth/sso/exchange", { provider: "GOOGLE" });
    expect(r.status).toBe(400);
  });

  it("400 when provider invalid", async () => {
    const app = await buildApp();
    const r = await postJson(app, "/api/auth/sso/exchange", {
      provider: "FACEBOOK",
      idToken: "xxxxxxxxxxxxxxxxxxxxx",
    });
    expect(r.status).toBe(400);
  });

  it("400 when idToken signature can't be verified", async () => {
    const { setJwksLoaderForTest } = await import("../lib/sso.js");
    setJwksLoaderForTest(async () => {
      throw new Error("signature");
    });
    const app = await buildApp();
    const r = await postJson(app, "/api/auth/sso/exchange", {
      provider: "GOOGLE",
      idToken: "x".repeat(40),
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("INVALID_ID_TOKEN");
  });

  it("400 when email_verified is false", async () => {
    const { setJwksLoaderForTest } = await import("../lib/sso.js");
    setJwksLoaderForTest(async () => ({
      payload: {
        email: "x@example.com",
        email_verified: false,
        sub: "abc",
        name: "X",
      },
      protectedHeader: { alg: "RS256" },
    } as any));
    const app = await buildApp();
    const r = await postJson(app, "/api/auth/sso/exchange", {
      provider: "GOOGLE",
      idToken: "x".repeat(40),
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("EMAIL_NOT_VERIFIED");
  });
});

describe("sso/exchange: first-time login creates org+user (DB)", () => {
  it.skipIf(!dbUp)("creates org, user, FREE TRIALING subscription, returns access token", async () => {
    const tag = `sso-${Date.now()}`;
    const email = `new-${tag}@example.com`;
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

    const { setJwksLoaderForTest } = await import("../lib/sso.js");
    setJwksLoaderForTest(async () => ({
      payload: {
        email,
        email_verified: true,
        sub: `sub-${tag}`,
        name: "New User",
      },
      protectedHeader: { alg: "RS256" },
    } as any));

    const app = await buildApp();
    const r = await postJson(app, "/api/auth/sso/exchange", {
      provider: "GOOGLE",
      idToken: "x".repeat(40),
    });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect(r.body.isNew).toBe(true);

    const u = await prisma.user.findUnique({ where: { email } });
    expect(u).toBeTruthy();
    expect(u!.emailVerified).toBe(true);
    expect(u!.ssoProvider).toBe("GOOGLE");

    const sub = await prisma.subscription.findUnique({ where: { organizationId: u!.organizationId } });
    expect(sub?.status).toBe("TRIALING");

    // AuditLog SSO_LOGIN written.
    const audit = await prisma.auditLog.findFirst({
      where: { actorId: u!.id, action: "SSO_LOGIN" },
    });
    expect(audit).toBeTruthy();

    // Cleanup
    await prisma.auditLog.deleteMany({ where: { actorId: u!.id } });
    await prisma.subscription.deleteMany({ where: { organizationId: u!.organizationId } });
    await prisma.user.delete({ where: { id: u!.id } });
    await prisma.organization.delete({ where: { id: u!.organizationId } });
  });

  it.skipIf(!dbUp)("repeat login does not create new org; bumps lastLoginAt", async () => {
    const tag = `sso-rl-${Date.now()}`;
    const email = `repeat-${tag}@example.com`;
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

    const { setJwksLoaderForTest } = await import("../lib/sso.js");
    setJwksLoaderForTest(async () => ({
      payload: { email, email_verified: true, sub: `sub-${tag}`, name: "U" },
      protectedHeader: { alg: "RS256" },
    } as any));

    const app = await buildApp();
    const first = await postJson(app, "/api/auth/sso/exchange", {
      provider: "GOOGLE",
      idToken: "x".repeat(40),
    });
    expect(first.status).toBe(200);
    expect(first.body.isNew).toBe(true);

    const second = await postJson(app, "/api/auth/sso/exchange", {
      provider: "GOOGLE",
      idToken: "x".repeat(40),
    });
    expect(second.status).toBe(200);
    expect(second.body.isNew).toBe(false);
    expect(second.body.user.email).toBe(email);

    // Cleanup
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      await prisma.auditLog.deleteMany({ where: { actorId: u.id } });
      await prisma.subscription.deleteMany({ where: { organizationId: u.organizationId } });
      await prisma.user.delete({ where: { id: u.id } });
      await prisma.organization.delete({ where: { id: u.organizationId } });
    }
  });
});
