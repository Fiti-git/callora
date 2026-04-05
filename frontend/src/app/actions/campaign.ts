"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function scheduleFollowUp(
  leadId: string,
  type: "PENDING_RETRY" | "PENDING_FOLLOWUP",
  scheduledAt: string
) {
  const result = await fetchWithAuth(`/leads/${leadId}/schedule-followup`, {
    method: "PATCH",
    body: JSON.stringify({ type, scheduledAt }),
  });
  revalidatePath("/follow-ups");
  return result;
}

export async function createCampaign(name: string, type: "AI" | "CSV", prompt?: string) {
  const result = await fetchWithAuth("/campaigns", {
    method: "POST",
    body: JSON.stringify({ name, type, prompt }),
  });
  console.log("Server Action Result:", result);
  revalidatePath("/campaigns");
  return result;
}

export async function findLeads(campaignId: string, limit: number = 20) {
  const result = await fetchWithAuth(`/campaigns/${campaignId}/scrape`, {
    method: "POST",
    body: JSON.stringify({ limit }),
  });
  revalidatePath(`/campaigns/${campaignId}`);
  return result;
}

export async function startCalls(campaignId: string) {
  const result = await fetchWithAuth(`/campaigns/${campaignId}/call`, {
    method: "POST",
  });
  revalidatePath(`/campaigns/${campaignId}`);
  return result;
}

export async function importLeads(campaignId: string, leads: object[]) {
  const result = await fetchWithAuth(`/campaigns/${campaignId}/import`, {
    method: "POST",
    body: JSON.stringify({ leads }),
  });
  revalidatePath(`/campaigns/${campaignId}`);
  return result;
}

export async function runFollowUps(campaignId: string) {
  const result = await fetchWithAuth(`/campaigns/${campaignId}/followups`, {
    method: "POST",
  });
  revalidatePath(`/campaigns/${campaignId}`);
  return result;
}

export async function getPendingFollowUps(campaignId: string) {
  return await fetchWithAuth(`/campaigns/${campaignId}/followups/pending`);
}

export async function updateFollowUpSettings(
  campaignId: string,
  settings: { maxRetryAttempts: number; retryDelayHours: number; followUpDelayDays: number }
) {
  const result = await fetchWithAuth(`/campaigns/${campaignId}/followup-settings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
  revalidatePath("/follow-ups/settings");
  return result;
}
