/**
 * Tenant-scoped audit-log writer for calling-service. Best-effort: never
 * throws — audit-log failures must not break the user's request.
 *
 * This is a local copy of the relevant subset of backend/src/lib/audit.ts —
 * calling-service only ever writes TENANT_USER rows so we don't need the
 * full platform-aware helper here.
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
    // Audit failures must not break the user's request.
    // eslint-disable-next-line no-console
    console.error("[calling-service] auditLog write failed:", err);
  }
}
