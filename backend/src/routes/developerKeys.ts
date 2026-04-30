/**
 * Public API key management for tenants (Phase 3 Agent 12).
 *
 *   GET    /api/developer/api-keys         — list (no raw key, masked prefix)
 *   POST   /api/developer/api-keys         — create, returns raw key ONCE
 *   DELETE /api/developer/api-keys/:id     — soft-revoke (sets revokedAt)
 *
 * The legacy `ApiKey` model is for tenant-supplied 3rd-party credentials
 * (Google Maps / Gemini / Vapi). These routes manage `PublicApiKey` rows
 * — bearer tokens external developers / Zapier use to hit /api/v1/*.
 */
import express, { Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth.js";
import { validateBody } from "../lib/validate.js";
import { writeAuditLog } from "../lib/audit.js";
import { generateApiKey } from "../middleware/apiKeyAuth.js";

const router = express.Router();
router.use(authenticate);

const ALLOWED_SCOPES = ["read", "write", "webhook"] as const;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(ALLOWED_SCOPES)).min(1).optional(),
});

router.post(
  "/api-keys",
  requireRole("ADMIN"),
  validateBody(createSchema),
  async (req: Request, res: Response) => {
    const { organizationId, userId } = (req as AuthRequest).user!;
    const { name, scopes } = req.body as { name: string; scopes?: string[] };
    const { raw, hash, prefix } = generateApiKey();
    const row = await prisma.publicApiKey.create({
      data: {
        organizationId,
        name,
        keyHash: hash,
        prefix,
        scopes: scopes ?? ["read"],
        createdById: userId,
      },
    });
    await writeAuditLog(req, "API_KEY_CREATE", "PublicApiKey", row.id, {
      name,
      scopes: row.scopes,
    });
    // Returns raw key ONCE.
    res.status(201).json({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes,
      key: raw,
      createdAt: row.createdAt,
    });
  }
);

router.get("/api-keys", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const rows = await prisma.publicApiKey.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      createdAt: true,
      revokedAt: true,
    },
  });
  res.json(
    rows.map((r) => ({
      ...r,
      // Mask: show prefix + ellipsis. Raw key is never re-derivable.
      maskedKey: `${r.prefix}…`,
    }))
  );
});

router.delete(
  "/api-keys/:id",
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const result = await prisma.publicApiKey.updateMany({
      where: { id: req.params.id, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) return res.status(404).json({ error: "not_found" });
    await writeAuditLog(req, "API_KEY_REVOKE", "PublicApiKey", req.params.id);
    res.status(204).end();
  }
);

export default router;
