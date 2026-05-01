"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const BILLING_SERVICE_URL =
  process.env.BILLING_SERVICE_URL || "http://billing-service:4006";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

export interface SpendCap {
  dailyCapCents: number;
  currentDayCents: number;
  monthlyCapCents: number;
  currentMonthCents: number;
}

/**
 * Returns the org's current spend cap state for today and this month.
 * Used by Settings → Usage & Spend Cap to render progress bars.
 */
export async function getSpendCap(orgId?: string): Promise<SpendCap | null> {
  let organizationId = orgId;
  if (!organizationId) {
    const session: any = await getServerSession(authOptions);
    organizationId = session?.user?.organizationId;
  }
  if (!organizationId) return null;

  try {
    const res = await fetch(
      `${BILLING_SERVICE_URL}/internal/spend-cap/${encodeURIComponent(organizationId)}`,
      {
        headers: INTERNAL_TOKEN ? { "x-internal-token": INTERNAL_TOKEN } : {},
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      dailyCapCents: Number(data.dailyCapCents ?? 0),
      currentDayCents: Number(data.currentDayCents ?? 0),
      monthlyCapCents: Number(data.monthlyCapCents ?? 0),
      currentMonthCents: Number(data.currentMonthCents ?? 0),
    };
  } catch {
    return null;
  }
}
