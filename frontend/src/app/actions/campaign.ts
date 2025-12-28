"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function createCampaign(prompt: string, name: string) {
  const result = await fetchWithAuth("/campaigns", {
    method: "POST",
    body: JSON.stringify({ prompt, name }),
  });
  console.log("Server Action Result:", result);
  revalidatePath("/campaigns");
  return result; // returns campaign object
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
