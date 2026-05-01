/**
 * TCPA + CAN-SPAM compliance routes — ported from backend/src/routes/compliance.ts.
 *
 *   POST   /api/compliance/dnc                  add a phone to tenant DNC
 *   DELETE /api/compliance/dnc/:id              remove a tenant DNC entry
 *   GET    /api/compliance/dnc                  paginated list (masked)
 *   POST   /api/compliance/dnc/import           CSV bulk-import (10k cap)
 *
 *   GET    /api/compliance/suppressions         paginated suppressions
 *   DELETE /api/compliance/suppressions/:id     remove MANUAL suppressions only
 */
import express, { Request, Response } from "express";
import multer from "multer";
import { parse as parseCsv } from "fast-csv";
import { Readable } from "node:stream";
import { z } from "zod";
import { prisma } from "@callora/shared";
import { authenticate, AuthRequest } from "../middleware/requireAuth.js";
import { validateBody } from "../lib/validate.js";
import { writeAuditLog } from "../lib/audit.js";
import { hashPhone, normalizeE164, maskPhone } from "../lib/phone.js";

const router = express.Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// DNC: single-add / remove / list
// ---------------------------------------------------------------------------
const addDncSchema = z.object({
  phone: z.string().min(7).max(40),
  reason: z.string().max(500).optional(),
});

router.post("/dnc", validateBody(addDncSchema), async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const { phone, reason } = req.body as { phone: string; reason?: string };
  try {
    const e164 = normalizeE164(phone);
    if (!e164) return res.status(400).json({ error: "Invalid phone" });
    const phoneHash = hashPhone(e164);
    const row = await prisma.dNCEntry.upsert({
      where: { phoneHash_organizationId: { phoneHash, organizationId } },
      update: { reason: reason ?? null, source: "TENANT_UPLOAD" },
      create: { phoneHash, organizationId, source: "TENANT_UPLOAD", reason: reason ?? null },
    });
    await writeAuditLog(req, "DNC_ADDED", "DNCEntry", row.id, { reason: reason ?? null });
    res.status(201).json({ id: row.id, phoneMasked: maskPhone(e164), reason: row.reason, createdAt: row.createdAt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/dnc/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const row = await prisma.dNCEntry.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!row) return res.status(404).json({ error: "DNC entry not found" });
    await prisma.dNCEntry.delete({ where: { id: row.id } });
    await writeAuditLog(req, "DNC_REMOVED", "DNCEntry", row.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dnc", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const cursor = (req.query.cursor as string | undefined) || undefined;
  try {
    const rows = await prisma.dNCEntry.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r: any) => ({
      id: r.id,
      source: r.source,
      reason: r.reason,
      createdAt: r.createdAt,
    }));
    const nextCursor = hasMore ? rows[limit - 1].id : null;
    res.json({ items, nextCursor });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// DNC: CSV import
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okMime =
      file.mimetype === "text/csv" ||
      file.mimetype === "text/plain" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype === "application/octet-stream";
    const okName = /\.csv$/i.test(file.originalname || "");
    if (!okMime || !okName) {
      (_req as any)._csvRejectReason = !okName ? "BAD_FILENAME" : "BAD_MIME";
      (cb as any)(null, false);
      return;
    }
    cb(null, true);
  },
});

const MAX_DNC_ROWS = 10_000;

router.post(
  "/dnc/import",
  (req, res, next) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "FILE_TOO_LARGE", limit: 10 * 1024 * 1024 });
        }
        return res.status(400).json({ error: err.message || "Upload failed" });
      }
      if ((req as any)._csvRejectReason) {
        return res.status(400).json({ error: (req as any)._csvRejectReason });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const { organizationId } = (req as AuthRequest).user!;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "Missing file" });

    const rows: { phoneHash: string; organizationId: string; source: string; reason: string | null }[] = [];
    let rowCount = 0;
    let skipped = 0;

    try {
      await new Promise<void>((resolve, reject) => {
        Readable.from(file.buffer)
          .pipe(parseCsv({ headers: true, ignoreEmpty: true, trim: true }))
          .on("error", reject)
          .on("data", (row: any) => {
            if (rowCount >= MAX_DNC_ROWS) return;
            rowCount++;
            const raw = (row.phone || row.number || "").toString();
            const e164 = normalizeE164(raw);
            if (!e164) {
              skipped++;
              return;
            }
            rows.push({
              phoneHash: hashPhone(e164),
              organizationId,
              source: "TENANT_UPLOAD",
              reason: (row.reason || null) as string | null,
            });
          })
          .on("end", () => resolve());
      });

      // Bulk insert — skipDuplicates relies on the (phoneHash,orgId) unique idx.
      let imported = 0;
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const result = await prisma.dNCEntry.createMany({ data: slice, skipDuplicates: true });
        imported += result.count;
      }

      await writeAuditLog(req, "DNC_BULK_IMPORT", "DNCEntry", null, {
        imported, skipped, total: rowCount,
      });
      res.json({ imported, skipped, total: rowCount, capped: rowCount >= MAX_DNC_ROWS });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------------------------------------
// Email suppressions
// ---------------------------------------------------------------------------
router.get("/suppressions", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const cursor = (req.query.cursor as string | undefined) || undefined;
  try {
    const rows = await prisma.emailSuppression.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r: any) => ({
      id: r.id,
      // Mask email for COMPLAINED rows (privacy — spam complaints often
      // contain the original recipient identity).
      email: r.reason === "COMPLAINED" ? maskEmail(r.email) : r.email,
      reason: r.reason,
      source: r.source,
      organizationScope: r.organizationId ? "TENANT" : "PLATFORM",
      createdAt: r.createdAt,
    }));
    const nextCursor = hasMore ? rows[limit - 1].id : null;
    res.json({ items, nextCursor });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/suppressions/:id", async (req: Request, res: Response) => {
  const { organizationId } = (req as AuthRequest).user!;
  try {
    const row = await prisma.emailSuppression.findFirst({
      where: { id: req.params.id, organizationId },
    });
    if (!row) return res.status(404).json({ error: "Suppression not found" });
    if (row.reason !== "MANUAL") {
      return res.status(409).json({
        error: "policy_locked",
        message: "Only MANUAL suppressions may be removed; BOUNCED/COMPLAINED rows are policy-locked.",
        reason: row.reason,
      });
    }
    await prisma.emailSuppression.delete({ where: { id: row.id } });
    await writeAuditLog(req, "SUPPRESSION_REMOVED", "EmailSuppression", row.id, { reason: row.reason });
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const maskedUser = user.length <= 2 ? "*".repeat(user.length) : user[0] + "***" + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

export default router;
