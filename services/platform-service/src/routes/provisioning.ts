import express, { Request, Response } from "express";
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

/**
 * POST /api/platform/provisioning/:orgId/retry
 *
 *   - 404 if no TenantProvisioning row exists for the org.
 *   - 409 if the row is already READY.
 *   - 200 + { jobId } when we successfully re-enqueue.
 *
 * Re-enqueue is delegated to calling-service /internal/numbers/provision
 * (which is idempotent on the orgId).
 */
router.post("/:orgId/retry", async (req: Request, res: Response) => {
  const platformUser = (req as PlatformAuthRequest).platformUser!;
  const { orgId } = req.params;

  const provisioning = await prisma.tenantProvisioning.findUnique({
    where: { organizationId: orgId },
  });
  if (!provisioning) {
    return res
      .status(404)
      .json({ error: "No provisioning record for this organization" });
  }
  if (provisioning.status === "READY") {
    return res
      .status(409)
      .json({ error: "Tenant is already provisioned (READY)" });
  }

  let upstream: { ok: boolean; status: number; body: any };
  try {
    const r = await fetch(
      `${CALLING_SERVICE_URL}/internal/numbers/provision`,
      {
        method: "POST",
        headers: internalHeaders(),
        body: JSON.stringify({ orgId }),
      }
    );
    upstream = { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
  } catch (err: any) {
    return res.status(502).json({
      error: err?.message ?? "calling-service unreachable",
    });
  }

  if (!upstream.ok) {
    return res.status(upstream.status).json(upstream.body);
  }

  await writeAudit({
    actorType: "PLATFORM",
    actorId: platformUser.id,
    organizationId: orgId,
    action: "PROVISIONING_RETRIED",
    target: orgId,
    metadata: {
      previousStatus: provisioning.status,
      jobId: upstream.body?.jobId ?? null,
    },
  });

  return res.status(200).json({
    jobId: upstream.body?.jobId ?? null,
    status: "ENQUEUED",
  });
});

export default router;
