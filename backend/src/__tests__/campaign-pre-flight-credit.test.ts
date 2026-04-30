import { describe, it, expect } from "vitest";

/**
 * Phase 5 Agent M5 — campaign-start credit pre-flight.
 *
 * Logic-only test of the decision the route makes:
 *   PAYG org, balance < leads.length * 150 → 402 INSUFFICIENT_CREDITS.
 *   PAYG org, balance >= leads.length * 150 → enqueue.
 *   BYOK / SUBSCRIPTION → skip credit check entirely.
 *
 * The route code path is small and tightly coupled to Express/auth/BullMQ;
 * we replicate the predicate here so future drift gets caught at review.
 */

interface PreFlightInput {
  billingMode: "PAYG" | "BYOK" | "SUBSCRIPTION";
  leadCount: number;
  balanceCents: number;
}

interface PreFlightResult {
  pass: boolean;
  status?: number;
  required?: number;
  current?: number;
}

function preFlight(input: PreFlightInput): PreFlightResult {
  if (input.billingMode !== "PAYG") return { pass: true };
  const required = input.leadCount * 150;
  if (input.balanceCents < required) {
    return { pass: false, status: 402, required, current: input.balanceCents };
  }
  return { pass: true };
}

describe("campaign-start credit pre-flight", () => {
  it("PAYG: 50 leads × 150 = 7500; balance 5000 → 402 INSUFFICIENT_CREDITS", () => {
    const r = preFlight({ billingMode: "PAYG", leadCount: 50, balanceCents: 5000 });
    expect(r.pass).toBe(false);
    expect(r.status).toBe(402);
    expect(r.required).toBe(7500);
    expect(r.current).toBe(5000);
  });

  it("PAYG: balance 10000 covers 50 × 150 = 7500 → pass", () => {
    const r = preFlight({ billingMode: "PAYG", leadCount: 50, balanceCents: 10000 });
    expect(r.pass).toBe(true);
  });

  it("BYOK skips credit check even when balance is 0", () => {
    const r = preFlight({ billingMode: "BYOK", leadCount: 100, balanceCents: 0 });
    expect(r.pass).toBe(true);
  });

  it("SUBSCRIPTION skips credit check", () => {
    const r = preFlight({
      billingMode: "SUBSCRIPTION",
      leadCount: 100,
      balanceCents: 0,
    });
    expect(r.pass).toBe(true);
  });

  it("Edge: balance == required → pass", () => {
    const r = preFlight({ billingMode: "PAYG", leadCount: 1, balanceCents: 150 });
    expect(r.pass).toBe(true);
  });
});
