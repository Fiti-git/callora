import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceSecret: vi.fn(),
  fetch: vi.fn(),
}));

(globalThis as any).fetch = mocks.fetch;

vi.mock("../config.js", () => ({
  getServiceSecret: mocks.getServiceSecret,
}));

import { assessSignup } from "../risk/signupRisk.js";

beforeEach(() => {
  mocks.getServiceSecret.mockReset();
  mocks.fetch.mockReset();
});

const baseInput = {
  email: "real.user@gmail.com",
  ip: "1.2.3.4",
  captchaToken: "captcha-ok",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605 Safari/605",
};

describe("assessSignup", () => {
  it("blocks disposable email domains", async () => {
    mocks.getServiceSecret.mockResolvedValue("hcap_secret");
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const out = await assessSignup({ ...baseInput, email: "x@mailinator.com" });
    expect(out.decision).toBe("block");
    expect(out.reasons.some((r) => r.startsWith("email_disposable"))).toBe(true);
  });

  it("blocks when captcha verification fails (returns success:false)", async () => {
    mocks.getServiceSecret.mockResolvedValue("hcap_secret");
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, "error-codes": ["bad-token"] }),
    });

    const out = await assessSignup(baseInput);
    expect(out.decision).toBe("block");
    expect(out.reasons.some((r) => r.startsWith("captcha_failed"))).toBe(true);
  });

  it("allows a clean signup with valid captcha", async () => {
    mocks.getServiceSecret.mockResolvedValue("hcap_secret");
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const out = await assessSignup(baseInput);
    expect(out.decision).toBe("allow");
    expect(out.reasons).toEqual([]);
  });

  it("blocks when captchaToken is missing", async () => {
    const out = await assessSignup({ ...baseInput, captchaToken: undefined });
    expect(out.decision).toBe("block");
    expect(out.reasons).toContain("captcha_missing");
  });
});
