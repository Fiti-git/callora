"use server";

import { fetchWithAuth } from "@/lib/api";
import { revalidatePath } from "next/cache";

export interface PublicApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  maskedKey: string;
}

export async function listPublicApiKeys(): Promise<PublicApiKey[]> {
  return fetchWithAuth("/developer/api-keys");
}

export async function createPublicApiKey(input: {
  name: string;
  scopes: string[];
}): Promise<PublicApiKey & { key: string }> {
  const result = await fetchWithAuth("/developer/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
  revalidatePath("/settings/developers/api-keys");
  return result;
}

export async function revokePublicApiKey(id: string) {
  await fetchWithAuth(`/developer/api-keys/${id}`, { method: "DELETE" });
  revalidatePath("/settings/developers/api-keys");
}
