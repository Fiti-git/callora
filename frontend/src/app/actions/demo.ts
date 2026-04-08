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
