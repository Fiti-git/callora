import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M5 — credentials resolver.
 *
 * Pure-logic tests against `resolveFromOrg`. We assemble the org row directly
 * so we don't need a DB. encryptString is real (env-keyed) so the BYOK path
 * decrypts correctly.
 */

process.env.NEXTAUTH_SECRET ||= "test-nextauth";
process.env.PLATFORM_JWT_SECRET ||= "test-platform";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.PLATFORM_VAPI_PRIVATE_KEY ||= "platform-vapi-master";
process.env.PLATFORM_GEMINI_API_KEY ||= "platform-gemini-master";
process.env.PLATFORM_GOOGLE_PLACES_API_KEY ||= "platform-places-master";
process.env.NODE_ENV = "test";

import { resolveFromOrg, CredentialsUnavailableError } from "../lib/credentials.js";
import { encryptString } from "../lib/crypto.js";

function payg(provReady = true): any {
  return {
    id: "org_a",
    billingMode: "PAYG",
    apiKeys: null,
    provisioning: provReady
      ? {
          status: "READY",
          vapiAssistantId: "asst_abc",
          vapiPhoneNumberId: "phn_abc",
        }
      : { status: "PROVISIONING", vapiAssistantId: null, vapiPhoneNumberId: null },
  };
}

function byok(keys: Partial<{ vapi: string; gemini: string; places: string; phone: string }>): any {
  return {
    id: "org_b",
    billingMode: "BYOK",
    apiKeys: {
      vapiKey: keys.vapi ? encryptString(keys.vapi) : null,
      vapiPhoneId: keys.phone ?? null,
      geminiKey: keys.gemini ? encryptString(keys.gemini) : null,
      googleMapsKey: keys.places ? encryptString(keys.places) : null,
    },
    provisioning: null,
  };
}

describe("resolveFromOrg", () => {
  it("PAYG + READY returns platform Vapi creds with assistant + phone", () => {
    const r = resolveFromOrg(payg(true), "VAPI") as any;
    expect(r.kind).toBe("PLATFORM");
    expect(r.apiKey).toBe("platform-vapi-master");
    expect(r.vapiAssistantId).toBe("asst_abc");
    expect(r.vapiPhoneNumberId).toBe("phn_abc");
  });

  it("PAYG + not-ready throws PROVISIONING_NOT_READY for VAPI", () => {
    expect(() => resolveFromOrg(payg(false), "VAPI")).toThrow(
      CredentialsUnavailableError
    );
    try {
      resolveFromOrg(payg(false), "VAPI");
    } catch (err: any) {
      expect(err.code).toBe("PROVISIONING_NOT_READY");
    }
  });

  it("PAYG returns platform key for GEMINI / PLACES regardless of provisioning", () => {
    const g = resolveFromOrg(payg(false), "GEMINI") as any;
    expect(g.kind).toBe("PLATFORM");
    expect(g.apiKey).toBe("platform-gemini-master");
    const p = resolveFromOrg(payg(false), "PLACES") as any;
    expect(p.apiKey).toBe("platform-places-master");
  });

  it("BYOK + missing key throws BYOK_KEY_MISSING", () => {
    try {
      resolveFromOrg(byok({}), "GEMINI");
      throw new Error("expected throw");
    } catch (err: any) {
      expect(err).toBeInstanceOf(CredentialsUnavailableError);
      expect(err.code).toBe("BYOK_KEY_MISSING");
    }
  });

  it("BYOK + present key decrypts and returns plaintext", () => {
    const r = resolveFromOrg(
      byok({ gemini: "tenant-gemini-secret" }),
      "GEMINI"
    ) as any;
    expect(r.kind).toBe("BYOK");
    expect(r.apiKey).toBe("tenant-gemini-secret");
  });

  it("BYOK Vapi requires both key and phone id", () => {
    try {
      resolveFromOrg(byok({ vapi: "x" }), "VAPI"); // no phone
      throw new Error("expected throw");
    } catch (err: any) {
      expect(err.code).toBe("BYOK_KEY_MISSING");
    }
    const ok = resolveFromOrg(byok({ vapi: "x", phone: "phn_byok" }), "VAPI") as any;
    expect(ok.apiKey).toBe("x");
    expect(ok.vapiPhoneNumberId).toBe("phn_byok");
  });

  it("Invalid billing mode throws INVALID_BILLING_MODE", () => {
    try {
      resolveFromOrg({ ...payg(true), billingMode: "BOGUS" } as any, "VAPI");
      throw new Error("expected throw");
    } catch (err: any) {
      expect(err.code).toBe("INVALID_BILLING_MODE");
    }
  });
});
