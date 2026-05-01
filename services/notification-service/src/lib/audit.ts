import { prisma } from "@callora/shared";
import type { Request } from "express";
import type { AuthRequest } from "../middleware/requireAuth.js";

export type ActorType = "PLATFORM_USER" | "TENANT_USER" | "SYSTEM";

export async function writeAuditLog(
  req: Request,
  action: string,
  entity?: string | null,
  entityId?: string | null,
  diff?: Record<string, unknown>
): Promise<void> {
  const tenantUser = (req as AuthRequest).user;
  let actorType: ActorType = "SYSTEM";
  let actorId = "system";
  let organizationId: string | null = null;
  let targetOrganizationId: string | null = null;
  const metadata: Record<string, unknown> = {};

  if (tenantUser) {
    actorType = "TENANT_USER";
    actorId = tenantUser.userId;
    organizationId = tenantUser.organizationId;
    targetOrganizationId = tenantUser.organizationId;
  }

  if (diff && Object.keys(diff).length > 0) {
    metadata.diff = diff;
  }

  try {
    await prisma.auditLog.create({
      data: {
        actorType,
        actorId,
        organizationId,
        targetOrganizationId,
        action,
        entity: entity ?? null,
        entityId: entityId ?? null,
        metadata: (Object.keys(metadata).length ? metadata : null) as any,
      },
    });
  } catch (err) {
    // Audit must never break the user's request.
    console.error("[notification-service] auditLog write failed:", err);
  }
}
