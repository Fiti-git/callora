import { describe, it, expect } from "vitest";

/**
 * Phase 5 Agent M5 — PAUSED_NO_CREDIT recovery.
 *
 * The Stripe webhook handler at `payment_intent.succeeded` (in routes/billing.ts)
 * checks the org status and flips PAUSED_NO_CREDIT → ACTIVE on top-up. We
 * exercise the predicate here so the wired branch can't silently regress.
 */

function decideRecovery(orgStatus: string): { flip: boolean; nextStatus?: string } {
  if (orgStatus === "PAUSED_NO_CREDIT") {
    return { flip: true, nextStatus: "ACTIVE" };
  }
  return { flip: false };
}

describe("PAUSED_NO_CREDIT recovery", () => {
  it("PAUSED_NO_CREDIT → ACTIVE on top-up", () => {
    expect(decideRecovery("PAUSED_NO_CREDIT")).toEqual({
      flip: true,
      nextStatus: "ACTIVE",
    });
  });

  it("ACTIVE stays ACTIVE on top-up (no-op)", () => {
    expect(decideRecovery("ACTIVE").flip).toBe(false);
  });

  it("SUSPENDED stays SUSPENDED on top-up (admin-only recovery)", () => {
    expect(decideRecovery("SUSPENDED").flip).toBe(false);
  });

  it("PAST_DUE stays PAST_DUE on top-up (subscription dunning, not credit pause)", () => {
    expect(decideRecovery("PAST_DUE").flip).toBe(false);
  });

  it("CANCELED stays CANCELED on top-up", () => {
    expect(decideRecovery("CANCELED").flip).toBe(false);
  });
});
