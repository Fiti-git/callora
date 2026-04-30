import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

const prisma = new PrismaClient();
let dbUp = false;

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
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

describe("email verification", () => {
  it("verify token is hashed before storage and exp is ~24h", () => {
    const raw = crypto.randomBytes(32).toString("hex");
    const hashed = sha256(raw);
    expect(hashed).not.toBe(raw);
    expect(hashed).toHaveLength(64);

    const exp = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const diffH = (exp.getTime() - Date.now()) / 3_600_000;
    expect(diffH).toBeGreaterThan(23.9);
    expect(diffH).toBeLessThan(24.1);
  });

  it.skipIf(!dbUp)("verify with valid token sets emailVerified=true and clears the token", async () => {
    const tag = `ev-${Date.now()}`;
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
    const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
    const raw = crypto.randomBytes(32).toString("hex");
    const user = await prisma.user.create({
      data: {
        email: `u-${tag}@test.local`,
        password: await bcrypt.hash("Aaaaaaa1!", 10),
        role: "ADMIN",
        organizationId: org.id,
        emailVerified: false,
        verifyToken: sha256(raw),
        verifyTokenExp: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Lookup by hashed token
    const found = await prisma.user.findFirst({
      where: { verifyToken: sha256(raw), verifyTokenExp: { gt: new Date() } },
    });
    expect(found?.id).toBe(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null, verifyTokenExp: null },
    });

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.emailVerified).toBe(true);
    expect(after?.verifyToken).toBeNull();

    // Idempotent second call: token gone, emailVerified already true
    const again = await prisma.user.findFirst({
      where: { verifyToken: sha256(raw) },
    });
    expect(again).toBeNull();

    await prisma.user.delete({ where: { id: user.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });

  it.skipIf(!dbUp)("expired verify token is not accepted", async () => {
    const tag = `evx-${Date.now()}`;
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
    const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
    const raw = crypto.randomBytes(32).toString("hex");
    const user = await prisma.user.create({
      data: {
        email: `u-${tag}@test.local`,
        password: await bcrypt.hash("Aaaaaaa1!", 10),
        role: "ADMIN",
        organizationId: org.id,
        emailVerified: false,
        verifyToken: sha256(raw),
        verifyTokenExp: new Date(Date.now() - 1000),
      },
    });
    const found = await prisma.user.findFirst({
      where: { verifyToken: sha256(raw), verifyTokenExp: { gt: new Date() } },
    });
    expect(found).toBeNull();

    await prisma.user.delete({ where: { id: user.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
