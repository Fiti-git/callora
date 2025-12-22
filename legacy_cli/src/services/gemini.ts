import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface QualificationResult {
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  interestScore: number; // 1-10
  summary: string;
  nextSteps: string;
  isQualified: boolean;
}

export class GeminiService {
  private model: any;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      console.warn(
        "⚠️ GEMINI_API_KEY is missing! Using Mock fallbacks for LLM."
      );
    }
    this.model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite-preview-09-2025" });
  }

  async generateSearchQueries(userPrompt: string): Promise<string[]> {
    if (!process.env.GEMINI_API_KEY) return [userPrompt]; // Fallback

    const prompt = `
      You are a B2B Sales assistant.
      User request: "${userPrompt}"
      
      Extract the best search terms to find these businesses on Google Maps.
      Return strictly a JSON array of strings. Example: ["plumbers in Austin", "emergency plumbing services Austin"]
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
      // Clean up markdown code blocks if present
      const cleanText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      return JSON.parse(cleanText);
    } catch (error: any) {
      console.error("Gemini Search Query Error:", error.message);
      // Fallback to simpler search
      return [userPrompt];
    }
  }

  async qualifyLead(
    transcript: string,
    businessName: string
  ): Promise<QualificationResult> {
    const mockFallback: QualificationResult = {
      sentiment: "NEUTRAL",
      interestScore: 5,
      summary: "Mock analysis: Gemini API failed (Location/Quota).",
      nextSteps: "Check API availability.",
      isQualified: false,
    };

    if (!process.env.GEMINI_API_KEY) {
      return { ...mockFallback, summary: "Mock analysis: API Key missing." };
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
      const cleanText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      return JSON.parse(cleanText);
    } catch (error: any) {
      console.error("Gemini Qualification Error:", error.message);
      return mockFallback;
    }
  }
}
