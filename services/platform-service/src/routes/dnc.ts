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

// GET /api/platform/dnc?source=&q=
router.get("/", async (req: Request, res: Response) => {
  const source = typeof req.query.source === "string" ? req.query.source : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;

  const rows = await prisma.dncEntry.findMany({
    where: {
      ...(source ? { source } : {}),
      ...(q ? { phoneE164: { contains: q } } : {}),
    },
    orderBy: { addedAt: "desc" },
    take: 500,
  });
  res.json(rows);
});

// POST /api/platform/dnc { phoneE164, source, expiresAt? }
const addSchema = z.object({
  phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/, "Invalid E.164 phone"),
  source: z.string().min(1).max(64),
  expiresAt: z.string().datetime().optional(),
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  try {
    const entry = await prisma.dncEntry.create({
      data: {
        phoneE164: parsed.data.phoneE164,
        source: parsed.data.source,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      },
    });
    const actor = (req as PlatformAuthRequest).platformUser!;
    await writeAudit({
      actorType: "PLATFORM",
      actorId: actor.id,
      action: "dnc_added",
      target: entry.phoneE164,
      metadata: { source: entry.source },
    });
    res.status(201).json(entry);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Phone already in DNC" });
    }
    console.error("[dnc POST] error:", err?.message);
    res.status(500).json({ error: "Failed to add DNC entry" });
  }
});

// DELETE /api/platform/dnc/:phone (URL-encoded E.164)
router.delete("/:phone", async (req: Request, res: Response) => {
  const phone = decodeURIComponent(req.params.phone);
  try {
    await prisma.dncEntry.delete({ where: { phoneE164: phone } });
    const actor = (req as PlatformAuthRequest).platformUser!;
    await writeAudit({
      actorType: "PLATFORM",
      actorId: actor.id,
      action: "dnc_removed",
      target: phone,
    });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Not found" });
    }
    console.error("[dnc DELETE] error:", err?.message);
    res.status(500).json({ error: "Failed to remove DNC entry" });
  }
});

export default router;
