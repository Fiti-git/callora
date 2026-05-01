"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const CALLING_SERVICE_URL =
  process.env.CALLING_SERVICE_URL || "http://calling-service:4004";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";

export interface AssignedNumber {
  e164: string;
  status: string;
  isDedicated: boolean;
}

/**
 * Returns the org's assigned outbound number. If the calling-service has no
 * dedicated number for the org (404), the org is using the shared trial pool
 * and we surface that to the UI.
 */
export async function getAssignedNumber(
  orgId?: string
): Promise<AssignedNumber | null> {
  let organizationId = orgId;
  if (!organizationId) {
    const session: any = await getServerSession(authOptions);
    organizationId = session?.user?.organizationId;
  }
  if (!organizationId) return null;

  try {
    const res = await fetch(
      `${CALLING_SERVICE_URL}/internal/numbers/${encodeURIComponent(organizationId)}`,
      {
        headers: INTERNAL_TOKEN ? { "x-internal-token": INTERNAL_TOKEN } : {},
        cache: "no-store",
      }
    );
    if (res.status === 404) {
      return { e164: "", status: "POOL", isDedicated: false };
    }
    if (!res.ok) return null;
    const data = await res.json();
    return {
      e164: data.e164 ?? "",
      status: data.status ?? "UNKNOWN",
      isDedicated: true,
    };
  } catch {
    return null;
  }
}
