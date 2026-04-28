import express, { Request, Response } from "express";
import { prisma } from "@callora/shared";

const router = express.Router();

/**
 * POST /api/vapi/webhook
 * Public endpoint — Vapi calls this from outside the cluster.
 * No auth middleware. Optionally verify a shared signature header.
 */
router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
    if (expectedSecret) {
      const provided =
        (req.headers["x-vapi-signature"] as string | undefined) ||
        (req.headers["x-vapi-secret"] as string | undefined);
      if (provided !== expectedSecret) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }

    const event = req.body?.message || req.body;
    const type = event?.type;
    const callId = event?.call?.id || event?.callId;

    if (!callId) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Locate CallLog by vapiCallId; ignore if not ours
    const log = await prisma.callLog.findFirst({ where: { vapiCallId: callId } });
    if (!log) {
      return res.status(200).json({ ok: true, unknown: true });
    }

    if (type === "end-of-call-report" || event?.call?.status === "ended") {
      const reason = event?.endedReason || event?.call?.endedReason;
      let status = "COMPLETED";
      if (reason === "customer-did-not-answer" || reason === "ring-timeout") {
        status = "NO_ANSWER";
      } else if (reason === "voicemail") {
        status = "VOICEMAIL";
      }

      const transcript = event?.transcript || event?.artifact?.transcript;
      const summary = event?.analysis?.summary || event?.summary;

      await prisma.callLog.update({
        where: { id: log.id },
        data: {
          status,
          duration: event?.durationSeconds || event?.call?.durationSeconds || log.duration,
          transcript: transcript
            ? typeof transcript === "string"
              ? transcript
              : JSON.stringify(transcript)
            : log.transcript,
          summary: summary ?? log.summary,
          cost: event?.cost ?? log.cost,
          costBreakdown: event?.costBreakdown ?? (log as any).costBreakdown,
        },
      });
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[Vapi webhook] error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
