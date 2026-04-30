"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchWithAuth } from "@/lib/api";

const API_URL = process.env.API_URL || "http://backend:4000/api";

const BASE = "/email-marketing";

// =====================================================================
// Campaigns
// =====================================================================

export async function listCampaigns(params: { status?: string; cursor?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return await fetchWithAuth(`${BASE}/campaigns${q ? `?${q}` : ""}`);
}

export async function getCampaign(id: string) {
  return await fetchWithAuth(`${BASE}/campaigns/${id}`);
}

export async function createCampaign(input: {
  name: string;
  subject: string;
  previewText?: string | null;
  htmlBody: string;
  textBody?: string | null;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  listIds?: string[];
}) {
  const result = await fetchWithAuth(`${BASE}/campaigns`, {
    method: "POST",
    body: JSON.stringify({ ...input, listIds: input.listIds ?? [] }),
  });
  revalidatePath("/email-marketing/campaigns");
  return result;
}

export async function updateCampaign(
  id: string,
  patch: Partial<{
    name: string;
    subject: string;
    previewText: string | null;
    htmlBody: string;
    textBody: string | null;
    fromName: string;
    fromEmail: string;
    replyTo: string | null;
    listIds: string[];
  }>
) {
  const result = await fetchWithAuth(`${BASE}/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  revalidatePath(`/email-marketing/campaigns/${id}`);
  revalidatePath("/email-marketing/campaigns");
  return result;
}

export async function deleteCampaign(id: string) {
  const result = await fetchWithAuth(`${BASE}/campaigns/${id}`, { method: "DELETE" });
  revalidatePath("/email-marketing/campaigns");
  return result;
}

export async function sendCampaign(id: string) {
  const result = await fetchWithAuth(`${BASE}/campaigns/${id}/send`, { method: "POST" });
  revalidatePath(`/email-marketing/campaigns/${id}`);
  revalidatePath("/email-marketing/campaigns");
  return result;
}

export async function scheduleCampaign(id: string, scheduledAt: string) {
  const result = await fetchWithAuth(`${BASE}/campaigns/${id}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduledAt }),
  });
  revalidatePath(`/email-marketing/campaigns/${id}`);
  revalidatePath("/email-marketing/campaigns");
  return result;
}

export async function pauseCampaign(id: string) {
  const result = await fetchWithAuth(`${BASE}/campaigns/${id}/pause`, { method: "POST" });
  revalidatePath(`/email-marketing/campaigns/${id}`);
  return result;
}

export async function resumeCampaign(id: string) {
  const result = await fetchWithAuth(`${BASE}/campaigns/${id}/resume`, { method: "POST" });
  revalidatePath(`/email-marketing/campaigns/${id}`);
  return result;
}

export async function getCampaignAnalytics(id: string) {
  return await fetchWithAuth(`${BASE}/campaigns/${id}/analytics`);
}

export async function getCampaignRecipients(
  id: string,
  params: { status?: string; cursor?: string; limit?: number } = {}
) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return await fetchWithAuth(`${BASE}/campaigns/${id}/recipients${q ? `?${q}` : ""}`);
}

export async function sendTestEmail(id: string, testRecipient: string) {
  return await fetchWithAuth(`${BASE}/campaigns/${id}/test-send`, {
    method: "POST",
    body: JSON.stringify({ testRecipient }),
  });
}

// =====================================================================
// Lists
// =====================================================================

