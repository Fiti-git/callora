/**
 * Email Automation worker (Phase 3 Agent 10).
 *
 *   tick job → execute the run's current step:
 *     WAIT       → reschedule self with delay = days*24h, advance step
 *     SEND_EMAIL → send via lib/email.sendEmail (org-scoped meter), advance
 *     BRANCH     → evaluate condition against run.context, jump
 *
 * Per-recipient sends use sendEmail() which already handles suppression +
 * quota metering, so no additional meterAndCharge call here.
 */
import { Job } from "bullmq";
import prisma from "../lib/prisma.js";
import { sendEmail } from "../lib/email.js";
import { emailAutomationQueue } from "../lib/queue.js";
import { renderMergeTags, buildMergeContext } from "../lib/mergeTags.js";
import { logger } from "../lib/logger.js";

interface TickJobData {
  runId: string;
}

export async function emailAutomationTick(job: Job<TickJobData>): Promise<void> {
  const run = await prisma.emailAutomationRun.findUnique({
    where: { id: job.data.runId },
    include: { automation: true },
  });
  if (!run) return;
  if (run.status !== "RUNNING") return;

  const seq = (run.automation.sequence as any[]) ?? [];
  let step = run.currentStep;
  if (step >= seq.length) {
    await prisma.emailAutomationRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED" },
    });
    return;
  }

  const s = seq[step] as any;
  const ctx = (run.context ?? {}) as Record<string, unknown>;

  try {
    if (s.kind === "WAIT") {
      const next = step + 1;
      await prisma.emailAutomationRun.update({
        where: { id: run.id },
        data: { currentStep: next },
      });
      const delay = Math.max(0, Number(s.days) * 24 * 60 * 60 * 1000);
      await emailAutomationQueue.add(
        "tick",
        { runId: run.id },
        { jobId: `tick:${run.id}:${next}`, delay }
      );
      return;
    }

    if (s.kind === "SEND_EMAIL") {
      const tpl = await prisma.emailTemplate.findFirst({
        where: { id: s.templateId, organizationId: run.organizationId, deletedAt: null },
      });
      const recipient = (ctx as any).email as string | undefined;
      if (!tpl) {
        logger.warn({ runId: run.id, templateId: s.templateId }, "[email-automation] missing template");
      } else if (!recipient) {
        logger.warn({ runId: run.id }, "[email-automation] no recipient email in context");
      } else {
        const contact = run.contactId
          ? await prisma.contact.findFirst({ where: { id: run.contactId, organizationId: run.organizationId } })
          : null;
        const merge = buildMergeContext({ email: recipient, contact, extra: ctx });
        const subject = s.subjectOverride
          ? renderMergeTags(s.subjectOverride, merge)
          : renderMergeTags(tpl.subject, merge);
        const html = renderMergeTags(tpl.htmlBody, merge);
        await sendEmail(recipient, subject, html, {
          organizationId: run.organizationId,
          template: `automation:${run.automationId}`,
        });
      }
      const next = step + 1;
      if (next >= seq.length) {
        await prisma.emailAutomationRun.update({
          where: { id: run.id },
          data: { currentStep: next, status: "COMPLETED" },
        });
      } else {
        await prisma.emailAutomationRun.update({
          where: { id: run.id },
          data: { currentStep: next },
        });
        await emailAutomationQueue.add(
          "tick",
          { runId: run.id },
          { jobId: `tick:${run.id}:${next}` }
        );
      }
      return;
    }

    if (s.kind === "BRANCH") {
      const fieldVal = String((ctx as any)[s.condition.field] ?? "");
      const matched = s.condition.op === "=" ? fieldVal === s.condition.value : false;
      const next = matched ? s.ifTrue : s.ifFalse;
      await prisma.emailAutomationRun.update({
        where: { id: run.id },
        data: { currentStep: next },
      });
      await emailAutomationQueue.add(
        "tick",
        { runId: run.id },
        { jobId: `tick:${run.id}:${next}:${Date.now()}` }
      );
      return;
    }

    // Unknown step kind — fail run.
    await prisma.emailAutomationRun.update({
      where: { id: run.id },
      data: { status: "FAILED" },
    });
  } catch (err: any) {
    logger.error({ err, runId: run.id }, "[email-automation] tick failed");
    await prisma.emailAutomationRun
      .update({ where: { id: run.id }, data: { status: "FAILED" } })
      .catch(() => {});
    throw err;
  }
}
