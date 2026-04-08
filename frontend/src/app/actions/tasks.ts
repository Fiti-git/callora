"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function getTasks(filters?: {
  assignedToMe?: boolean;
  completed?: boolean;
  contactId?: string;
  leadId?: string;
}) {
  const query = new URLSearchParams();
  if (filters?.assignedToMe) query.set("assignedToMe", "true");
  if (filters?.completed !== undefined) query.set("completed", String(filters.completed));
  if (filters?.contactId) query.set("contactId", filters.contactId);
  if (filters?.leadId) query.set("leadId", filters.leadId);
  return fetchWithAuth(`/tasks?${query.toString()}`);
}

export async function createTask(data: {
  title: string;
  description?: string;
  dueDate?: string;
  assignedToId?: string;
  leadId?: string;
  contactId?: string;
}) {
  const result = await fetchWithAuth("/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
  revalidatePath("/tasks");
  if (data.contactId) revalidatePath(`/contacts/${data.contactId}`);
  return result;
}

export async function updateTask(
  id: string,
  data: { title?: string; description?: string; dueDate?: string; assignedToId?: string }
) {
  const result = await fetchWithAuth(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  revalidatePath("/tasks");
  return result;
}

export async function completeTask(id: string) {
  const result = await fetchWithAuth(`/tasks/${id}/complete`, { method: "PATCH" });
  revalidatePath("/tasks");
  return result;
}

export async function deleteTask(id: string) {
  const result = await fetchWithAuth(`/tasks/${id}`, { method: "DELETE" });
  revalidatePath("/tasks");
  return result;
}