export async function listLists(params: { cursor?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return await fetchWithAuth(`${BASE}/lists${q ? `?${q}` : ""}`);
}

export async function getList(id: string) {
  return await fetchWithAuth(`${BASE}/lists/${id}`);
}

export async function createList(input: { name: string; description?: string | null }) {
  const result = await fetchWithAuth(`${BASE}/lists`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  revalidatePath("/email-marketing/lists");
  return result;
}

export async function updateList(id: string, patch: { name?: string; description?: string | null }) {
  const result = await fetchWithAuth(`${BASE}/lists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  revalidatePath("/email-marketing/lists");
  revalidatePath(`/email-marketing/lists/${id}`);
  return result;
}

export async function deleteList(id: string) {
  const result = await fetchWithAuth(`${BASE}/lists/${id}`, { method: "DELETE" });
  revalidatePath("/email-marketing/lists");
  return result;
}

export async function listMembers(
  id: string,
  params: { cursor?: string; limit?: number } = {}
) {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return await fetchWithAuth(`${BASE}/lists/${id}/members${q ? `?${q}` : ""}`);
}

export async function addContactsToList(
  id: string,
  payload: { emails?: string[]; contactIds?: string[] }
) {
  const result = await fetchWithAuth(`${BASE}/lists/${id}/contacts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  revalidatePath(`/email-marketing/lists/${id}`);
  return result;
}

export async function removeListMember(id: string, memberId: string) {
  const result = await fetchWithAuth(`${BASE}/lists/${id}/contacts/${memberId}`, {
    method: "DELETE",
  });
  revalidatePath(`/email-marketing/lists/${id}`);
  return result;
}

/**
 * CSV import — accepts a FormData with a "file" field. Forwards to backend
 * as multipart/form-data with the tenant JWT.
 */
export async function importListCsv(id: string, formData: FormData) {
  const session = await getServerSession(authOptions);
  const token = session?.user?.accessToken;
  if (!token) throw new Error("Not authenticated");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Missing CSV file");

  const forward = new FormData();
  forward.append("file", file, file.name);

  const res = await fetch(`${API_URL}${BASE}/lists/${id}/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: forward,
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(data.error || `Import failed: ${res.status}`);
  }
  revalidatePath(`/email-marketing/lists/${id}`);
  return data;
}

// =====================================================================
// Templates
// =====================================================================

export async function listTemplates() {
  return await fetchWithAuth(`${BASE}/templates`);
}

export async function createTemplate(input: {
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  category?: string | null;
  isDefault?: boolean;
}) {
  const result = await fetchWithAuth(`${BASE}/templates`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  revalidatePath("/email-marketing/templates");
  return result;
}

export async function updateTemplate(
  id: string,
  patch: Partial<{
    name: string;
    subject: string;
    htmlBody: string;
    textBody: string | null;
    category: string | null;
    isDefault: boolean;
  }>
) {
  const result = await fetchWithAuth(`${BASE}/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  revalidatePath("/email-marketing/templates");
  return result;
}

export async function deleteTemplate(id: string) {
  const result = await fetchWithAuth(`${BASE}/templates/${id}`, { method: "DELETE" });
  revalidatePath("/email-marketing/templates");
  return result;
}

// =====================================================================
// Automations
// =====================================================================

export async function listAutomations() {
  return await fetchWithAuth(`${BASE}/automations`);
}

export async function getAutomation(id: string) {
  // No GET-by-id route; fetch list and find. (Backend does not expose detail.)
  const { items } = await fetchWithAuth(`${BASE}/automations`);
  return (items as any[]).find((a) => a.id === id) ?? null;
}

export async function createAutomation(input: {
  name: string;
  trigger: "LEAD_QUALIFIED" | "DEAL_WON" | "CONTACT_CREATED" | "CAMPAIGN_COMPLETE";
  active?: boolean;
  sequence: any[];
}) {
  const result = await fetchWithAuth(`${BASE}/automations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  revalidatePath("/email-marketing/automations");
  return result;
}

export async function updateAutomation(
  id: string,
  patch: Partial<{ name: string; trigger: string; active: boolean; sequence: any[] }>
) {
  const result = await fetchWithAuth(`${BASE}/automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  revalidatePath("/email-marketing/automations");
  return result;
}

export async function activateAutomation(id: string, active: boolean) {
  const result = await fetchWithAuth(`${BASE}/automations/${id}/activate`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
  revalidatePath("/email-marketing/automations");
  return result;
}
