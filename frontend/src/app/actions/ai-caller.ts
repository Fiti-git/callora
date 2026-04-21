"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export interface AiCallerSettings {
  aiCallerName: string;
  aiCallerCompany: string;
  aiCallerPhone: string;
  aiSystemPrompt: string | null;
}

export async function getAiCallerSettings(): Promise<AiCallerSettings> {
  return await fetchWithAuth("/settings/ai-caller");
}

export async function updateAiCallerSettings(
  data: AiCallerSettings
): Promise<AiCallerSettings> {
  const result = await fetchWithAuth("/settings/ai-caller", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  revalidatePath("/settings");
  return result;
}
