import { GoogleGenerativeAI } from "@google/generative-ai";

export interface QualificationResult {
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  interestScore: number;
  summary: string;
  nextSteps: string;
  isQualified: boolean;
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

  async generateSearchQueries(userPrompt: string): Promise<string[]> {
    if (!this.apiKey) return [userPrompt];

    const prompt = `
      You are a B2B Sales assistant.
      User request: "${userPrompt}"

      Extract the best search terms to find these businesses on Google Maps.
      Return strictly a JSON array of strings. Example: ["plumbers in Austin", "emergency plumbing services Austin"]
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
      const cleanText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const jsonMatch = cleanText.match(/\[.*\]/s);
      const jsonStr = jsonMatch ? jsonMatch[0] : cleanText;

      return JSON.parse(jsonStr);
    } catch (error: any) {
      console.error("Gemini Search Query Error:", error.message);
      return [userPrompt];
    }
  }

  async filterLeads(leads: any[], userPrompt: string): Promise<string[]> {
    if (!this.apiKey || leads.length === 0) return leads.map((l) => l.id);

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
      const cleanText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const jsonMatch = cleanText.match(/\[.*\]/s);
      const jsonStr = jsonMatch ? jsonMatch[0] : cleanText;

      return JSON.parse(jsonStr);
    } catch (error: any) {
      console.error("Gemini Filtering Error:", error.message);
      return leads.map((l) => l.id);
    }
  }

  async qualifyLead(
    transcript: string,
    businessName: string
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
      const cleanText = text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      return JSON.parse(cleanText);
    } catch (error: any) {
      console.error("Gemini Qualification Error:", error.message);
      return {
        sentiment: "NEUTRAL",
        interestScore: 0,
        summary: `Error analyzing: ${error.message}`,
        nextSteps: "Manual Review",
        isQualified: false,
      };
    }
  }
}
