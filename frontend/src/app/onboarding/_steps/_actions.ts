"use server";

import { fetchWithAuth } from "@/lib/api";

/**
 * Server action used by ProvisioningStep to fetch the raw payload from
 * /api/me/provisioning-status (which includes the per-step map). Kept
 * adjacent to the step that consumes it so the action surface remains
 * scoped to the wizard.
 */
export async function getProvisioningRawAction(): Promise<{
  status: string;
  steps: Record<string, "done" | "pending">;
  completedSteps: number;
  totalSteps: number;
  failureReason: string | null;
  phoneNumberE164: string | null;
}> {
  return await fetchWithAuth("/me/provisioning-status");
}
