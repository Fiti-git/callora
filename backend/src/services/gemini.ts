import { GoogleGenerativeAI } from "@google/generative-ai";
import { Sentry, sentryEnabled } from "../lib/sentry.js";
import { meterAndCharge } from "../lib/quota.js";

export interface QualificationResult {
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  interestScore: number; // 1-10
  summary: string;
  nextSteps: string;
  isQualified: boolean;
}

/**
 * Best-effort token usage extraction. Newer @google/generative-ai responses
 * expose `usageMetadata.totalTokenCount`; if missing, fall back to a
 * char/4 heuristic over prompt + response text. The heuristic over-counts
 * slightly which is the safer direction for billing.
 */
function tokensUsed(prompt: string, responseText: string, result: any): number {
  const meta = result?.response?.usageMetadata;
  const total =
    meta?.totalTokenCount ??
    (meta?.promptTokenCount ?? 0) + (meta?.candidatesTokenCount ?? 0);
  if (typeof total === "number" && total > 0) return total;
  return Math.max(1, Math.ceil((prompt.length + (responseText?.length ?? 0)) / 4));
}

export class GeminiService {
  private model: any;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    if (this.apiKey) {
      const genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
      });
    }
  }

  async generateSearchQueries(
    userPrompt: string,
    organizationId?: string
  ): Promise<string[]> {
    if (!this.apiKey) {
      throw new Error("Gemini API Key missing.");
    }

    const prompt = `
      You are a B2B Sales assistant.
      User request: "${userPrompt}"

      Extract the best search terms to find these businesses on Google Maps.
      Return strictly a JSON array of strings. Example: ["plumbers in Austin", "emergency plumbing services Austin"]
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
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
    } catch (error: any) {
      if (error?.name === "QuotaExceededError") throw error;
      if (sentryEnabled) Sentry.captureException(error);
      throw new Error(`AI service unavailable: ${error.message}`);
    }
  }

  async filterLeads(
    leads: any[],
    userPrompt: string,
    organizationId?: string
  ): Promise<string[]> {
    if (leads.length === 0) return [];
    if (!this.apiKey) {
      throw new Error("Gemini API Key missing.");
    }

    // Minimize token usage by sending only relevant fields
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
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
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
    } catch (error: any) {
      if (error?.name === "QuotaExceededError") throw error;
      if (sentryEnabled) Sentry.captureException(error);
      throw new Error(`AI service unavailable: ${error.message}`);
    }
  }

  async qualifyLead(
    transcript: string,
    businessName: string,
    organizationId?: string
  ): Promise<QualificationResult> {
    if (!this.apiKey) {
      throw new Error("Gemini API Key missing.");
    }

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
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
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
    } catch (error: any) {
      if (error?.name === "QuotaExceededError") throw error;
      if (sentryEnabled) Sentry.captureException(error);
      throw new Error(`AI service unavailable: ${error.message}`);
    }
  }
}
