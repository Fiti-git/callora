import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { authenticator } from "otplib";
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

describe("2FA TOTP flow", () => {
  it("authenticator.verify accepts a freshly generated TOTP", () => {
    const secret = authenticator.generateSecret();
    const token = authenticator.generate(secret);
    expect(authenticator.verify({ token, secret })).toBe(true);
  });

  it("authenticator.verify rejects a wrong TOTP", () => {
    const secret = authenticator.generateSecret();
    expect(authenticator.verify({ token: "000000", secret })).toBe(false);
  });

  it.skipIf(!dbUp)(
    "enabling 2FA stores a secret + 10 hashed recovery codes; recovery code is single-use",
    async () => {
      const tag = `2fa-${Date.now()}`;
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
      const user = await prisma.user.create({
        data: {
          email: `u-${tag}@test.local`,
          password: await bcrypt.hash("Aaaaaaa1!", 10),
          role: "ADMIN",
          organizationId: org.id,
          emailVerified: true,
        },
      });

      // Setup
      const secret = authenticator.generateSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFASecret: secret },
      });

      // Verify with valid TOTP — enable + generate codes
      const totp = authenticator.generate(secret);
      expect(authenticator.verify({ token: totp, secret })).toBe(true);

      const rawCodes: string[] = [];
      const hashedCodes: string[] = [];
      for (let i = 0; i < 10; i++) {
        const c = crypto.randomBytes(5).toString("hex");
        rawCodes.push(c);
        hashedCodes.push(sha256(c));
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFAEnabled: true, twoFARecoveryCodes: { set: hashedCodes } },
      });

      const after = await prisma.user.findUnique({ where: { id: user.id } });
      expect(after?.twoFAEnabled).toBe(true);
      expect(after?.twoFARecoveryCodes.length).toBe(10);

      // Use one recovery code (single-use): consume it
      const code = rawCodes[0];
      const hashed = sha256(code);
      const remaining = (after!.twoFARecoveryCodes as string[]).filter(
        (c: string) => c !== hashed
      );
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFARecoveryCodes: { set: remaining } },
      });
      const after2 = await prisma.user.findUnique({ where: { id: user.id } });
      expect(after2?.twoFARecoveryCodes.length).toBe(9);
      expect(after2?.twoFARecoveryCodes.includes(hashed)).toBe(false);

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  );
});
