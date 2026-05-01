/**
 * Tenant-scoped audit-log writer for auth-service. Best-effort: never throws.
 * Mirrors backend/src/lib/audit.ts, restricted to TENANT_USER writes.
 */
import type { Request } from "express";
import { prisma } from "@callora/shared";
import type { AuthRequest } from "../middleware/requireAuth.js";

export async function writeAuditLog(
  req: Request,
  action: string,
  entity?: string | null,
  entityId?: string | null,
  diff?: Record<string, unknown>
): Promise<void> {
  const tenantUser = (req as AuthRequest).user;
  if (!tenantUser) return;

  const metadata: Record<string, unknown> = {};
  if (diff && Object.keys(diff).length > 0) metadata.diff = diff;

  try {
    await prisma.auditLog.create({
      data: {
        actorType: "TENANT_USER",
        actorId: tenantUser.userId,
        organizationId: tenantUser.organizationId,
        targetOrganizationId: tenantUser.organizationId,
        action,
        entity: entity ?? null,
        entityId: entityId ?? null,
        metadata: (Object.keys(metadata).length ? metadata : null) as any,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[auth-service] auditLog write failed:", err);
  }
}
