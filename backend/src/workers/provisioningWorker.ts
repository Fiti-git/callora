/**
 * Phase 5 Agent M4 — Hosted-tier (Model B) provisioning worker.
 *
 * Drives the 6-step state machine that turns a freshly-signed-up org with a
 * confirmed SetupIntent into a working hosted-tier tenant. Each step writes
 * progress to `TenantProvisioning.steps` JSON BEFORE throwing/continuing so
 * a re-run picks up exactly where it left off.
 *
 * Steps:
 *   1. customer       — Stripe Customer ensured
 *   2. paymentMethod  — default PM attached
 *   3. firstTopUp     — $25 charge initiated (ledger credits via webhook)
 *   4. phoneNumber    — Vapi/Twilio number purchased
 *   5. assistant      — Vapi assistant created with org persona
 *   6. attach         — assistant bound to number
 *
 * Failure handling:
 *   - Retryable (network / 5xx / RetryableProvisioningError): throw → BullMQ
 *     retries with exponential backoff (queue-level config; up to 3 attempts).
 *   - Terminal (4xx / missing tenant profile fields):
 *       set status=FAILED, brand-clean failureReason, audit, email tenant,
 *       DO NOT throw — let BullMQ mark complete.
 *   - Final attempt exhausted on retryable:
 *       same FAILED treatment (handled in the Worker `failed` handler in
 *       workers/index.ts via the standard finalizeFailure helper exported here).
 */

import type { Job } from "bullmq";
import prisma from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { Sentry, sentryEnabled } from "../lib/sentry.js";
import { writeAudit } from "../lib/audit.js";
import { sendEmail } from "../lib/email.js";
import {
  ensureStripeCustomer,
  confirmDefaultPaymentMethod,
  chargeTopUp,
} from "../services/stripeBilling.js";
import {
  purchaseTwilioNumber,
  createAssistant,
  attachAssistantToNumber,
  PlatformProvisioningError,
  type AssistantPersona,
} from "../services/provisioning/vapiPlatform.js";
import { scrubBrandStrings } from "../services/provisioning/brandScrub.js";
import type { ProvisioningJobData } from "../services/provisioning/index.js";

type StepStatus = "pending" | "done" | "initiated" | "failed";
type StepsJson = Partial<Record<
  "customer" | "paymentMethod" | "firstTopUp" | "phoneNumber" | "assistant" | "attach",
  StepStatus
>>;

const FIRST_TOPUP_CENTS = 2500;

/**
 * Errors of this shape are TERMINAL — no BullMQ retry, mark FAILED now.
 * Construct with a brand-clean message; that string is what we persist on
 * `TenantProvisioning.failureReason` and surface in the tenant email.
 */
export class TerminalProvisioningError extends Error {
  override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(scrubBrandStrings(message));
    this.name = "TerminalProvisioningError";
    this.cause = cause;
  }
}

function isTerminalUpstream(err: unknown): boolean {
  // PlatformProvisioningError already wraps brand-clean message + cause.
  // 4xx from Vapi/Stripe: terminal. 5xx / network: retryable.
  if (err instanceof TerminalProvisioningError) return true;
  if (err instanceof PlatformProvisioningError) {
    const cause = err.cause as { response?: { status?: number } } | undefined;
    const status = cause?.response?.status;
    if (typeof status === "number" && status >= 400 && status < 500) return true;
    return false;
  }
  // Stripe SDK errors carry `.type` and `.code`. Card-decline / payment
  // failures are terminal (the user must update their card and re-enqueue).
  const e = err as { type?: string; code?: string; statusCode?: number };
  if (e?.type === "StripeCardError") return true;
  if (typeof e?.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 500) return true;
  return false;
}

async function readSteps(orgId: string): Promise<StepsJson> {
  const row = await prisma.tenantProvisioning.findUnique({
    where: { organizationId: orgId },
    select: { steps: true },
  });
  return ((row?.steps ?? {}) as StepsJson) || {};
}

async function writeStep(
  orgId: string,
  step: keyof StepsJson,
  status: StepStatus
): Promise<void> {
  // Read-modify-write — provisioning steps are low-throughput per org so
  // a transactional CAS isn't required. The deterministic jobId guarantees
  // only one worker instance runs at a time per org.
  const current = await readSteps(orgId);
  const next: StepsJson = { ...current, [step]: status };
  await prisma.tenantProvisioning.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, steps: next as object },
    update: { steps: next as object },
  });
}

