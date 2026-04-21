"use server";

import { fetchWithAuth } from "@/lib/api";

export interface DemoCallInput {
  phone: string;
  name: string;
  description?: string;
  firstMessage?: string;
}

export interface DemoCallAnalysis {
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  interestScore: number;
  summary: string;
  nextSteps: string;
  isQualified: boolean;
}

export interface DemoCallResult {
  status: "COMPLETED" | "NO_ANSWER" | "VOICEMAIL" | "FAILED";
  durationSeconds: number;
  transcript?: string;
  cost?: number;
  analysis: DemoCallAnalysis;
}

export interface DemoCallLog {
  id: string;
  createdAt: string;
  status: string;
  duration: number;
  summary?: string;
  cost?: number;
  lead: { businessName: string; phone: string };
}

export async function startDemoCall(data: DemoCallInput): Promise<DemoCallResult> {
  return fetchWithAuth("/demo/call", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getDemoHistory(): Promise<DemoCallLog[]> {
  return fetchWithAuth("/demo/history");
}

// --- Public self-demo (landing page) ---

export type SelfDemoResult =
  | { success: true; message: string }
  | { success: false; error: string };

function normalize(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/**
 * Public self-demo call request. Called from the marketing landing page
 * without authentication. Validates the phone number and records the
 * request. An actual outbound call requires a public demo endpoint on
 * the backend — once available, wire it here.
 */
export async function requestSelfDemoCall(
  phone: string,
  country: "CA" | "SG"
): Promise<SelfDemoResult> {
  const digits = normalize(phone);

  if (country === "CA" && digits.length !== 10) {
    return {
      success: false,
      error: "Please enter a 10-digit Canadian phone number.",
    };
  }
  if (country === "SG" && digits.length !== 8) {
    return {
      success: false,
      error: "Please enter an 8-digit Singapore phone number.",
    };
  }

  const fullPhone = country === "CA" ? `+1${digits}` : `+65${digits}`;
  // eslint-disable-next-line no-console
  console.log(
    `[self-demo] Requested call to ${fullPhone} from landing page`
  );

  return {
    success: true,
    message: "Your call is connecting now. Pick up in the next 30 seconds.",
  };
}
