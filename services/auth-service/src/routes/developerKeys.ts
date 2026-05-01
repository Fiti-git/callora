/**
 * Tenant-facing CRUD for public API keys (Wave 5 Agent 5C —
 * ported from monolith `backend/src/routes/developerKeys.ts`).
 *
 *   GET    /api/developer/keys         — list (no raw key, masked prefix)
 *   POST   /api/developer/keys         — create, returns raw key ONCE
 *   DELETE /api/developer/keys/:id     — soft-revoke (sets revokedAt)
 *
 * The `ApiKey` model on Organization is for tenant-supplied 3rd-party
 * credentials (Google Maps / Gemini / Vapi). These routes manage the
 * `PublicApiKey` table — bearer tokens external integrations use to hit
 * lead-service `/api/v1/*`.
 */
import express, { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { z, type ZodSchema } from "zod";
import { prisma } from "@callora/shared";
import {
  requireAuth,
  AuthRequest,
} from "../middleware/requireAuth.js";

const router = express.Router();

router.use(requireAuth);

// --- Local helpers ---------------------------------------------------------
// Inlined to avoid pulling in monolith-only `lib/validate.ts` and
// `lib/audit.ts` (they don't exist in the auth-service tree). Behaviour
// mirrors the monolith versions exactly.
function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      return res.status(400).json({
        error: "Invalid request body",
        field: issue.path.join("."),
        message: issue.message,
      });
    }
    req.body = result.data;
    next();
  };
}

async function writeAudit(params: {
  actorType: "TENANT_USER" | "PLATFORM_USER" | "SYSTEM";
  actorId: string;
  organizationId: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId,
        organizationId: params.organizationId,
        action: params.action,
        target: params.target,
        metadata: (params.metadata ?? null) as any,
      },
    });
  } catch (err) {
    // Audit failure must never break the user request.
    // eslint-disable-next-line no-console
    console.error("[developerKeys] audit write failed:", err);
  }
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = (req as AuthRequest).user;
    if (!u || !roles.includes(u.role)) {
      return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
    }
    next();
  };
}

// --- API key crypto (mirrors lead-service/src/middleware/apiKeyAuth) -------
const API_KEY_PREFIX = "cal_";

let _pepper: string | null = null;
function pepper(): string {
  if (_pepper === null) {
    const raw = process.env.DNC_HASH_PEPPER;
    if (!raw) {
      throw new Error("DNC_HASH_PEPPER env var is required to issue API keys");
    }
    _pepper = raw;
  }
  return _pepper;
}

function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey + pepper()).digest("hex");
}

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const body = crypto.randomBytes(32).toString("hex");
  const raw = `${API_KEY_PREFIX}${body}`;
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 12) };
}

// --- Routes ----------------------------------------------------------------
const ALLOWED_SCOPES = ["read", "write", "webhook"] as const;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(ALLOWED_SCOPES)).min(1).optional(),
});

router.post(
  "/keys",
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
    await writeAudit({
      actorType: "TENANT_USER",
      actorId: userId,
      organizationId,
      action: "API_KEY_CREATE",
      target: row.id,
      metadata: { name, scopes: row.scopes },
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

router.get("/keys", async (req: Request, res: Response) => {
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
    rows.map((r: typeof rows[number]) => ({
      ...r,
      // Mask: show prefix + ellipsis. Raw key is never re-derivable.
      maskedKey: `${r.prefix}…`,
    }))
  );
});

router.delete(
  "/keys/:id",
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const { organizationId, userId } = (req as AuthRequest).user!;
    const result = await prisma.publicApiKey.updateMany({
      where: { id: req.params.id, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) return res.status(404).json({ error: "not_found" });
    await writeAudit({
      actorType: "TENANT_USER",
      actorId: userId,
      organizationId,
      action: "API_KEY_REVOKE",
      target: req.params.id,
    });
    res.status(204).end();
  }
);

export default router;