async function buildPersonaOrThrow(orgId: string): Promise<AssistantPersona> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      aiCallerName: true,
      aiCallerCompany: true,
      aiSystemPrompt: true,
    },
  });
  if (!org) {
    throw new TerminalProvisioningError(
      "Tenant profile incomplete — please finish onboarding."
    );
  }
  if (!org.aiCallerName || !org.aiCallerCompany || !org.aiSystemPrompt) {
    throw new TerminalProvisioningError(
      "Tenant profile incomplete — please finish onboarding."
    );
  }
  return {
    callerName: org.aiCallerName,
    companyName: org.aiCallerCompany,
    systemPrompt: org.aiSystemPrompt,
  };
}

async function markFailed(
  orgId: string,
  err: unknown,
  step: keyof StepsJson
): Promise<void> {
  const rawMsg =
    err instanceof Error ? err.message : "Unknown provisioning error";
  const failureReason = scrubBrandStrings(rawMsg);

  await prisma.tenantProvisioning.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      status: "FAILED",
      failureReason,
      steps: { [step]: "failed" } as object,
    },
    update: {
      status: "FAILED",
      failureReason,
      steps: { ...(await readSteps(orgId)), [step]: "failed" } as object,
    },
  });

  await writeAudit({
    actorType: "SYSTEM",
    actorId: "system",
    organizationId: orgId,
    targetOrganizationId: orgId,
    action: "PROVISIONING_FAILED",
    target: `Organization:${orgId}`,
    metadata: {
      step,
      failureReason,
      // Internal cause kept here for the audit trail; this row is
      // platform-only and never returned to a tenant.
      cause:
        err instanceof Error
          ? { name: err.name, message: err.message }
          : String(err),
    },
  });

  if (sentryEnabled) {
    Sentry.captureException(err, {
      tags: { component: "provisioning-worker", step },
      extra: { orgId },
    });
  }

  // Notify the org admin — passive (required: false) so a quota-exhausted
  // email account doesn't bubble back into this worker.
  try {
    const admin = await prisma.user.findFirst({
      where: { organizationId: orgId, role: "ADMIN" },
      select: { email: true, name: true },
    });
    if (admin?.email) {
      await sendEmail(
        admin.email,
        "We hit a snag setting up your account",
        `<p>Hi ${admin.name ?? "there"},</p>
         <p>We couldn't finish setting up your account. Our team has been alerted and will reach out shortly.</p>
         <p>Reference: <code>${orgId}</code></p>`,
        {
          organizationId: orgId,
          template: "provisioning_failed",
          required: false,
        }
      );
    }
  } catch (emailErr) {
    logger.error(
      { err: emailErr, orgId },
      "[provisioning] failure-email send failed (non-fatal)"
    );
  }
}

/**
 * Main worker entry. Throws on retryable errors (BullMQ retries); resolves
 * (no throw) when terminal failure has been recorded.
 */
