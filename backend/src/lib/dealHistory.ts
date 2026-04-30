import type { Prisma } from "@prisma/client";

/**
 * Record a Deal stage change in the tenant-facing chronology table.
 *
 * Distinct from AuditLog (security record). Both should be written for
 * stage changes — DealHistory powers the per-deal timeline UI; AuditLog
 * powers the org-wide security feed.
 *
 * Pass a transaction client (`tx`) when called from within `$transaction`
 * so the history row is part of the same atomic write as the deal update.
 */
export async function recordDealStageChange(
  tx: Prisma.TransactionClient | typeof import("./prisma.js").default,
  params: {
    dealId: string;
    organizationId: string;
    fromStage: string | null;
    toStage: string;
    changedById?: string | null;
    reason?: string | null;
  }
) {
  return (tx as any).dealHistory.create({
    data: {
      dealId: params.dealId,
      organizationId: params.organizationId,
      fromStage: params.fromStage,
      toStage: params.toStage,
      changedById: params.changedById ?? null,
      reason: params.reason ?? null,
    },
  });
}
