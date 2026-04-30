import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { authenticator } from "otplib";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");

const prisma = new PrismaClient();
let dbUp = false;

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

/**
 * Storage-level contract for the 2FA-secret-at-rest feature:
 *   - encryptString output is stored verbatim
 *   - the decrypted value is what the authenticator originally enrolled with
 *   - legacy plaintext rows continue to verify and are re-encrypted on next write
 *
 * We exercise the crypto helpers + a User row directly rather than spinning
 * up an Express server, mirroring 2fa.test.ts.
 */
describe("2FA secret at-rest encryption", () => {
  it.skipIf(!dbUp)(
    "setup writes a v1: envelope; verify decrypts and validates TOTP",
    async () => {
      const tag = `2fa-enc-${Date.now()}`;
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
      const org = await prisma.organization.create({
        data: { name: `Org-${tag}` },
      });
      const user = await prisma.user.create({
        data: {
          email: `u-${tag}@test.local`,
          password: await bcrypt.hash("Aaaaaaa1!", 10),
          role: "ADMIN",
          organizationId: org.id,
          emailVerified: true,
        },
      });

      const { encryptString, decryptString, isEncrypted } = await import(
        "../lib/crypto.js"
      );

      // /2fa/setup behaviour — stash an encrypted secret.
      const secret = authenticator.generateSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFASecret: encryptString(secret) },
      });

      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stored?.twoFASecret).toBeTruthy();
      expect(isEncrypted(stored?.twoFASecret ?? "")).toBe(true);
      expect(stored?.twoFASecret).not.toBe(secret);

      // /2fa/verify behaviour — decrypt and check a fresh TOTP.
      const decrypted = decryptString(stored!.twoFASecret!);
      expect(decrypted).toBe(secret);
      const totp = authenticator.generate(decrypted);
      expect(authenticator.verify({ token: totp, secret: decrypted })).toBe(true);

      // /2fa/disable behaviour — clear secret.
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFAEnabled: false, twoFASecret: null, twoFARecoveryCodes: { set: [] } },
      });
      const cleared = await prisma.user.findUnique({ where: { id: user.id } });
      expect(cleared?.twoFASecret).toBeNull();

      await prisma.user.delete({ where: { id: user.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  );

  it.skipIf(!dbUp)(
    "legacy plaintext secret still verifies; can be migrated-on-write",
    async () => {
      const tag = `2fa-legacy-${Date.now()}`;
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
      const org = await prisma.organization.create({
        data: { name: `Org-${tag}` },
      });
      const user = await prisma.user.create({
        data: {
          email: `u-${tag}@test.local`,
          password: await bcrypt.hash("Aaaaaaa1!", 10),
          role: "ADMIN",
          organizationId: org.id,
          emailVerified: true,
        },
      });

      const { decryptString, encryptString, isEncrypted } = await import(
        "../lib/crypto.js"
      );

      // Pretend the row was written before encryption was rolled out.
      const legacySecret = authenticator.generateSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFASecret: legacySecret, twoFAEnabled: true },
      });

      const before = await prisma.user.findUnique({ where: { id: user.id } });
      expect(isEncrypted(before?.twoFASecret ?? "")).toBe(false);

      // decryptString accepts plaintext and returns it as-is.
      const decoded = decryptString(before!.twoFASecret!);
      expect(decoded).toBe(legacySecret);

      // Migrate-on-write: store the encrypted form.
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFASecret: encryptString(decoded) },
      });
      const after = await prisma.user.findUnique({ where: { id: user.id } });
      expect(isEncrypted(after?.twoFASecret ?? "")).toBe(true);
      expect(decryptString(after!.twoFASecret!)).toBe(legacySecret);

      await prisma.user.delete({ where: { id: user.id } });
      await prisma.organization.delete({ where: { id: org.id } });
    }
  );
});
