import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker, VendorUnavailableError } from "../lib/circuitBreaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens after 5 consecutive failures", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 5, openMs: 30_000 });
    const fail = () => Promise.reject(new Error("boom"));

    for (let i = 0; i < 5; i++) {
      await expect(cb.exec(fail)).rejects.toThrow("boom");
    }
    expect(cb.getState()).toBe("OPEN");

    // 6th call short-circuits with VendorUnavailableError, fn never invoked.
    const fn = vi.fn(fail);
    await expect(cb.exec(fn)).rejects.toBeInstanceOf(VendorUnavailableError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("transitions to HALF_OPEN after cool-off, then CLOSED on first success", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 3, openMs: 1000 });
    const fail = () => Promise.reject(new Error("boom"));
    for (let i = 0; i < 3; i++) {
      await expect(cb.exec(fail)).rejects.toThrow();
    }
    expect(cb.getState()).toBe("OPEN");

    // Advance past the cool-off window.
    vi.advanceTimersByTime(1001);

    // Next call goes through (HALF_OPEN). Success closes the breaker.
    const ok = vi.fn(() => Promise.resolve("ok"));
    const result = await cb.exec(ok);
    expect(result).toBe("ok");
    expect(ok).toHaveBeenCalledTimes(1);
    expect(cb.getState()).toBe("CLOSED");
  });

  it("re-opens if the half-open probe call fails", async () => {
    const cb = new CircuitBreaker("test", { failureThreshold: 2, openMs: 500 });
    await expect(cb.exec(() => Promise.reject(new Error("a")))).rejects.toThrow();
    await expect(cb.exec(() => Promise.reject(new Error("b")))).rejects.toThrow();
    expect(cb.getState()).toBe("OPEN");

    vi.advanceTimersByTime(501);
    await expect(cb.exec(() => Promise.reject(new Error("c")))).rejects.toThrow("c");
    expect(cb.getState()).toBe("OPEN");
  });
});
