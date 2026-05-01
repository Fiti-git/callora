// Admin-managed platform secrets. Read/write encrypted PlatformSecret rows.
// Only keys in SECRET_CATALOG can be written. Values are returned MASKED on
// GET — never in clear. The PUT endpoint requires super-admin.

import express, { Request, Response } from "express";
import { z } from "zod";
import {
  prisma,
  encryptSecret,
  decryptSecret,
  maskSecret,
  clearSecretsCache,
} from "@callora/shared";
import {
  authenticatePlatform,
  requireSuperAdmin,
  PlatformAuthRequest,
} from "../middleware/platformAuth.js";
import { writeAudit } from "../lib/audit.js";
import { SECRET_CATALOG, isManagedSecret, getSecretMeta } from "../lib/secretCatalog.js";

const router = express.Router();
router.use(authenticatePlatform);

// GET /api/platform/secrets — list catalog with masked values + isSet flag.
router.get("/", async (_req: Request, res: Response) => {
  const rows = await prisma.platformSecret.findMany();
  const byKey = new Map<string, any>(rows.map((r: any) => [r.key, r]));

  const items = SECRET_CATALOG.map((meta) => {
    const row: any = byKey.get(meta.key);
    let preview: string | null = null;
    let isSet = false;
    if (row) {
      isSet = true;
      try {
        const value = decryptSecret(row.valueEncrypted);
        preview = meta.cleartext ? value : maskSecret(value);
      } catch {
        preview = "DECRYPT_ERROR";
      }
    }
    return {
      key: meta.key,
      group: meta.group,
      label: meta.label,
      description: meta.description,
      required: meta.required,
      cleartext: meta.cleartext ?? false,
      isSet,
      preview,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });

  res.json({ items });
});

// PUT /api/platform/secrets/:key { value }
const putSchema = z.object({ value: z.string().min(1).max(8192) });

router.put("/:key", requireSuperAdmin, async (req: Request, res: Response) => {
  const key = req.params.key;
  if (!isManagedSecret(key)) {
    return res.status(400).json({ error: `Key "${key}" is not a managed secret.` });
  }
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const meta = getSecretMeta(key)!;
  let valueEncrypted: string;
  try {
    valueEncrypted = encryptSecret(parsed.data.value);
  } catch (err: any) {
    return res.status(500).json({ error: `Encryption failed: ${err.message}` });
  }

  const actor = (req as PlatformAuthRequest).platformUser!;
  await prisma.platformSecret.upsert({
    where: { key },
    update: { valueEncrypted, updatedBy: actor.email },
    create: {
      key,
      valueEncrypted,
      updatedBy: actor.email,
      description: meta.description,
    },
  });

  // Invalidate the in-memory cache so the next read picks up the new value
  // within this process. Other bundles will pick it up on TTL expiry.
  clearSecretsCache();

  await writeAudit({
    actorType: "PLATFORM",
    actorId: actor.id,
    action: "secret_updated",
    target: key,
  });

  res.json({ ok: true, key });
});

// DELETE /api/platform/secrets/:key — unset.
router.delete("/:key", requireSuperAdmin, async (req: Request, res: Response) => {
  const key = req.params.key;
  if (!isManagedSecret(key)) {
    return res.status(400).json({ error: `Key "${key}" is not a managed secret.` });
  }
  try {
    await prisma.platformSecret.delete({ where: { key } });
  } catch (err: any) {
    if (err?.code !== "P2025") throw err;
  }
  clearSecretsCache();
  const actor = (req as PlatformAuthRequest).platformUser!;
  await writeAudit({
    actorType: "PLATFORM",
    actorId: actor.id,
    action: "secret_deleted",
    target: key,
  });
  res.json({ ok: true });
});

export default router;
