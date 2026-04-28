export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export async function validateGoogleMapsKey(key: string): Promise<ValidationResult> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=test&inputtype=textquery&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { valid: false, error: "Could not reach Google — check your network" };
    }
    const data = (await res.json()) as { status?: string };
    if (data.status === "REQUEST_DENIED") {
      return { valid: false, error: "Invalid API key" };
    }
    if (data.status === "OK" || data.status === "ZERO_RESULTS") {
      return { valid: true };
    }
    return { valid: false, error: `Google API returned status: ${data.status ?? "unknown"}` };
  } catch (err) {
    return { valid: false, error: "Could not reach Google — check your network" };
  }
}

export async function validateGeminiKey(key: string): Promise<ValidationResult> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Hello" }] }],
      }),
    });

    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: "Invalid Gemini API key" };
    }
    if (res.status === 200) {
      return { valid: true };
    }
    if (res.status === 400) {
      return { valid: true };
    }
    return { valid: false, error: `Gemini API returned HTTP ${res.status}` };
  } catch (err) {
    return { valid: false, error: "Could not reach Gemini — check your network" };
  }
}

export async function validateVapiKey(key: string): Promise<ValidationResult> {
  try {
    const res = await fetch("https://api.vapi.ai/phone-number", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 401) {
      return { valid: false, error: "Invalid Vapi API key" };
    }
    if (res.status === 200 || res.status === 404) {
      return { valid: true };
    }
    return { valid: false, error: `Vapi API returned HTTP ${res.status}` };
  } catch (err) {
    return { valid: false, error: "Could not reach Vapi — check your network" };
  }
}
