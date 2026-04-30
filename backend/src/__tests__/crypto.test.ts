import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");

describe("lib/crypto AES-256-GCM helpers", () => {
  let mod: typeof import("../lib/crypto.js");

  beforeAll(async () => {
    mod = await import("../lib/crypto.js");
    mod._resetKeyCacheForTests();
  });

  it("encryptString → decryptString round-trips", () => {
    const plaintext = "JBSWY3DPEHPK3PXP"; // sample base32 TOTP secret
    const ct = mod.encryptString(plaintext);
    expect(ct.startsWith("v1:")).toBe(true);
    expect(mod.decryptString(ct)).toBe(plaintext);
  });

  it("produces a different envelope each call (random IV)", () => {
    const a = mod.encryptString("same-input");
    const b = mod.encryptString("same-input");
    expect(a).not.toBe(b);
    expect(mod.decryptString(a)).toBe("same-input");
    expect(mod.decryptString(b)).toBe("same-input");
  });

  it("rejects ciphertext with a tampered tag", () => {
    const ct = mod.encryptString("secret-payload");
    const parts = ct.split(":");
    // Flip the last byte of the auth tag.
    const tag = Buffer.from(parts[2], "hex");
    tag[tag.length - 1] ^= 0xff;
    parts[2] = tag.toString("hex");
    const tampered = parts.join(":");
    expect(() => mod.decryptString(tampered)).toThrow();
  });

  it("rejects malformed envelopes", () => {
    expect(() => mod.decryptString("v1:not-enough-parts")).toThrow(/malformed/);
    expect(() => mod.decryptString("v1:abcd:ef01:")).toThrow();
  });

  it("passes legacy plaintext through unchanged (one-phase migration window)", () => {
    // Anything that doesn't begin with `v1:` is treated as plaintext.
    expect(mod.decryptString("legacy-plaintext-secret")).toBe(
      "legacy-plaintext-secret"
    );
    expect(mod.decryptString("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("isEncrypted distinguishes envelopes from plaintext", () => {
    const ct = mod.encryptString("x");
    expect(mod.isEncrypted(ct)).toBe(true);
    expect(mod.isEncrypted("legacy")).toBe(false);
    expect(mod.isEncrypted(null)).toBe(false);
    expect(mod.isEncrypted(undefined)).toBe(false);
  });
});
