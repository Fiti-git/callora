import { describe, it, expect } from "vitest";
import {
  isWithinAllowedWindow,
  nextAllowedWindow,
  inferStateFromAreaCode,
} from "../lib/callWindow.js";

/**
 * Logic-only deferral test. Verifies the helpers the campaignWorker uses
 * to make the defer decision without spinning up a worker or queue.
 *
 * Behaviour under test:
 *   1. A lead with no explicit state falls back to area-code inference.
 *   2. If area code is unknown the worker uses DEFAULT (federal 8-21 ET).
 *   3. nextAllowedWindow returns a Date strictly in the future.
 *   4. The Date returned by nextAllowedWindow is itself within the window.
 */

describe("call-window deferral logic", () => {
  it("Outside-window CT lead defers to a future Date that is itself within the window", () => {
    // 06:00 UTC on Apr 29 = 01:00 CT — well before 08:00 CT window.
    const at = new Date(Date.UTC(2026, 3, 29, 6, 0, 0));
    expect(isWithinAllowedWindow("IL", at)).toBe(false);
    const next = nextAllowedWindow("IL", at);
    expect(next.getTime()).toBeGreaterThan(at.getTime());
    expect(isWithinAllowedWindow("IL", next)).toBe(true);
  });

  it("Lead with no explicit state uses area code → state inference", () => {
    const inferred = inferStateFromAreaCode("+14155551234"); // 415 = CA
    expect(inferred).toBe("CA");
  });

  it("Unknown area code falls back to DEFAULT (federal ET)", () => {
    const state = inferStateFromAreaCode("+19995551234"); // unassigned in our table
    expect(state).toBeNull();
    // The worker will pass null to isWithinAllowedWindow, which uses DEFAULT (ET, 8-21).
    const at = new Date(Date.UTC(2026, 3, 29, 12, 0, 0)); // 08:00 ET
    expect(isWithinAllowedWindow(null, at)).toBe(true);
  });

  it("FL lead at 20:30 ET defers (FL is 8-20 not 8-21)", () => {
    const at = new Date(Date.UTC(2026, 3, 30, 0, 30, 0)); // 20:30 ET on Apr 29
    expect(isWithinAllowedWindow("FL", at)).toBe(false);
    const next = nextAllowedWindow("FL", at);
    expect(isWithinAllowedWindow("FL", next)).toBe(true);
  });
});
