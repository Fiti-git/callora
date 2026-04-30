"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export interface TenantWebhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  status: string;
  responseCode: number | null;
  responseBody: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
  payload: unknown;
}

export async function listWebhooks(): Promise<TenantWebhook[]> {
  return fetchWithAuth("/webhooks");
}

export async function getWebhook(id: string): Promise<TenantWebhook> {
  return fetchWithAuth(`/webhooks/${id}`);
}

export async function createWebhook(input: {
  url: string;
  events: string[];
}): Promise<TenantWebhook & { secret: string }> {
  const result = await fetchWithAuth("/webhooks", {
    method: "POST",
    body: JSON.stringify(input),
  });
  revalidatePath("/settings/webhooks");
  return result;
}

export async function updateWebhook(
  id: string,
  input: { url?: string; events?: string[]; active?: boolean }
) {
  const result = await fetchWithAuth(`/webhooks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  revalidatePath("/settings/webhooks");
  return result;
}

export async function deleteWebhook(id: string) {
  await fetchWithAuth(`/webhooks/${id}`, { method: "DELETE" });
  revalidatePath("/settings/webhooks");
}

export async function rotateWebhookSecret(id: string): Promise<{ secret: string }> {
  return fetchWithAuth(`/webhooks/${id}/regenerate-secret`, { method: "POST" });
}

export async function listDeliveries(
  id: string,
  cursor?: string
): Promise<{ items: WebhookDelivery[]; nextCursor: string | null }> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchWithAuth(`/webhooks/${id}/deliveries${qs}`);
}

export async function redeliverWebhookDelivery(webhookId: string, deliveryId: string) {
  return fetchWithAuth(
    `/webhooks/${webhookId}/deliveries/${deliveryId}/redeliver`,
    { method: "POST" }
  );
}

export async function testWebhook(id: string) {
  return fetchWithAuth(`/webhooks/${id}/test`, { method: "POST" });
}

export async function getZapierTriggerUrl() {
  return fetchWithAuth("/webhooks/zapier/trigger-url");
}
