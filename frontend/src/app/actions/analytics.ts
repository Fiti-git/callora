"use server";

import { fetchWithAuth } from "@/lib/api";

export async function getAnalytics() {
  return await fetchWithAuth("/analytics");
}
