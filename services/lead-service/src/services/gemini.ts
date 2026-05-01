import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { meterAndCharge, timeVendorCall, logger } from "@callora/shared";
import { getServiceSecret } from "../config.js";
import { CircuitBreaker } from "../lib/circuitBreaker.js";

export interface QualificationResult {
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  interestScore: number;
  summary: string;
  nextSteps: string;
  isQualified: boolean;
}

interface GenerateResult {
  response: {
    text: () => string;
    usageMetadata?: {
      totalTokenCount?: number;
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };
}

function tokensUsed(prompt: string, responseText: string, result: GenerateResult): number {
  const meta = result?.response?.usageMetadata;
  const total =
    meta?.totalTokenCount ??
    (meta?.promptTokenCount ?? 0) + (meta?.candidatesTokenCount ?? 0);
  if (typeof total === "number" && total > 0) return total;
  return Math.max(1, Math.ceil((prompt.length + (responseText?.length ?? 0)) / 4));
}

const geminiBreaker = new CircuitBreaker("gemini");

let cachedModel: GenerativeModel | null = null;
async function getModel(): Promise<GenerativeModel> {
  if (cachedModel) return cachedModel;
  const key = await getServiceSecret("GEMINI_API_KEY");
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured for the platform.");
  }
  const genAI = new GoogleGenerativeAI(key);
  cachedModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
  return cachedModel;
}

async function callGemini(prompt: string): Promise<{ text: string; result: GenerateResult }> {
  const model = await getModel();
  const result = (await geminiBreaker.exec(() =>
    timeVendorCall("gemini", "generateContent", () => model.generateContent(prompt))
  )) as unknown as GenerateResult;
  const text = result.response.text();
  return { text, result };
}

export class GeminiService {
  async generateSearchQueries(
    userPrompt: string,
    organizationId?: string
  ): Promise<string[]> {
    const prompt = `
      You are a B2B Sales assistant.
      User request: "${userPrompt}"

      Extract the best search terms to find these businesses on Google Maps.
      Return strictly a JSON array of strings. Example: ["plumbers in Austin", "emergency plumbing services Austin"]
    `;

    try {
      const { text, result } = await callGemini(prompt);
      if (organizationId) {
        await meterAndCharge(
          organizationId,
          "GEMINI_TOKEN",
          tokensUsed(prompt, text, result)
        );
      }
      const cleanText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const jsonMatch = cleanText.match(/\[.*\]/s);
      const jsonStr = jsonMatch ? jsonMatch[0] : cleanText;

      return JSON.parse(jsonStr);
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err?.name === "QuotaExceededError" || err?.name === "VendorUnavailableError") throw error;
      logger.error({ err: err.message }, "[lead-service] Gemini search-query error");
      return [userPrompt];
    }
  }

  async filterLeads(
    leads: Array<{ id: string; name?: string; rating?: number; userRatingCount?: number; types?: string[]; address?: string }>,
    userPrompt: string,
    organizationId?: string
  ): Promise<string[]> {
    if (leads.length === 0) return [];

    const minimalLeads = leads.map((l) => ({
      id: l.id,
      name: l.name,
      rating: l.rating,
      reviews: l.userRatingCount,
      types: l.types,
      address: l.address,
    }));

    const prompt = `
      You are a Data Filter.
      User Criteria: "${userPrompt}"

      Input Data:
      ${JSON.stringify(minimalLeads)}

      Task:
      Return a JSON array of IDs for the items that match the user's criteria.
      If the criteria matches (e.g. review count, rating, type, location), keep it.
      If the criteria is vague or impossible to check, keep it.

      Return format: ["id1", "id2"]
    `;

    try {
      const { text, result } = await callGemini(prompt);
      if (organizationId) {
        await meterAndCharge(
          organizationId,
          "GEMINI_TOKEN",
          tokensUsed(prompt, text, result)
        );
      }
      const cleanText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const jsonMatch = cleanText.match(/\[.*\]/s);
      const jsonStr = jsonMatch ? jsonMatch[0] : cleanText;

      return JSON.parse(jsonStr);
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err?.name === "QuotaExceededError" || err?.name === "VendorUnavailableError") throw error;
      logger.error({ err: err.message }, "[lead-service] Gemini filtering error");
      return leads.map((l) => l.id);
    }
  }

  async qualifyLead(
    transcript: string,
    businessName: string,
    organizationId?: string
  ): Promise<QualificationResult> {
    const prompt = `
      Analyze this sales call transcript with ${businessName}.

      TRANSCRIPT:
      ${transcript}

      Your task:
      1. Rate interest from 1-10.
      2. Summarize the discussion.
      3. Determine sentiment.
      4. Suggest next steps.
      5. Mark isQualified=true if interest > 6.

      Return ONLY valid JSON matching this interface:
      {
        "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
        "interestScore": number,
        "summary": "string",
        "nextSteps": "string",
        "isQualified": boolean
      }
    `;

    try {
      const { text, result } = await callGemini(prompt);
      if (organizationId) {
        await meterAndCharge(
          organizationId,
          "GEMINI_TOKEN",
          tokensUsed(prompt, text, result)
        );
      }
      const cleanText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      return JSON.parse(cleanText);
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (err?.name === "QuotaExceededError" || err?.name === "VendorUnavailableError") throw error;
      // Per project rules, qualification must fail loud — don't fabricate.
      throw new Error(`AI service unavailable: ${err.message}`);
    }
  }
}
