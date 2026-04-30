"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function getContacts(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return fetchWithAuth(`/contacts${query}`);
}

export async function getContact(id: string) {
  return fetchWithAuth(`/contacts/${id}`);
}

export async function createContact(data: {
  businessName: string;
  phone: string;
  address?: string;
  email?: string;
}) {
  const result = await fetchWithAuth("/contacts", {
    method: "POST",
    body: JSON.stringify(data),
  });
  revalidatePath("/contacts");
  return result;
}

export async function updateContact(
  id: string,
  data: { businessName?: string; address?: string; email?: string }
) {
  const result = await fetchWithAuth(`/contacts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  return result;
}

export async function deleteContact(id: string) {
  const result = await fetchWithAuth(`/contacts/${id}`, { method: "DELETE" });
  revalidatePath("/contacts");
  return result;
}

// ---------------------------------------------------------------------------
// Bulk operations (Phase 2 Agent 7).
// ---------------------------------------------------------------------------
export async function bulkDeleteContacts(ids: string[]) {
  const result = await fetchWithAuth("/contacts/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  revalidatePath("/contacts");
  return result;
}

export async function bulkTagContacts(ids: string[], tags: string[]) {
  const result = await fetchWithAuth("/contacts/bulk-tag", {
    method: "POST",
    body: JSON.stringify({ ids, tags }),
  });
  revalidatePath("/contacts");
  return result;
}

export async function bulkAssignContactOwner(ids: string[], ownerId: string) {
  const result = await fetchWithAuth("/contacts/bulk-assign-owner", {
    method: "POST",
    body: JSON.stringify({ ids, ownerId }),
  });
  revalidatePath("/contacts");
  return result;
}

export async function mergeContact(primaryId: string, duplicateId: string) {
  const result = await fetchWithAuth(
    `/contacts/${primaryId}/merge/${duplicateId}`,
    { method: "POST" }
  );
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${primaryId}`);
  return result;
}

export async function getContactTimeline(id: string, cursor?: string) {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchWithAuth(`/contacts/${id}/timeline${q}`);
}
