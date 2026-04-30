import { describe, it, expect } from "vitest";
import {
  QuotaExceededError,
  SeatLimitExceededError,
} from "../lib/quota.js";

/**
 * Quota error shape contract — frontends rely on the JSON body coming back
 * with `kind`, `current`, `limit`, and `units` so the user can be told
 * which quota was exhausted. If anyone "simplifies" the error class away,
 * this test fails before the API contract slips.
 *
 * Pure unit test — no DB.
 */

describe("QuotaExceededError contract", () => {
  it("carries kind/current/limit/units on the thrown error", () => {
    const err = new QuotaExceededError("VAPI_CALL", 99, 100, 2);
    expect(err.name).toBe("QuotaExceededError");
    expect(err.kind).toBe("VAPI_CALL");
    expect(err.current).toBe(99);
    expect(err.limit).toBe(100);
    expect(err.units).toBe(2);
    expect(err.status).toBe(429);
  });

  it("SeatLimitExceededError carries current/limit and 402 status", () => {
    const err = new SeatLimitExceededError(3, 3);
    expect(err.name).toBe("SeatLimitExceededError");
    expect(err.current).toBe(3);
    expect(err.limit).toBe(3);
    expect(err.status).toBe(402);
  });
});

describe("error-handler in src/index.ts maps these errors correctly", () => {
  /**
   * The centralised error handler shape lives in src/index.ts. We just
   * sanity-check that the code path it relies on (err.name === "Quota..."
   * or instanceof) is what the classes actually expose. If somebody
   * renames the class, these constants drift.
   */
  it("name field on the prototype matches the handler's discriminator", () => {
    expect(new QuotaExceededError("EMAIL", 0, 0, 1).name).toBe("QuotaExceededError");
    expect(new SeatLimitExceededError(0, 0).name).toBe("SeatLimitExceededError");
  });
});
