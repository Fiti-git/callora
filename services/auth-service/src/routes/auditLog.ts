/**
 * Tenant-side audit-log viewer. Strictly org-scoped via the
 * `targetOrganizationId` column populated by writeAuditLog.
 *
 * Lives in auth-service because this is an account-level read with no
 * dependency on any single domain service. The endpoint never falls back
 * to filtering on `organizationId` — that column also holds platform-side
 * context for some platform actions and would risk leaking cross-org rows.
 *
 * Ported from backend/src/routes/auditLog.ts.
 */
import express, { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@callora/shared";
import { requireAuth, AuthRequest } from "../middleware/requireAuth.js";

const router = express.Router();
router.use(requireAuth);

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  entity: z.string().max(50).optional(),
  action: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().cuid().optional(),
});

router.get("/", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid query", issues: parsed.error.issues });
  }
  const { from, to, entity, action, limit = 50, cursor } = parsed.data;

  const logs = await prisma.auditLog.findMany({
    where: {
      targetOrganizationId: organizationId,
      ...(entity ? { entity } : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      actorType: true,
      actorId: true,
      action: true,
      entity: true,
      entityId: true,
      metadata: true,
      createdAt: true,
    },
  });

  const hasMore = logs.length > limit;
  const items = hasMore ? logs.slice(0, limit) : logs;

  res.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
});

export default router;
