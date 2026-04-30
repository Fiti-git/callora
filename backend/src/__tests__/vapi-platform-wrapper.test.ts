import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

/**
 * Phase 5 Agent M3 — platform Vapi wrapper unit tests.
 *
 * Logic-only: axios is mocked. We verify:
 *   - successful POST returns id + e164
 *   - pre-flight finds existing org-<orgId> resource and skips POST
 *   - 5xx → 3 retries with backoff, then PlatformProvisioningError
 *   - 4xx → no retries, immediate throw
 *   - delete/release 404 are idempotent (resolve OK)
 *   - error messages are brand-clean and original cause is preserved
 */

// Boot env (env.ts validates at module load when NODE_ENV !== "test")
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.NEXTAUTH_SECRET ||= "test-nextauth";
process.env.PLATFORM_JWT_SECRET ||= "test-platform";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.TWOFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.DNC_HASH_PEPPER ||= "test-pepper";
process.env.RESEND_WEBHOOK_SECRET ||= "test-resend";
process.env.STRIPE_PRICE_PAYG_TOPUP_25 ||= "price_test";
process.env.PAYG_LOW_BALANCE_ALERT_CENTS ||= "1000";
process.env.PAYG_AUTO_RECHARGE_DEFAULT_THRESHOLD_CENTS ||= "1000";
process.env.PAYG_AUTO_RECHARGE_DEFAULT_AMOUNT_CENTS ||= "2500";
process.env.PLATFORM_VAPI_PRIVATE_KEY ||= "platform-vapi-key-xyz";
process.env.PLATFORM_GEMINI_API_KEY ||= "platform-gemini-key";
process.env.PLATFORM_GOOGLE_PLACES_API_KEY ||= "platform-places-key";

vi.mock("axios", () => {
  const m = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return { default: m, ...m };
});

import axios from "axios";
import {
  purchaseTwilioNumber,
  createAssistant,
  attachAssistantToNumber,
  deleteAssistant,
  releaseNumber,
  PlatformProvisioningError,
} from "../services/provisioning/vapiPlatform.js";

const mAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const BANNED = [
  "vapi",
  "twilio",
  "bland",
  "deepgram",
  "elevenlabs",
  "11labs",
  "gemini",
  "google places",
  "resend",
];
function brandClean(s: string): boolean {
  const lc = s.toLowerCase();
  return !BANNED.some((b) => lc.includes(b));
}

