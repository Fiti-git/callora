import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function listModels() {
  try {
    // There isn't a direct "listModels" on the instance, but we can try to get a model or just use the model we have to check.
    // Actually, the SDK doesn't expose listModels easily in the simplified wrapper.
    // But the error says "Call ListModels".

    // Attempting to access via the underlying API if possible, or just trying a known older model 'gemini-pro' to see if it works.

    // Let's try to just fetch the model info if possible.
    // The node SDK has a ModelManager? No.

    // workaround: use fetch directly to see models.
    const key = process.env.GEMINI_API_KEY;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    );
    const data = await response.json();
    console.log("Available Models:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
