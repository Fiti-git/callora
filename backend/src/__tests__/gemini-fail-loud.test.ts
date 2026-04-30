import { describe, it, expect } from "vitest";
import { GeminiService } from "../services/gemini.js";

/**
 * Gemini service must fail loud — never return fabricated qualifications,
 * dummy lead IDs, or stub queries. A silent fallback would let bad data into
 * the CRM unnoticed.
 */
describe("GeminiService fail-loud", () => {
  it("qualifyLead throws when API key is missing", async () => {
    const svc = new GeminiService("");
    await expect(svc.qualifyLead("transcript", "Acme")).rejects.toThrow(
      /Gemini API Key missing/
    );
  });

  it("generateSearchQueries throws when API key is missing", async () => {
    const svc = new GeminiService("");
    await expect(svc.generateSearchQueries("plumbers in Austin")).rejects.toThrow(
      /Gemini API Key missing/
    );
  });

  it("filterLeads throws when API key is missing and there are leads", async () => {
    const svc = new GeminiService("");
    await expect(
      svc.filterLeads([{ id: "1", name: "x" }], "criteria")
    ).rejects.toThrow(/Gemini API Key missing/);
  });

  it("qualifyLead throws (not returns a fake result) when the model call fails", async () => {
    const svc = new GeminiService("not-a-real-key");
    // Stub out the model so we hit the catch branch deterministically.
    (svc as any).model = {
      generateContent: async () => {
        throw new Error("simulated upstream outage");
      },
    };
    await expect(svc.qualifyLead("transcript", "Acme")).rejects.toThrow(
      /AI service unavailable/
    );
  });
});
