"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

// Phase 2 Agent 7 — bulk operations on leads.
export async function bulkQualifyLeads(ids: string[]) {
  const result = await fetchWithAuth("/leads/bulk-qualify", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  revalidatePath("/leads");
  return result;
}

export async function bulkDisqualifyLeads(ids: string[], reason?: string) {
  const result = await fetchWithAuth("/leads/bulk-disqualify", {
    method: "POST",
    body: JSON.stringify({ ids, ...(reason ? { reason } : {}) }),
  });
  revalidatePath("/leads");
  return result;
}

export async function bulkDeleteLeads(ids: string[]) {
  const result = await fetchWithAuth("/leads/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  revalidatePath("/leads");
  return result;
}
