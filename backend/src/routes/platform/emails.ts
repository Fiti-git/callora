import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../../lib/prisma.js";
import { authenticatePlatform } from "../../middleware/platformAuth.js";

const router = express.Router();
router.use(authenticatePlatform);

const querySchema = z.object({
  organizationId: z.string().min(1).optional(),
  recipient: z.string().min(1).optional(),
  status: z.enum(["SENT", "FAILED"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().min(1).optional(),
});

/**
 * GET /api/platform/emails
 *
 * Paginated, filterable EmailLog reader. Default page size 50, max 500.
 * Cursor pagination by EmailLog.id (cuid is monotonic-ish but we order by
 * createdAt desc + id desc as a tie-break).
 */
router.get("/", async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", issues: parsed.error.issues });
  }
  const { organizationId, recipient, status, limit = 50, cursor } = parsed.data;

  const where: any = {
    ...(organizationId ? { organizationId } : {}),
    ...(recipient ? { recipient: { contains: recipient, mode: "insensitive" } } : {}),
    ...(status ? { status } : {}),
  };

  const items = await prisma.emailLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;

  res.json({
    items: trimmed,
    nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
  });
});

export default router;
