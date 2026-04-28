import { prisma } from "@callora/shared";

type ActorType = "PLATFORM" | "TENANT" | "SYSTEM";

export async function writeAudit(params: {
  actorType: ActorType;
  actorId: string;
  organizationId?: string | null;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId,
        organizationId: params.organizationId ?? null,
        action: params.action,
        target: params.target,
        metadata: params.metadata as any,
      },
    });
  } catch (err) {
    console.error("auditLog write failed:", err);
  }
}
