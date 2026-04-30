import prisma from "./prisma.js";
import { Sentry, sentryEnabled } from "./sentry.js";
import type { Request } from "express";
import type { AuthRequest } from "../middleware/auth.js";
import type { PlatformAuthRequest } from "../middleware/platformAuth.js";

/**
 * Canonical AuditLog actor types.
 *
 * The schema field is a String, but every write across the codebase MUST use
 * exactly one of these three values. The migration at
 * `20260429160000_soft_delete_and_gdpr` retro-migrates legacy values
 * ("PLATFORM" → "PLATFORM_USER", "TENANT"/"USER" → "TENANT_USER"). The
 * tenant-side audit-log endpoint and the platform audit query schema both
 * validate against this exact set; drift drops historical or live rows from
 * the user-facing list.
 *
 * If you find yourself reaching for a fourth value, add it here, update the
 * platform query schema, and run `audit-actor-type-canonical.test.ts` —
 * which scans `backend/src/routes` for divergence.
 */
export type ActorType = "PLATFORM_USER" | "TENANT_USER" | "SYSTEM";
export const CANONICAL_ACTOR_TYPES: readonly ActorType[] = [
  "PLATFORM_USER",
  "TENANT_USER",
  "SYSTEM",
] as const;

/**
 * Low-level write helper. Best-effort: catches and reports to Sentry but
 * never throws — audit-write failure must not break the user's request.
 */
export async function writeAudit(params: {
  actorType: ActorType;
  actorId: string;
  organizationId?: string | null;
  targetOrganizationId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  target?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId,
        organizationId: params.organizationId ?? null,
        targetOrganizationId: params.targetOrganizationId ?? null,
        action: params.action,
        entity: params.entity ?? null,
        entityId: params.entityId ?? null,
        target: params.target ?? undefined,
        metadata: (params.metadata ?? null) as any,
      },
    });
  } catch (err) {
    // Audit failures must not break the user's request. Log + Sentry only.
    console.error("auditLog write failed:", err);
    if (sentryEnabled) {
      try {
        Sentry.captureException(err, {
          tags: { component: "audit", action: params.action },
        });
      } catch {
        /* swallow — Sentry must never throw out of audit path */
      }
    }
  }
}

/**
 * High-level helper for tenant + platform routes. Detects whether `req` is
 * an AuthRequest (tenant) or PlatformAuthRequest (platform) and computes
 * `actorType` + `targetOrganizationId` accordingly.
 *
 * Impersonation: when a tenant request was issued via a platform-issued
 * impersonation JWT (carries `impersonatedBy`), the audit row is attributed
 * to the PLATFORM_USER who initiated impersonation, with the tenant userId
 * preserved in `metadata.impersonatedTenantUserId`.
 *
 * @param req       Authenticated express request.
 * @param action    Short verb-noun string e.g. "LEAD_CREATE", "DEAL_DELETE".
 * @param entity    Model name e.g. "Lead", "Contact". Optional for ad-hoc actions.
 * @param entityId  Specific row id. Optional.
 * @param diff      Tiny before/after object — stored at `metadata.diff`. Pass
 *                  only the fields the user touched, NOT entire row dumps.
 */
export async function writeAuditLog(
  req: Request,
  action: string,
  entity?: string | null,
  entityId?: string | null,
  diff?: Record<string, unknown>
): Promise<void> {
  const tenantUser = (req as AuthRequest).user;
  const platformUser = (req as PlatformAuthRequest).platformUser;

  let actorType: ActorType;
  let actorId: string;
  let organizationId: string | null = null;
  let targetOrganizationId: string | null = null;
  const metadata: Record<string, unknown> = {};

  if (platformUser) {
    actorType = "PLATFORM_USER";
    actorId = platformUser.id;
  } else if (tenantUser) {
    const impersonatedBy = (tenantUser as any).impersonatedBy as
      | string
      | undefined;
    if (impersonatedBy) {
      // Impersonated request: attribute to the PLATFORM_USER who initiated it,
      // but record the tenant user we acted as.
      actorType = "PLATFORM_USER";
      actorId = impersonatedBy;
      metadata.impersonatedTenantUserId = tenantUser.userId;
    } else {
      actorType = "TENANT_USER";
      actorId = tenantUser.userId;
    }
    organizationId = tenantUser.organizationId;
    targetOrganizationId = tenantUser.organizationId;
  } else {
    // No auth on the request — caller should generally not invoke
    // writeAuditLog without a verified actor. Tag as SYSTEM so the row is at
    // least not silently dropped.
    actorType = "SYSTEM";
    actorId = "system";
  }

  if (diff && Object.keys(diff).length > 0) {
    metadata.diff = diff;
  }

  await writeAudit({
    actorType,
    actorId,
    organizationId,
    targetOrganizationId,
    action,
    entity: entity ?? null,
    entityId: entityId ?? null,
    metadata,
  });
}
