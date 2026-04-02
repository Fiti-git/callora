"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function addToBlacklist(phoneNumber: string, reason?: string) {
  const result = await fetchWithAuth("/blacklist", {
    method: "POST",
    body: JSON.stringify({ phoneNumber, reason }),
  });
  revalidatePath("/blacklist");
  return result;
}

export async function removeFromBlacklist(id: string) {
  const result = await fetchWithAuth(`/blacklist/${id}`, { method: "DELETE" });
  revalidatePath("/blacklist");
  return result;
}
