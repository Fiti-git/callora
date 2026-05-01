/**
 * Email compliance routes — ported from backend/src/routes/email.ts.
 *
 *   GET  /api/email/unsubscribe?t=<jwt>       browser one-click → redirect
 *   POST /api/email/unsubscribe?t=<jwt>       Gmail one-click → 204
 *
 * The JWT is signed with NEXTAUTH_SECRET and carries the unsubscribe payload.
 * No bearer auth — the JWT IS the auth.
 */
import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@callora/shared";

const router = express.Router();

const TENANT_ORIGIN = process.env.TENANT_APP_ORIGIN || "http://localhost:3000";

interface UnsubPayload {
  emailLogId?: string;
  orgId?: string | null;
  recipient: string;
  campaignId?: string;
  sendId?: string;
}

function verifyToken(token: string): UnsubPayload | null {
  try {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) return null;
    const decoded = jwt.verify(token, secret) as UnsubPayload;
    if (!decoded.recipient) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function applyUnsubscribe(payload: UnsubPayload): Promise<void> {
  const email = payload.recipient.toLowerCase();
  const orgId = payload.orgId ?? null;
  await prisma.emailSuppression.upsert({
    where: { email_organizationId: { email, organizationId: orgId as string } },
    update: { reason: "UNSUBSCRIBED", source: "ONE_CLICK" },
    create: {
      email,
      organizationId: orgId,
      reason: "UNSUBSCRIBED",
      source: "ONE_CLICK",
    },
  });
  if (payload.emailLogId) {
    await prisma.emailLog
      .update({ where: { id: payload.emailLogId }, data: { status: "UNSUBSCRIBED" } })
      .catch(() => {});
  }
  if (payload.sendId) {
    try {
      const send = await prisma.emailSend.findUnique({ where: { id: payload.sendId } });
      if (send && !send.unsubscribedAt) {
        await prisma.emailSend.update({
          where: { id: send.id },
          data: { unsubscribedAt: new Date(), status: "UNSUBSCRIBED" },
        });
        await prisma.emailCampaign
          .update({
            where: { id: send.campaignId },
            data: { totalUnsubscribed: { increment: 1 } },
          })
          .catch(() => {});
      }
    } catch {
      /* swallow — unsub must always succeed */
    }
  } else if (payload.campaignId) {
    await prisma.emailCampaign
      .update({
        where: { id: payload.campaignId },
        data: { totalUnsubscribed: { increment: 1 } },
      })
      .catch(() => {});
  }
}

router.get("/unsubscribe", async (req: Request, res: Response) => {
  const token = (req.query.t as string | undefined) || "";
  const payload = verifyToken(token);
  if (!payload) {
    return res.redirect(`${TENANT_ORIGIN}/unsubscribe/error`);
  }
  try {
    await applyUnsubscribe(payload);
    return res.redirect(`${TENANT_ORIGIN}/unsubscribe/success`);
  } catch {
    return res.redirect(`${TENANT_ORIGIN}/unsubscribe/error`);
  }
});

router.post("/unsubscribe", async (req: Request, res: Response) => {
  const token = (req.query.t as string | undefined) || "";
  const payload = verifyToken(token);
  if (!payload) return res.status(400).json({ error: "invalid_token" });
  try {
    await applyUnsubscribe(payload);
    return res.status(204).end();
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
