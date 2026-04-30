import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Verifies that the Places + Gemini service wrappers actually invoke
 * `meterAndCharge` after a successful API call, with the right kind and
 * units, and that QuotaExceededError propagates instead of being swallowed.
 *
 * No DB and no real network — the Google clients and the quota helper
 * are mocked. These checks are pure unit tests.
 */

// Mock the quota module BEFORE the services are imported.
const meterMock = vi.fn();
vi.mock("../lib/quota.js", () => ({
  meterAndCharge: meterMock,
  QuotaExceededError: class QuotaExceededError extends Error {
    kind: string;
    current: number;
    limit: number;
    units: number;
    constructor(kind: string, current: number, limit: number, units: number) {
      super(`quota`);
      this.name = "QuotaExceededError";
      this.kind = kind;
      this.current = current;
      this.limit = limit;
      this.units = units;
    }
  },
}));

// Mock axios for Places.
vi.mock("axios", () => ({
  default: {
    post: vi.fn().mockResolvedValue({
      data: {
        places: [
          { id: "p1", displayName: { text: "A" }, formattedAddress: "addr", internationalPhoneNumber: "+1" },
          { id: "p2", displayName: { text: "B" }, formattedAddress: "addr", internationalPhoneNumber: "+2" },
          { id: "p3", displayName: { text: "C" }, formattedAddress: "addr", internationalPhoneNumber: "+3" },
        ],
      },
    }),
  },
}));

// Mock the Gemini SDK.
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () =>
              JSON.stringify({
                sentiment: "POSITIVE",
                interestScore: 8,
                summary: "ok",
                nextSteps: "follow up",
                isQualified: true,
              }),
            usageMetadata: { totalTokenCount: 42 },
          },
        }),
      };
    }
  },
}));

beforeEach(() => {
  meterMock.mockReset();
  meterMock.mockResolvedValue(undefined);
});

describe("PlacesService.findLeads quota wiring", () => {
  it("calls meterAndCharge(orgId, 'PLACES', resultCount) on success", async () => {
    const { PlacesService } = await import("../services/places.js");
    const svc = new PlacesService("fake-key");
    const results = await svc.findLeads("plumbers", "org-123");
    expect(results).toHaveLength(3);
    expect(meterMock).toHaveBeenCalledOnce();
    expect(meterMock).toHaveBeenCalledWith("org-123", "PLACES", 3);
  });

  it("does NOT meter when organizationId is omitted (back-compat path)", async () => {
    const { PlacesService } = await import("../services/places.js");
    const svc = new PlacesService("fake-key");
    await svc.findLeads("plumbers");
    expect(meterMock).not.toHaveBeenCalled();
  });

  it("propagates QuotaExceededError instead of wrapping it as a 'Places API failed' error", async () => {
    const { PlacesService } = await import("../services/places.js");
    const { QuotaExceededError } = await import("../lib/quota.js");
    meterMock.mockRejectedValueOnce(
      new QuotaExceededError("PLACES" as any, 9, 10, 3)
    );
    const svc = new PlacesService("fake-key");
    await expect(svc.findLeads("plumbers", "org-123")).rejects.toThrow(
      QuotaExceededError
    );
  });
});

describe("GeminiService.qualifyLead quota wiring", () => {
  it("calls meterAndCharge(orgId, 'GEMINI_TOKEN', tokens) on success", async () => {
    const { GeminiService } = await import("../services/gemini.js");
    const svc = new GeminiService("fake-key");
    const result = await svc.qualifyLead("transcript", "Acme Co", "org-456");
    expect(result.isQualified).toBe(true);
    expect(meterMock).toHaveBeenCalledOnce();
    const [orgId, kind, units] = meterMock.mock.calls[0];
    expect(orgId).toBe("org-456");
    expect(kind).toBe("GEMINI_TOKEN");
    // We mocked totalTokenCount=42; the helper should pass that through.
    expect(units).toBe(42);
  });

  it("propagates QuotaExceededError from meterAndCharge (does not wrap)", async () => {
    const { GeminiService } = await import("../services/gemini.js");
    const { QuotaExceededError } = await import("../lib/quota.js");
    meterMock.mockRejectedValueOnce(
      new QuotaExceededError("GEMINI_TOKEN" as any, 999, 1000, 42)
    );
    const svc = new GeminiService("fake-key");
    await expect(
      svc.qualifyLead("transcript", "Acme Co", "org-456")
    ).rejects.toThrow(QuotaExceededError);
  });
});
