"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export interface KeyValidation {
  valid: boolean;
  error?: string;
}

export interface UpdateApiKeysResult {
  success: boolean;
  validation: {
    googleMaps: KeyValidation | null;
    gemini: KeyValidation | null;
    vapi: KeyValidation | null;
  };
}

export async function updateApiKeys(input: {
  googleMapsKey?: string;
  geminiKey?: string;
  vapiKey?: string;
  vapiPhoneId?: string;
}): Promise<UpdateApiKeysResult> {
  const payload: Record<string, string> = {};
  if (input.googleMapsKey !== undefined) payload.googleMapsKey = input.googleMapsKey;
  if (input.geminiKey !== undefined) payload.geminiKey = input.geminiKey;
  if (input.vapiKey !== undefined) payload.vapiKey = input.vapiKey;
  if (input.vapiPhoneId !== undefined) payload.vapiPhoneId = input.vapiPhoneId;

  const result = await fetchWithAuth("/settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  revalidatePath("/settings");

  return {
    success: true,
    validation: result?.validation ?? {
      googleMaps: null,
      gemini: null,
      vapi: null,
    },
  };
}

export async function getApiKeys() {
  return await fetchWithAuth("/settings");
}
