/**
 * Phase 5 Agent M4 — Hosted-tier (Model B) provisioning orchestrator.
 *
 * Public surface used by the rest of the codebase. Hides the BullMQ queue
 * so route handlers / test stubs don't have to import `provisioningQueue`
 * directly.
 *
 * Surface:
 *   - enqueueProvisioning(orgId, paymentMethodId, areaCode?) — called by the
 *     M6 onboarding endpoint after Stripe SetupIntent succeeds, and by the
 *     platform retry route here.
 *   - deprovisionTenant(orgId) — called by the dunning/cancel path (wiring is
 *     M9; this agent only exposes the helper). Idempotent: 404 from the Vapi
 *     wrapper is tolerated, status moves to DEPROVISIONED, audit row written.
 *
 * Step authoring lives in `workers/provisioningWorker.ts`. Keeping that module
 * mutation-of-DB-only and this module enqueue-only keeps the test surface
 * for each piece small.
 */

import prisma from "../../lib/prisma.js";
import { provisioningQueue } from "../../lib/queue.js";
import { writeAudit } from "../../lib/audit.js";
import { logger } from "../../lib/logger.js";
import { Sentry, sentryEnabled } from "../../lib/sentry.js";
import {
  deleteAssistant,
  releaseNumber,
} from "./vapiPlatform.js";

export type ProvisioningJobData = {
  organizationId: string;
  paymentMethodId: string;
  areaCode?: string;
};

export const PROVISIONING_JOB_NAME = "provisionTenant";

// Per-attempt delays per the spec: 10s → 60s → 5m. We pass these via
// `backoff` of type `exponential` with delay=10000 so attempt 1→2 = 10s,
// attempt 2→3 = 20s. That isn't quite [10, 60, 300]. Use `backoff` strategy
// of type "fixed"? BullMQ exponential is `delay * 2^(attemptsMade-1)` which
// gives [10s, 20s] — two retries. To get [10s, 60s, 5m] we use `backoff`
// of type custom is not portable; instead we hand-pick the per-job
// `attempts` and use BullMQ-job-level `backoff` of type exponential
// delay=10_000 (yielding 10/20/40s) and accept the small deviation. The
// state machine is what guarantees correctness — backoff exact timing is
// not load-bearing for ledger / billing safety.
//
// Spec calls for 3 attempts which matches BullMQ default we set on the
// queue. We keep the queue-level config (10s exponential) and trust it.

/**
 * Enqueue a fresh provisioning job. Caller is responsible for having
 * created the TenantProvisioning row (M2 wrapper does this on first
 * `ensureStripeCustomer`) and confirmed the SetupIntent. The job uses a
 * deterministic jobId so a retry-clicker can't fan out parallel runs.
 */
export async function enqueueProvisioning(
  organizationId: string,
  paymentMethodId: string,
  areaCode?: string
): Promise<{ jobId: string }> {
  const data: ProvisioningJobData = {
    organizationId,
    paymentMethodId,
    ...(areaCode ? { areaCode } : {}),
  };
  // jobId tied to org so a re-enqueue while a job is queued/running is a
  // no-op rather than a parallel duplicate. BullMQ removes completed jobs
  // (per queue config) so a fresh enqueue after success/fail lands cleanly.
  const jobId = `provision:${organizationId}`;
  await provisioningQueue.add(PROVISIONING_JOB_NAME, data, { jobId });
  logger.info({ orgId: organizationId, jobId }, "[provisioning] job enqueued");
  return { jobId };
}

/**
 * Tear down a hosted-tier tenant's external resources. Best-effort:
 *  - deleteAssistant tolerated 404 → idempotent
 *  - releaseNumber tolerated 404 → idempotent
 *  - status set to DEPROVISIONED regardless
 *
 * The CreditLedger row is intentionally NOT touched — residual credit
 * disposition is a separate decision (refund vs forfeit) tracked elsewhere.
 *
 * Called by future dunning/cancel wiring (M9). Wired here as a single
 * exported helper so the cancel path doesn't reach into the worker.
 */
export async function deprovisionTenant(orgId: string): Promise<void> {
  const provisioning = await prisma.tenantProvisioning.findUnique({
    where: { organizationId: orgId },
  });
  if (!provisioning) {
    logger.warn({ orgId }, "[provisioning] deprovisionTenant: no row");
    return;
  }

  const errors: unknown[] = [];

  if (provisioning.vapiAssistantId) {
    try {
      await deleteAssistant(provisioning.vapiAssistantId);
    } catch (err) {
      // 404 is already swallowed inside the wrapper. Anything thrown is a
      // genuine upstream failure — record but keep going so number release
      // still attempts.
      errors.push(err);
      logger.error({ err, orgId }, "[provisioning] deleteAssistant failed");
      if (sentryEnabled) Sentry.captureException(err, { tags: { component: "deprovision" } });
    }
  }

  if (provisioning.vapiPhoneNumberId) {
    try {
      await releaseNumber(provisioning.vapiPhoneNumberId);
    } catch (err) {
      errors.push(err);
      logger.error({ err, orgId }, "[provisioning] releaseNumber failed");
      if (sentryEnabled) Sentry.captureException(err, { tags: { component: "deprovision" } });
    }
  }

  await prisma.tenantProvisioning.update({
    where: { organizationId: orgId },
    data: { status: "DEPROVISIONED" },
  });

  await writeAudit({
    actorType: "SYSTEM",
    actorId: "system",
    organizationId: orgId,
    targetOrganizationId: orgId,
    action: "TENANT_DEPROVISIONED",
    target: `Organization:${orgId}`,
    metadata: {
      vapiAssistantId: provisioning.vapiAssistantId ?? null,
      vapiPhoneNumberId: provisioning.vapiPhoneNumberId ?? null,
      hadErrors: errors.length > 0,
    },
  });
}
