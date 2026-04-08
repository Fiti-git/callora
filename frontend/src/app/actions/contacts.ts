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
