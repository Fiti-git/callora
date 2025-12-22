"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function createCampaign(prompt: string, name: string) {
  const result = await fetchWithAuth("/campaigns", {
    method: "POST",
    body: JSON.stringify({ prompt, name }),
  });
  revalidatePath("/campaigns");
  return result; // returns campaign object
}

export async function runCampaign(campaignId: string) {
  // Use long-timeout? OR Just async trigger.
  // We'll wait.
  await fetchWithAuth(`/campaigns/${campaignId}/run`, {
    method: "POST",
  });
  revalidatePath(`/campaigns/${campaignId}`);
  return { success: true };
}
