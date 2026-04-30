import express, { Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "@callora/shared";
import { requireEnv } from "../lib/env.js";
import { callQueue } from "../lib/queue.js";

const router = express.Router();

const WEBHOOK_SECRET = requireEnv("VAPI_WEBHOOK_SECRET");

function verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");
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

/**
 * POST /api/vapi/webhook
 * Public endpoint — Vapi calls this from outside the cluster.
 * Verifies HMAC-SHA256 signature against raw body. Idempotent via
 * CallLog.vapiCallId @unique upsert.
 */
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
    if (!callId) return res.status(200).json({ ok: true, ignored: true });

    try {
      const existing = await prisma.callLog.findUnique({
        where: { vapiCallId: callId },
      });
      if (!existing) return res.status(200).json({ ok: true, unknown: true });

      const isEnd =
        event?.type === "end-of-call-report" ||
        event?.call?.status === "ended";
      if (!isEnd) return res.status(200).json({ ok: true, ignored: true });

      const reason = event?.endedReason || event?.call?.endedReason;
      let status = "COMPLETED";
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
      const duration =
        event?.durationSeconds || event?.call?.durationSeconds || existing.duration;

      await prisma.callLog.upsert({
        where: { vapiCallId: callId },
        update: {
          status,
          duration,
          transcript: transcript ?? existing.transcript,
          summary: summary ?? existing.summary,
          cost: event?.cost ?? existing.cost,
          costBreakdown: event?.costBreakdown ?? (existing as any).costBreakdown,
        },
        create: {
          vapiCallId: callId,
          leadId: existing.leadId,
          status,
          duration: duration || 0,
          transcript,
          summary,
          cost: event?.cost ?? null,
          costBreakdown: event?.costBreakdown ?? undefined,
        },
      });

      // Enqueue follow-up work (Gemini qualification, lead status flip,
      // qualified-lead email). campaign-service consumes "callCompleted" jobs
      // off the shared "campaign-calls" BullMQ queue.
      await callQueue
        .add(
          "callCompleted",
          { vapiCallId: callId, callLogId: existing.id, leadId: existing.leadId },
          { jobId: `callCompleted:${callId}` }
        )
        .catch((err) => {
          console.error(
            `[calling-service] failed to enqueue callCompleted for ${callId}:`,
            err
          );
        });

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[Vapi webhook] error:", err?.message);
      res.status(500).json({ error: "webhook processing failed" });
    }
  }
);

export default router;
