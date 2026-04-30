/**
 * Public API v1 (Phase 3 Agent 12).
 *
 * Read-only paginated endpoints for external developers / integrations:
 *   GET /api/v1/contacts
 *   GET /api/v1/leads
 *   GET /api/v1/deals
 *
 * Auth: Bearer <publicApiKey>  OR  Bearer <tenant JWT> — apiKeyAuth +
 * fall-through to authenticate. Either path resolves req.user.organizationId
 * and meters one API_CALL against the org's plan quota.
 */
import express, { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { requireApiOrJwt } from "../middleware/apiKeyAuth.js";

const router = express.Router();

router.use(requireApiOrJwt(authenticate));

function parsePagination(req: Request) {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const cursor = req.query.cursor ? String(req.query.cursor) : null;
  return { limit, cursor };
}

router.get("/contacts", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { limit, cursor } = parsePagination(req);
  const rows = await prisma.contact.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      businessName: true,
      phone: true,
      email: true,
      address: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const hasMore = rows.length > limit;
  res.json({
    items: rows.slice(0, limit),
    nextCursor: hasMore ? rows[limit - 1]?.id ?? null : null,
  });
});

router.get("/leads", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { limit, cursor } = parsePagination(req);
  const rows = await prisma.lead.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      businessName: true,
      phone: true,
      address: true,
      status: true,
      interestScore: true,
      campaignId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const hasMore = rows.length > limit;
  res.json({
    items: rows.slice(0, limit),
    nextCursor: hasMore ? rows[limit - 1]?.id ?? null : null,
  });
});

router.get("/deals", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { limit, cursor } = parsePagination(req);
  const rows = await prisma.deal.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      stage: true,
      value: true,
      probability: true,
      contactId: true,
      closeDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const hasMore = rows.length > limit;
  res.json({
    items: rows.slice(0, limit),
    nextCursor: hasMore ? rows[limit - 1]?.id ?? null : null,
  });
});

export default router;
