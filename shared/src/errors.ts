/**
 * TCPA compliance errors (Phase 2 Agent 9).
 *
 * Both errors are thrown by the Vapi service before any outbound call is
 * placed. The campaign worker treats them as per-lead skips (not fatal):
 * mark the Lead with a SKIPPED_* status, write a CallLog row with the
 * matching BLOCKED_* status, audit, and continue to the next lead — do NOT
 * pause the campaign.
 */

export class ConsentRequiredError extends Error {
  readonly name = "ConsentRequiredError";
  readonly code = "CONSENT_REQUIRED";
  readonly leadId?: string;
  readonly reason: "NO_CONSENT" | "DO_NOT_CALL";

  constructor(reason: "NO_CONSENT" | "DO_NOT_CALL", leadId?: string) {
    super(
      reason === "DO_NOT_CALL"
        ? "Lead is on do-not-call list"
        : "Lead has not granted consent"
    );
    this.reason = reason;
    this.leadId = leadId;
    Object.setPrototypeOf(this, ConsentRequiredError.prototype);
  }
}

export class DNCBlockedError extends Error {
  readonly name = "DNCBlockedError";
  readonly code = "DNC_BLOCKED";
  readonly source?: string;
  readonly leadId?: string;

  constructor(source?: string, leadId?: string) {
    super(`Phone is on DNC list${source ? ` (${source})` : ""}`);
    this.source = source;
    this.leadId = leadId;
    Object.setPrototypeOf(this, DNCBlockedError.prototype);
  }
}