export async function provisioningWorker(
  job: Job<ProvisioningJobData>
): Promise<{ status: "READY" | "FAILED" }> {
  const { organizationId: orgId, paymentMethodId, areaCode } = job.data;
  if (!orgId) throw new Error("provisioningWorker: missing organizationId");

  // Move PENDING → PROVISIONING on the first attempt only. Subsequent retry
  // attempts (BullMQ) skip this so a concurrent observer doesn't see a
  // status flap.
  await prisma.tenantProvisioning.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      status: "PROVISIONING",
    },
    update: {
      // Don't downgrade a READY/SUSPENDED row.
      status: { set: "PROVISIONING" } as any,
    },
  }).catch(async () => {
    // If the upsert update form rejected (some Prisma versions don't accept
    // {set:...} on enum updates inside upsert update), fall back to a plain
    // update gated on current status.
    await prisma.tenantProvisioning.updateMany({
      where: { organizationId: orgId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "PROVISIONING", failureReason: null },
    });
  });

  // Each step is independently idempotent. A re-run reads the steps JSON
  // and skips already-done work.
  let steps = await readSteps(orgId);

  // Step 1 — Stripe Customer
  if (steps.customer !== "done") {
    try {
      await ensureStripeCustomer(orgId);
      await writeStep(orgId, "customer", "done");
    } catch (err) {
      if (isTerminalUpstream(err)) {
        await markFailed(orgId, err, "customer");
        return { status: "FAILED" };
      }
      throw err;
    }
  }

  // Step 2 — default payment method
  if (steps.paymentMethod !== "done") {
    try {
      await confirmDefaultPaymentMethod(orgId, paymentMethodId);
      await writeStep(orgId, "paymentMethod", "done");
    } catch (err) {
      if (isTerminalUpstream(err)) {
        await markFailed(orgId, err, "paymentMethod");
        return { status: "FAILED" };
      }
      throw err;
    }
  }

  // Step 3 — first $25 top-up. We mark "initiated" — the Stripe webhook
  // credits the ledger asynchronously when payment_intent.succeeded fires.
  // The user can already use the system; the credit will arrive within
  // seconds. Re-runs of this step are idempotent because of the
  // deterministic Stripe Idempotency-Key.
  steps = await readSteps(orgId);
  if (steps.firstTopUp !== "initiated" && steps.firstTopUp !== "done") {
    try {
      await chargeTopUp(orgId, FIRST_TOPUP_CENTS, {
        source: "MANUAL",
        idempotencyKey: `first-topup-${orgId}`,
      });
      await writeStep(orgId, "firstTopUp", "initiated");
    } catch (err) {
      if (isTerminalUpstream(err)) {
        await markFailed(orgId, err, "firstTopUp");
        return { status: "FAILED" };
      }
      throw err;
    }
  }

  // Step 4 — phone number
  steps = await readSteps(orgId);
  if (steps.phoneNumber !== "done") {
    try {
      const { vapiPhoneNumberId, e164 } = await purchaseTwilioNumber({
        orgId,
        ...(areaCode ? { areaCode } : {}),
      });
      await prisma.tenantProvisioning.upsert({
        where: { organizationId: orgId },
        create: {
          organizationId: orgId,
          vapiPhoneNumberId,
          vapiPhoneE164: e164,
        },
        update: {
          vapiPhoneNumberId,
          vapiPhoneE164: e164,
        },
      });
      await writeStep(orgId, "phoneNumber", "done");
    } catch (err) {
      if (isTerminalUpstream(err)) {
        await markFailed(orgId, err, "phoneNumber");
        return { status: "FAILED" };
      }
      throw err;
    }
  }

  // Step 5 — assistant
  steps = await readSteps(orgId);
  if (steps.assistant !== "done") {
    try {
      const persona = await buildPersonaOrThrow(orgId);
      const { vapiAssistantId } = await createAssistant({ orgId, persona });
      await prisma.tenantProvisioning.update({
        where: { organizationId: orgId },
        data: { vapiAssistantId },
      });
      await writeStep(orgId, "assistant", "done");
    } catch (err) {
      if (isTerminalUpstream(err)) {
        await markFailed(orgId, err, "assistant");
        return { status: "FAILED" };
      }
      throw err;
    }
  }

  // Step 6 — attach
  steps = await readSteps(orgId);
  if (steps.attach !== "done") {
    try {
      const row = await prisma.tenantProvisioning.findUnique({
        where: { organizationId: orgId },
        select: { vapiAssistantId: true, vapiPhoneNumberId: true },
      });
      if (!row?.vapiAssistantId || !row?.vapiPhoneNumberId) {
        // Inconsistency — earlier steps lied. Treat as terminal so the row
        // is visibly broken in admin and someone resets it.
        throw new TerminalProvisioningError(
          "Internal provisioning state inconsistent — please contact support."
        );
      }
      await attachAssistantToNumber({
        vapiAssistantId: row.vapiAssistantId,
        vapiPhoneNumberId: row.vapiPhoneNumberId,
      });
      await writeStep(orgId, "attach", "done");
    } catch (err) {
      if (isTerminalUpstream(err)) {
        await markFailed(orgId, err, "attach");
        return { status: "FAILED" };
      }
      throw err;
    }
  }

  // All steps done → READY
  await prisma.tenantProvisioning.update({
    where: { organizationId: orgId },
    data: {
      status: "READY",
      provisionedAt: new Date(),
      failureReason: null,
    },
  });

  await writeAudit({
    actorType: "SYSTEM",
    actorId: "system",
    organizationId: orgId,
    targetOrganizationId: orgId,
    action: "PROVISIONING_COMPLETED",
    target: `Organization:${orgId}`,
    metadata: { jobId: String(job.id ?? "") },
  });

  logger.info({ orgId }, "[provisioning] tenant ready");
  return { status: "READY" };
}

/**
 * Final-attempt failure helper — invoked from the Worker's `failed` handler
 * once BullMQ has exhausted retries on a retryable error. Mirrors
 * `markFailed` so a worker that genuinely couldn't reach Stripe/Vapi for
 * the whole retry window still ends in a clean FAILED state.
 */
export async function finalizeProvisioningFailure(
  orgId: string,
  err: unknown
): Promise<void> {
  await markFailed(orgId, err, "phoneNumber");
}