beforeEach(() => {
  mAxios.get.mockReset();
  mAxios.post.mockReset();
  mAxios.patch.mockReset();
  mAxios.delete.mockReset();
  // Make backoff sleeps no-op so retry tests run fast.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

function axiosError(status: number, data: any = { message: "boom" }) {
  // mimic AxiosError shape enough for our wrapper
  const err: any = new Error(`Request failed with status ${status}`);
  err.response = { status, statusText: `S${status}`, data };
  err.isAxiosError = true;
  return err;
}

describe("purchaseTwilioNumber", () => {
  it("POSTs and returns id + e164 on success", async () => {
    mAxios.get.mockResolvedValueOnce({ data: [] }); // pre-flight, no match
    mAxios.post.mockResolvedValueOnce({
      data: { id: "pn_abc", number: "+15551234567" },
    });
    const res = await purchaseTwilioNumber({ orgId: "org1" });
    expect(res).toEqual({ vapiPhoneNumberId: "pn_abc", e164: "+15551234567" });
    expect(mAxios.post).toHaveBeenCalledTimes(1);
    const [url, body] = mAxios.post.mock.calls[0];
    expect(url).toBe("https://api.vapi.ai/phone-number");
    expect(body.name).toBe("org-org1");
    expect(body.provider).toBe("vapi");
  });

  it("reuses an existing org-<orgId> number without POSTing", async () => {
    mAxios.get.mockResolvedValueOnce({
      data: [
        { id: "pn_old", number: "+15550000000", name: "org-org1" },
        { id: "pn_other", number: "+15559999999", name: "org-other" },
      ],
    });
    const res = await purchaseTwilioNumber({ orgId: "org1" });
    expect(res).toEqual({ vapiPhoneNumberId: "pn_old", e164: "+15550000000" });
    expect(mAxios.post).not.toHaveBeenCalled();
  });

  it("retries 3x on 5xx, then throws PlatformProvisioningError(NUMBER_PROVISION_FAILED)", async () => {
    mAxios.get.mockResolvedValueOnce({ data: [] });
    mAxios.post.mockRejectedValue(axiosError(503));
    await expect(purchaseTwilioNumber({ orgId: "org1" })).rejects.toMatchObject({
      name: "PlatformProvisioningError",
      code: "NUMBER_PROVISION_FAILED",
    });
    // 3 attempts total
    expect(mAxios.post).toHaveBeenCalledTimes(3);
    // Verify error is brand-clean and cause is preserved
    try {
      mAxios.get.mockResolvedValueOnce({ data: [] });
      mAxios.post.mockRejectedValue(axiosError(503, { message: "Twilio outage on Vapi backend" }));
      await purchaseTwilioNumber({ orgId: "org1" });
    } catch (err: any) {
      expect(err).toBeInstanceOf(PlatformProvisioningError);
      expect(brandClean(err.message)).toBe(true);
      expect(err.cause).toBeDefined();
    }
  });

  it("does NOT retry on 4xx", async () => {
    mAxios.get.mockResolvedValueOnce({ data: [] });
    mAxios.post.mockRejectedValue(axiosError(400, { message: "Bad area code" }));
    await expect(
      purchaseTwilioNumber({ orgId: "org1", areaCode: "999" })
    ).rejects.toMatchObject({ code: "NUMBER_PROVISION_FAILED" });
    expect(mAxios.post).toHaveBeenCalledTimes(1);
  });

  it("emits a brand-clean error message (no vendor leakage)", async () => {
    mAxios.get.mockResolvedValueOnce({ data: [] });
    mAxios.post.mockRejectedValue(
      axiosError(400, { message: "Vapi: Twilio number unavailable" })
    );
    try {
      await purchaseTwilioNumber({ orgId: "org1" });
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(PlatformProvisioningError);
      expect(brandClean(err.message)).toBe(true);
      expect(err.cause).toBeDefined();
    }
  });
});

describe("createAssistant", () => {
  const persona = {
    callerName: "Alex",
    companyName: "Acme",
    systemPrompt: "You are Alex from Acme...",
  };

  it("POSTs and returns id on success", async () => {
    mAxios.get.mockResolvedValueOnce({ data: [] });
    mAxios.post.mockResolvedValueOnce({ data: { id: "as_xyz" } });
    const res = await createAssistant({ orgId: "org2", persona });
    expect(res).toEqual({ vapiAssistantId: "as_xyz" });
    const [, body] = mAxios.post.mock.calls[0];
    expect(body.name).toBe("org-org2");
    expect(body.firstMessage).toBe("Hi, this is Alex from Acme.");
    expect(body.model.messages[0].content).toBe(persona.systemPrompt);
  });

  it("reuses an existing assistant by name", async () => {
    mAxios.get.mockResolvedValueOnce({
      data: [{ id: "as_existing", name: "org-org2" }],
    });
    const res = await createAssistant({ orgId: "org2", persona });
    expect(res).toEqual({ vapiAssistantId: "as_existing" });
    expect(mAxios.post).not.toHaveBeenCalled();
  });

  it("retries 3x on 5xx then throws ASSISTANT_PROVISION_FAILED brand-clean", async () => {
    mAxios.get.mockResolvedValueOnce({ data: [] });
    mAxios.post.mockRejectedValue(axiosError(502, { message: "Vapi LLM upstream down" }));
    try {
      await createAssistant({ orgId: "org2", persona });
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(PlatformProvisioningError);
      expect(err.code).toBe("ASSISTANT_PROVISION_FAILED");
      expect(brandClean(err.message)).toBe(true);
      expect(err.cause).toBeDefined();
    }
    expect(mAxios.post).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 4xx", async () => {
    mAxios.get.mockResolvedValueOnce({ data: [] });
    mAxios.post.mockRejectedValue(axiosError(422));
    await expect(createAssistant({ orgId: "org2", persona })).rejects.toMatchObject(
      { code: "ASSISTANT_PROVISION_FAILED" }
    );
    expect(mAxios.post).toHaveBeenCalledTimes(1);
  });
});

describe("attachAssistantToNumber", () => {
  it("PATCHes /phone-number/:id with assistantId", async () => {
    mAxios.patch.mockResolvedValueOnce({ data: {} });
    await attachAssistantToNumber({
      vapiAssistantId: "as_1",
      vapiPhoneNumberId: "pn_1",
    });
    const [url, body] = mAxios.patch.mock.calls[0];
    expect(url).toBe("https://api.vapi.ai/phone-number/pn_1");
    expect(body).toEqual({ assistantId: "as_1" });
  });

  it("retries 5xx then throws ATTACH_FAILED brand-clean", async () => {
    mAxios.patch.mockRejectedValue(axiosError(500));
    try {
      await attachAssistantToNumber({
        vapiAssistantId: "as_1",
        vapiPhoneNumberId: "pn_1",
      });
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(PlatformProvisioningError);
      expect(err.code).toBe("ATTACH_FAILED");
      expect(brandClean(err.message)).toBe(true);
    }
    expect(mAxios.patch).toHaveBeenCalledTimes(3);
  });
});

describe("deleteAssistant", () => {
  it("DELETEs /assistant/:id and resolves", async () => {
    mAxios.delete.mockResolvedValueOnce({ data: {} });
    await expect(deleteAssistant("as_1")).resolves.toBeUndefined();
    expect(mAxios.delete).toHaveBeenCalledTimes(1);
  });

  it("treats 404 as idempotent success", async () => {
    mAxios.delete.mockRejectedValueOnce(axiosError(404));
    await expect(deleteAssistant("as_gone")).resolves.toBeUndefined();
  });

  it("throws ASSISTANT_PROVISION_FAILED on persistent 5xx", async () => {
    mAxios.delete.mockRejectedValue(axiosError(500));
    await expect(deleteAssistant("as_1")).rejects.toMatchObject({
      code: "ASSISTANT_PROVISION_FAILED",
    });
  });
});

describe("releaseNumber", () => {
  it("DELETEs /phone-number/:id and resolves", async () => {
    mAxios.delete.mockResolvedValueOnce({ data: {} });
    await expect(releaseNumber("pn_1")).resolves.toBeUndefined();
  });

  it("treats 404 as idempotent success", async () => {
    mAxios.delete.mockRejectedValueOnce(axiosError(404));
    await expect(releaseNumber("pn_gone")).resolves.toBeUndefined();
  });

  it("throws RELEASE_FAILED on persistent 5xx, brand-clean", async () => {
    mAxios.delete.mockRejectedValue(axiosError(500, { message: "Twilio cannot release" }));
    try {
      await releaseNumber("pn_1");
      throw new Error("should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(PlatformProvisioningError);
      expect(err.code).toBe("RELEASE_FAILED");
      expect(brandClean(err.message)).toBe(true);
      expect(err.cause).toBeDefined();
    }
  });
});
