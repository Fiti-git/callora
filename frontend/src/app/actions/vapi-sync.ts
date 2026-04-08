"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function syncVapiHistory(): Promise<{
  imported: number;
  skipped: number;
  total: number;
  errors: string[];
}> {
  const result = await fetchWithAuth("/vapi/sync", { method: "POST" });
  revalidatePath("/analytics");
  return result;
}
