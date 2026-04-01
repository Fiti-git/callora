"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

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
