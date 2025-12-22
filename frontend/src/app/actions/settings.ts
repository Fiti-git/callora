"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function updateApiKeys(data: FormData) {
  const googleMapsKey = data.get("googleMapsKey") as string;
  const geminiKey = data.get("geminiKey") as string;
  const vapiKey = data.get("vapiKey") as string;
  const vapiPhoneId = data.get("vapiPhoneId") as string;

  await fetchWithAuth("/settings", {
    method: "POST",
    body: JSON.stringify({
      googleMapsKey,
      geminiKey,
      vapiKey,
      vapiPhoneId,
    }),
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function getApiKeys() {
  return await fetchWithAuth("/settings");
}
