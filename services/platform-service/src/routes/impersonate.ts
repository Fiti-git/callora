import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@callora/shared";
import {
  authenticatePlatform,
  PlatformAuthRequest,
  requireSuperAdmin,
} from "../middleware/platformAuth.js";
import { writeAudit } from "../lib/audit.js";

const router = express.Router();

router.use(authenticatePlatform);
router.use(requireSuperAdmin);

const TENANT_SECRET = process.env.NEXTAUTH_SECRET;

/**
 * POST /api/platform/impersonate/:orgId
 *
 * Issues a short-lived (15-minute) tenant JWT scoped to an admin user inside
 * the target organisation. Adds an `impersonatedBy` claim so abuse can be
 * traced. Falls back to the oldest non-admin user if the org has no ADMIN.
 * AuditLog is always written. SUPER-ADMIN ONLY.
 */
router.post("/:orgId", async (req: Request, res: Response) => {
  if (!TENANT_SECRET) {
    return res
      .status(500)
      .json({ error: "Server misconfigured: NEXTAUTH_SECRET missing" });
  }

  const platformUser = (req as PlatformAuthRequest).platformUser!;
  const { orgId } = req.params;

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return res.status(404).json({ error: "Organization not found" });

  let user = await prisma.user.findFirst({
    where: { organizationId: orgId, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      tokenVersion: true,
    },
  });
  if (!user) {
    user = await prisma.user.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        tokenVersion: true,
      },
    });
  }
  if (!user) return res.status(404).json({ error: "No users in organisation" });

  const expiresInSec = 15 * 60;
  const expiresAt = new Date(Date.now() + expiresInSec * 1000);
  const accessToken = jwt.sign(
    {
      userId: user.id,
      organizationId: orgId,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
      impersonatedBy: platformUser.id,
    },
    TENANT_SECRET,
    { expiresIn: expiresInSec }
  );

  await writeAudit({
    actorType: "PLATFORM",
    actorId: platformUser.id,
    organizationId: orgId,
    action: "IMPERSONATE",
    target: orgId,
    metadata: {
      userId: user.id,
      email: user.email,
      expiresAt: expiresAt.toISOString(),
    },
  });

  res.json({
    accessToken,
    expiresAt: expiresAt.toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    organization: { id: org.id, name: org.name },
  });
});

export default router;
