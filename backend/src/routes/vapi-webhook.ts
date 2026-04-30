import express, { Request, Response } from "express";
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { Sentry, sentryEnabled } from "../lib/sentry.js";
import { requireEnv } from "../lib/env.js";
import { callQueue } from "../lib/queue.js";

/**
 * Vapi webhook router. Mount BEFORE express.json() so we have raw body for
 * HMAC signature verification.
 *
 * - Verifies x-vapi-signature using HMAC-SHA256 of the raw body keyed with
 *   VAPI_WEBHOOK_SECRET. Rejects with 401 on missing/invalid signatures.
 * - Idempotent: uses CallLog.vapiCallId @unique with prisma.upsert so retried
 *   webhook deliveries do not create duplicate rows.
 * - Enqueues a callCompleted job when the call ends so qualified-lead emails
 *   and any other follow-up work happen out-of-band.
 */

const WEBHOOK_SECRET = requireEnv("VAPI_WEBHOOK_SECRET");

const router = express.Router();

function verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  // signatureHeader may be "sha256=<hex>" or just "<hex>" — accept both.
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

router.post(
  "/webhook",
  express.raw({ type: "*/*" }),
  async (req: Request, res: Response) => {
    const rawBody = req.body as Buffer;
    const signature = req.headers["x-vapi-signature"] as string | undefined;

    if (!verifySignature(rawBody, signature)) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    let event: any;
    try {
      const parsed = JSON.parse(rawBody.toString("utf8"));
      event = parsed?.message ?? parsed;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const callId: string | undefined = event?.call?.id || event?.callId;
    if (!callId) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    try {
      const type = event?.type;
      const isEnd =
        type === "end-of-call-report" || event?.call?.status === "ended";

      if (!isEnd) {
        return res.status(200).json({ ok: true, ignored: true });
      }

      const reason = event?.endedReason || event?.call?.endedReason;
      let status: string = "COMPLETED";
      if (reason === "customer-did-not-answer" || reason === "ring-timeout") {
        status = "NO_ANSWER";
      } else if (reason === "voicemail") {
        status = "VOICEMAIL";
      }

      const transcriptRaw = event?.transcript || event?.artifact?.transcript;
      const transcript = transcriptRaw
        ? typeof transcriptRaw === "string"
          ? transcriptRaw
          : JSON.stringify(transcriptRaw)
        : null;
      const summary = event?.analysis?.summary || event?.summary || null;
      const duration: number =
        event?.durationSeconds || event?.call?.durationSeconds || 0;

      // Find the existing CallLog by vapiCallId so we can preserve leadId/org.
      const existing = await prisma.callLog.findUnique({
        where: { vapiCallId: callId },
      });

      if (!existing) {
        // Unknown call — accept silently to avoid Vapi retry storms.
        logger.warn({ vapiCallId: callId }, "vapi webhook for unknown call");
        return res.status(200).json({ ok: true, unknown: true });
      }

      // Idempotent upsert keyed on the unique vapiCallId.
      await prisma.callLog.upsert({
        where: { vapiCallId: callId },
        update: {
          status,
          duration: duration || existing.duration,
          transcript: transcript ?? existing.transcript,
          summary: summary ?? existing.summary,
          cost: event?.cost ?? existing.cost,
          costBreakdown: event?.costBreakdown ?? (existing as any).costBreakdown,
        },
        create: {
          vapiCallId: callId,
          leadId: existing.leadId,
          status,
          duration,
          transcript,
          summary,
          cost: event?.cost ?? null,
          costBreakdown: event?.costBreakdown ?? undefined,
        },
      });

      // Enqueue follow-up work (qualified-lead detection, summarization, email).
      // The campaign worker no longer waits for call completion inline.
      await callQueue
        .add(
          "callCompleted",
          { vapiCallId: callId, callLogId: existing.id, leadId: existing.leadId },
          { jobId: `callCompleted:${callId}` }
        )
        .catch((err) => {
          logger.error({ err, vapiCallId: callId }, "failed to enqueue callCompleted");
        });

      res.json({ ok: true });
    } catch (err: any) {
      logger.error({ err, vapiCallId: callId }, "vapi webhook handler error");
      if (sentryEnabled) Sentry.captureException(err);
      res.status(500).json({ error: "webhook processing failed" });
    }
  }
);

export default router;
