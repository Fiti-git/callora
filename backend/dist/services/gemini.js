import { GoogleGenerativeAI } from "@google/generative-ai";
export class GeminiService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        if (this.apiKey) {
            const genAI = new GoogleGenerativeAI(this.apiKey);
            // Use the specific model version to avoid regional issues if possible, or handling logic
            this.model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });
        }
    }
    async generateSearchQueries(userPrompt) {
        if (!this.apiKey)
            return [userPrompt];
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
            return JSON.parse(cleanText);
        }
        catch (error) {
            console.error("Gemini Search Query Error:", error.message);
            // Fallback
            return [userPrompt];
        }
    }
    async qualifyLead(transcript, businessName) {
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
        }
        catch (error) {
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
