import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/**
 * Token-revocation via tokenVersion (B11).
 *
 * After a password reset, every JWT signed with the old tokenVersion must be
 * rejected. We simulate the middleware's check directly so this test does not
 * need an HTTP server.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
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

beforeAll(async () => {
  dbUp = await canConnect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("token-version revocation", () => {
  it.skipIf(!dbUp)("rejects JWTs whose tokenVersion is older than the user's current tokenVersion", async () => {
    const tag = `tokenRev-${Date.now()}`;
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

    const pwHash = await bcrypt.hash("pw-only-for-test", 10);
    const org = await prisma.organization.create({ data: { name: `Org-${tag}` } });
    const user = await prisma.user.create({
      data: {
        email: `u-${tag}@test.local`,
        password: pwHash,
        role: "ADMIN",
        organizationId: org.id,
      },
    });
    expect(user.tokenVersion).toBe(0);

    // Issue a JWT at tokenVersion=0
    const token = jwt.sign(
      {
        userId: user.id,
        organizationId: org.id,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion,
      },
      process.env.NEXTAUTH_SECRET!,
      { expiresIn: "1h" }
    );

    // Simulate password reset: bump tokenVersion
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    expect(updated.tokenVersion).toBe(1);

    // Decode old token and emulate the middleware check
    const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as any;
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenVersion: true },
    });
    const accepted = decoded.tokenVersion === (fresh?.tokenVersion ?? 0);
    expect(accepted).toBe(false);

    // cleanup
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
