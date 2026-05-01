import express, { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@callora/shared";
import { authenticatePlatform } from "../middleware/platformAuth.js";

const router = express.Router();
router.use(authenticatePlatform);

const querySchema = z.object({
  organizationId: z.string().min(1).optional(),
  actorType: z.string().min(1).max(64).optional(),
  action: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).optional(),
});

/**
 * GET /api/platform/audit
 * Read-only paginated AuditLog reader with cursor pagination.
 */
router.get("/", async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid query", issues: parsed.error.issues });
  }
  const { organizationId, actorType, action, limit = 50, cursor } = parsed.data;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      ...(actorType ? { actorType } : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = logs.length > limit;
  const items = hasMore ? logs.slice(0, limit) : logs;

  res.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
});

export default router;
