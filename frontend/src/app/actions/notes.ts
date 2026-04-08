"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function getNotes(params: { leadId?: string; contactId?: string }) {
  const query = new URLSearchParams();
  if (params.leadId) query.set("leadId", params.leadId);
  if (params.contactId) query.set("contactId", params.contactId);
  return fetchWithAuth(`/notes?${query.toString()}`);
}

export async function createNote(data: {
  content: string;
  type?: "NOTE" | "CALL" | "EMAIL" | "STATUS_CHANGE";
  leadId?: string;
  contactId?: string;
}) {
  const result = await fetchWithAuth("/notes", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (data.contactId) revalidatePath(`/contacts/${data.contactId}`);
  return result;
}

export async function updateNote(id: string, content: string) {
  const result = await fetchWithAuth(`/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
  return result;
}

export async function deleteNote(id: string) {
  return fetchWithAuth(`/notes/${id}`, { method: "DELETE" });
}
