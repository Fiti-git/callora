"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function getDeals(filters?: { contactId?: string; stage?: string }) {
  const query = new URLSearchParams();
  if (filters?.contactId) query.set("contactId", filters.contactId);
  if (filters?.stage) query.set("stage", filters.stage);
  return fetchWithAuth(`/deals?${query.toString()}`);
}

export async function getDeal(id: string) {
  return fetchWithAuth(`/deals/${id}`);
}

export async function createDeal(data: {
  title: string;
  contactId: string;
  value?: number;
  probability?: number;
  stage?: string;
  closeDate?: string;
  notes?: string;
  assignedToId?: string;
}) {
  const result = await fetchWithAuth("/deals", {
    method: "POST",
    body: JSON.stringify(data),
  });
  revalidatePath("/pipeline");
  return result;
}

export async function updateDeal(
  id: string,
  data: {
    title?: string;
    value?: number;
    probability?: number;
    stage?: string;
    closeDate?: string;
    notes?: string;
    assignedToId?: string;
  }
) {
  const result = await fetchWithAuth(`/deals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${id}`);
  return result;
}

export async function deleteDeal(id: string) {
  const result = await fetchWithAuth(`/deals/${id}`, { method: "DELETE" });
  revalidatePath("/pipeline");
  return result;
}
