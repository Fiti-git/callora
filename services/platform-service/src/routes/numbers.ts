import express, { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@callora/shared";
import {
  authenticatePlatform,
  PlatformAuthRequest,
} from "../middleware/platformAuth.js";
import { writeAudit } from "../lib/audit.js";

const router = express.Router();
router.use(authenticatePlatform);

const CALLING_SERVICE_URL =
  process.env.CALLING_SERVICE_URL || "http://calling-service:4004";
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

function internalHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (INTERNAL_TOKEN) h["x-internal-token"] = INTERNAL_TOKEN;
  return h;
}

// GET /api/platform/numbers/pool — list POOL rows
router.get("/pool", async (_req: Request, res: Response) => {
  const rows = await prisma.orgVapiNumber.findMany({
    where: { status: "POOL" },
    orderBy: { provisionedAt: "desc" },
    select: {
      id: true,
      e164: true,
      areaCode: true,
      spamScore: true,
      lastRotatedAt: true,
      provisionedAt: true,
      status: true,
      vapiPhoneNumberId: true,
    },
  });
  res.json(rows);
});

// POST /api/platform/numbers/pool { areaCode? } — buy a new pool number
const addSchema = z.object({ areaCode: z.string().min(2).max(6).optional() });

router.post("/pool", async (req: Request, res: Response) => {
  const parsed = addSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  try {
    const upstream = await fetch(`${CALLING_SERVICE_URL}/internal/numbers/pool`, {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({ areaCode: parsed.data.areaCode }),
    });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json(body);
    }
    const actor = (req as PlatformAuthRequest).platformUser!;
    await writeAudit({
      actorType: "PLATFORM",
      actorId: actor.id,
      action: "pool_number_added",
      target: (body as any)?.id,
      metadata: { areaCode: parsed.data.areaCode ?? null },
    });
    return res.status(201).json(body);
  } catch (err: any) {
    console.error("[platform numbers/pool POST] error:", err?.message);
    return res.status(502).json({ error: "calling-service unreachable" });
  }
});

// POST /api/platform/numbers/pool/:id/rotate — queue rotate-one
router.post("/pool/:id/rotate", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const upstream = await fetch(
      `${CALLING_SERVICE_URL}/internal/numbers/pool/${encodeURIComponent(id)}/rotate`,
      { method: "POST", headers: internalHeaders() }
    );
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json(body);
    }
    const actor = (req as PlatformAuthRequest).platformUser!;
    await writeAudit({
      actorType: "PLATFORM",
      actorId: actor.id,
      action: "pool_number_rotate_queued",
      target: id,
    });
    return res.status(202).json(body);
  } catch (err: any) {
    console.error("[platform numbers/pool rotate] error:", err?.message);
    return res.status(502).json({ error: "calling-service unreachable" });
  }
});

export default router;
