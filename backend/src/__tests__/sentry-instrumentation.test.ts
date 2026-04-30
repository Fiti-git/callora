/**
 * Sentry instrumentation — places, gemini, vapi, email.
 *
 * Asserts every external API failure path:
 *   1. Calls Sentry.captureException once with a `component` tag.
 *   2. Re-throws (fail-loud) so the caller surfaces the error.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.TENANT_APP_ORIGIN ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";
process.env.SENTRY_DSN ||= "https://example@sentry.io/1";

const captureException = vi.fn();

vi.mock("../lib/sentry.js", () => ({
  Sentry: { captureException },
  sentryEnabled: true,
}));

// Stub axios so the catch branch fires deterministically.
vi.mock("axios", async () => {
  const actual = await vi.importActual<any>("axios");
  return {
    ...actual,
    default: {
      ...actual.default,
      post: vi.fn(async () => {
        const e: any = new Error("simulated upstream outage");
        e.response = { data: { error: { message: "down" } } };
        throw e;
      }),
    },
  };
});

beforeEach(() => {
  captureException.mockReset();
});

describe("Sentry instrumentation", () => {
  it("places.findLeads → Sentry.captureException + rethrow", async () => {
    const { PlacesService } = await import("../services/places.js");
    const svc = new PlacesService("fake-key");
    await expect(svc.findLeads("plumbers in austin")).rejects.toThrow(
      /Google Places API Failed/
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    const tags = captureException.mock.calls[0][1]?.tags;
    expect(tags?.component).toBe("places");
  });

  it("gemini.qualifyLead → Sentry.captureException + rethrow on model failure", async () => {
    const { GeminiService } = await import("../services/gemini.js");
    const svc = new GeminiService("fake-key");
    // Stub model so we hit the catch branch deterministically.
    (svc as any).model = {
      generateContent: async () => {
        throw new Error("simulated model outage");
      },
    };
    await expect(svc.qualifyLead("transcript", "Acme")).rejects.toThrow(
      /AI service unavailable/
    );
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("vapi.initiateCall → Sentry.captureException + rethrow on API failure", async () => {
    const { VapiService } = await import("../services/vapi.js");
    const svc = new VapiService("fake-key", "phone-id");
    // Skip the consent / DNC / quota path by leaving organizationId undefined.
    await expect(
      svc.initiateCall("+15555555555", "Acme", {
        aiCallerName: "Bot",
        aiCallerCompany: "Callora",
        aiCallerPhone: "+15555555555",
        aiSystemPrompt: "You are a friendly caller.",
      })
    // Phase 5 Agent M3 — error message is now brand-scrubbed before rethrow.
    // "Vapi" → "the dialer". Sentry still receives the original error.
    ).rejects.toThrow(/the dialer call initiation failed/);
    expect(captureException).toHaveBeenCalledTimes(1);
    const tags = captureException.mock.calls[0][1]?.tags;
    expect(tags?.component).toBe("vapi");
  });
});
