import { describe, it, expect } from "vitest";
import {
  isWithinAllowedWindow,
  nextAllowedWindow,
  inferStateFromAreaCode,
  getStaticWindow,
} from "../lib/callWindow.js";

/**
 * Pure logic tests — no DB required. Builds Date objects in UTC and lets
 * the helpers translate via Intl.DateTimeFormat to the state's local tz.
 */

// 12:00 UTC on a weekday in late April. Used as a base for time math.
function utc(h: number, m = 0): Date {
  return new Date(Date.UTC(2026, 3, 29, h, m, 0));
}

describe("isWithinAllowedWindow", () => {
  // Eastern Time is UTC-4 (DST) on 2026-04-29.
  it("CT lead at 12:59 UTC (07:59 CT) is NOT allowed", () => {
    // CT is UTC-5 in DST → 12:59 UTC = 07:59 CT
    expect(isWithinAllowedWindow("IL", utc(12, 59))).toBe(false);
  });
  it("CT lead at 13:00 UTC (08:00 CT) IS allowed", () => {
    expect(isWithinAllowedWindow("IL", utc(13, 0))).toBe(true);
  });
  it("CT lead at 02:01 UTC next-day (21:01 CT) is NOT allowed", () => {
    // 02:01 UTC on Apr 30 = 21:01 CT on Apr 29
    const d = new Date(Date.UTC(2026, 3, 30, 2, 1, 0));
    expect(isWithinAllowedWindow("IL", d)).toBe(false);
  });

  it("FL (8-20 ET) at 20:30 ET is NOT allowed", () => {
    // ET is UTC-4 in DST → 00:30 UTC = 20:30 ET previous day
    const d = new Date(Date.UTC(2026, 3, 30, 0, 30, 0));
    expect(isWithinAllowedWindow("FL", d)).toBe(false);
  });
  it("FL at 19:30 ET IS allowed", () => {
    const d = new Date(Date.UTC(2026, 3, 29, 23, 30, 0)); // 19:30 ET
    expect(isWithinAllowedWindow("FL", d)).toBe(true);
  });

  it("uses DEFAULT (federal 8-21 ET) when state is null", () => {
    const w = getStaticWindow(null);
    expect(w.state).toBe("DEFAULT");
    expect(w.allowedFrom).toBe("08:00");
    expect(w.allowedTo).toBe("21:00");
  });
});

describe("nextAllowedWindow", () => {
  it("returns a future Date that is itself within the window", () => {
    // Pick 3 AM ET → window starts at 8 AM same day.
    const at = new Date(Date.UTC(2026, 3, 29, 7, 0, 0)); // 03:00 ET
    const next = nextAllowedWindow("NY", at);
    expect(next.getTime()).toBeGreaterThan(at.getTime());
    expect(isWithinAllowedWindow("NY", next)).toBe(true);
  });
});

describe("inferStateFromAreaCode", () => {
  it("returns CA for 415", () => {
    expect(inferStateFromAreaCode("+14155551234")).toBe("CA");
  });
  it("returns NY for 212", () => {
    expect(inferStateFromAreaCode("+12125551234")).toBe("NY");
  });
  it("returns null for unknown area codes", () => {
    expect(inferStateFromAreaCode("+19995551234")).toBeNull();
  });
  it("handles digit-only input", () => {
    expect(inferStateFromAreaCode("4155551234")).toBe("CA");
  });
});
