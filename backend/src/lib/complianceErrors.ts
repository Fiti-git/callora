/**
 * TCPA compliance errors (Phase 2 Agent 9).
 *
 * Mirror of `shared/src/errors.ts` for the legacy monolith. The microservices
 * import the shared variant; the monolith uses these. Keep both shapes
 * identical so the campaign worker's per-lead skip logic can `instanceof`
 * either flavour interchangeably.
 *
 * Behaviour: thrown by VapiService before any outbound call. Treated by the
 * campaign worker as a per-lead skip (NOT a campaign-level abort). Skipped
 * leads get a SKIPPED_NO_CONSENT / SKIPPED_DNC status and a CallLog row
 * with status BLOCKED_NO_CONSENT / BLOCKED_DNC for audit.
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
