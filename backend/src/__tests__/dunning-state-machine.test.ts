import { describe, it, expect } from "vitest";
import {
  decideTransition,
  shouldRetryCharge,
  initialDunningPayload,
  type DunningRowMinimal,
} from "../lib/dunning.js";

/**
 * Pure state-machine tests — no DB, no Stripe, no email.
 *
 * Drives a synthetic DunningState row through the full Day 0→3→7→10→30
 * cadence and asserts the transition output (next status, attempt counter,
 * scheduling delta, side-effects, email key, audit action) at each step.
 */

const DAY = 86_400_000;

function row(
  attempt: number,
  status: DunningRowMinimal["status"]
): DunningRowMinimal {
  return {
    id: `dunning_${attempt}`,
    organizationId: "org_x",
    invoiceId: "in_x",
    attempt,
    status,
  };
}

describe("dunning state machine — initialDunningPayload", () => {
  it("opens with attempt=1, status=ACTIVE, nextActionAt=+3 days", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const p = initialDunningPayload({
      organizationId: "org_x",
      invoiceId: "in_1",
      now,
    });
    expect(p.attempt).toBe(1);
    expect(p.status).toBe("ACTIVE");
    expect(p.nextActionAt.getTime()).toBe(now.getTime() + 3 * DAY);
  });
});

describe("dunning state machine — Day 3 (attempt=1, ACTIVE) failed retry", () => {
  it("→ attempt=2, RETRY_SCHEDULED, +4d, email DAY_3, audit RETRY_FAILED, no orgStatus change", () => {
    const t = decideTransition(row(1, "ACTIVE"), "FAILED");
    expect(t.nextAttempt).toBe(2);
    expect(t.nextStatus).toBe("RETRY_SCHEDULED");
    expect(t.nextActionDeltaMs).toBe(4 * DAY);
    expect(t.orgStatus).toBeNull();
    expect(t.emailKey).toBe("DUNNING_DAY_3_RETRY_FAILED");
    expect(t.auditAction).toBe("DUNNING_RETRY_FAILED");
    expect(t.cancelStripeSubscription).toBe(false);
  });
});

describe("dunning state machine — Day 7 (attempt=2, RETRY_SCHEDULED) failed retry", () => {
  it("→ attempt=3, WARNED, +3d, email DAY_7", () => {
    const t = decideTransition(row(2, "RETRY_SCHEDULED"), "FAILED");
    expect(t.nextAttempt).toBe(3);
    expect(t.nextStatus).toBe("WARNED");
    expect(t.nextActionDeltaMs).toBe(3 * DAY);
    expect(t.orgStatus).toBeNull();
    expect(t.emailKey).toBe("DUNNING_DAY_7_FINAL_WARNING");
    expect(t.auditAction).toBe("DUNNING_WARNED");
  });
});

describe("dunning state machine — Day 10 (attempt=3, WARNED)", () => {
  it("→ attempt=4, SUSPENDED, +20d, org→SUSPENDED, email DAY_10", () => {
    // No retry on Day 10 — worker should pass SKIPPED.
    const t = decideTransition(row(3, "WARNED"), "SKIPPED");
    expect(t.nextAttempt).toBe(4);
    expect(t.nextStatus).toBe("SUSPENDED");
    expect(t.nextActionDeltaMs).toBe(20 * DAY);
    expect(t.orgStatus).toBe("SUSPENDED");
    expect(t.emailKey).toBe("DUNNING_DAY_10_SUSPENDED");
    expect(t.auditAction).toBe("DUNNING_SUSPENDED");
    expect(t.cancelStripeSubscription).toBe(false);
  });
});

describe("dunning state machine — Day 30 (attempt>=4, SUSPENDED)", () => {
  it("→ CANCELED, org→CANCELED, cancelStripeSubscription=true, audit DUNNING_CANCELED", () => {
    const t = decideTransition(row(4, "SUSPENDED"), "SKIPPED");
    expect(t.nextStatus).toBe("CANCELED");
    expect(t.orgStatus).toBe("CANCELED");
    expect(t.emailKey).toBe("DUNNING_DAY_30_CANCELED");
    expect(t.auditAction).toBe("DUNNING_CANCELED");
    expect(t.cancelStripeSubscription).toBe(true);
  });
});

describe("dunning state machine — successful retry collapses any state", () => {
  it("from ACTIVE → RESOLVED + org ACTIVE + DUNNING_RECOVERED email", () => {
    const t = decideTransition(row(1, "ACTIVE"), "SUCCEEDED");
    expect(t.nextStatus).toBe("RESOLVED");
    expect(t.orgStatus).toBe("ACTIVE");
    expect(t.emailKey).toBe("DUNNING_RECOVERED");
    expect(t.auditAction).toBe("DUNNING_RESOLVED");
  });

  it("from RETRY_SCHEDULED → RESOLVED", () => {
    const t = decideTransition(row(2, "RETRY_SCHEDULED"), "SUCCEEDED");
    expect(t.nextStatus).toBe("RESOLVED");
    expect(t.orgStatus).toBe("ACTIVE");
  });
});

describe("dunning state machine — shouldRetryCharge", () => {
  it("retries on Day 3 + Day 7 only", () => {
    expect(shouldRetryCharge(row(1, "ACTIVE"))).toBe(true);
    expect(shouldRetryCharge(row(2, "RETRY_SCHEDULED"))).toBe(true);
    expect(shouldRetryCharge(row(3, "WARNED"))).toBe(false);
    expect(shouldRetryCharge(row(4, "SUSPENDED"))).toBe(false);
  });
});
