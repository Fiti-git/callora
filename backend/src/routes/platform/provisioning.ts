/**
 * Phase 5 Agent M4 — platform-side retry endpoint for hosted-tier
 * provisioning. PlatformAuth-only.
 *
 * POST /api/platform/organizations/:orgId/provisioning/retry
 *
 *   - 404 if no TenantProvisioning row exists for the org.
 *   - 409 if the row is already READY (nothing to retry).
 *   - 200 + { jobId } if the row is FAILED/PENDING/PROVISIONING and we
 *     successfully re-enqueue using the stored defaultPaymentMethodId.
 *
 * Audit log row (`PROVISIONING_RETRIED`) is written on every successful
 * re-enqueue.
 */

import express, { Request, Response } from "express";
import prisma from "../../lib/prisma.js";
import { authenticatePlatform } from "../../middleware/platformAuth.js";
import { writeAuditLog } from "../../lib/audit.js";
import { enqueueProvisioning } from "../../services/provisioning/index.js";

const router = express.Router({ mergeParams: true });

router.use(authenticatePlatform);

router.post(
  "/:orgId/provisioning/retry",
  async (req: Request, res: Response) => {
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
    if (!provisioning.defaultPaymentMethodId) {
      return res.status(400).json({
        error:
          "No payment method on file for this organization — cannot retry",
      });
    }

    const { jobId } = await enqueueProvisioning(
      orgId,
      provisioning.defaultPaymentMethodId
    );

    await writeAuditLog(req, "PROVISIONING_RETRIED", "Organization", orgId, {
      previousStatus: provisioning.status,
      jobId,
    });

    return res.status(200).json({ jobId, status: "ENQUEUED" });
  }
);

export default router;
