"use server";

import { fetchWithAuth } from "@/lib/api";

export interface AnalyticsRange {
  from?: string;
  to?: string;
}

function buildQs(range?: AnalyticsRange): string {
  const qs = new URLSearchParams();
  if (range?.from) qs.set("from", range.from);
  if (range?.to) qs.set("to", range.to);
  return qs.toString() ? `?${qs.toString()}` : "";
}

export async function getAnalytics(range?: AnalyticsRange) {
  return await fetchWithAuth(`/analytics${buildQs(range)}`);
}

export async function getCampaignAnalytics(
  campaignId: string,
  range?: AnalyticsRange
) {
  return await fetchWithAuth(
    `/analytics/campaigns/${campaignId}${buildQs(range)}`
  );
}

export async function getCohortAnalytics(period: "week" | "month" = "month") {
  return await fetchWithAuth(`/analytics/cohort?period=${period}`);
}
