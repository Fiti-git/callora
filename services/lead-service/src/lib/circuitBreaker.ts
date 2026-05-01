// Hand-rolled per-vendor circuit breaker.
//
// Wraps an async call. After 5 consecutive failures the breaker OPENS for
// 30s and immediately throws VendorUnavailableError on every call. After
// the cool-off it transitions to HALF_OPEN; the next call is allowed
// through. If it succeeds the breaker CLOSES; if it fails the breaker
// re-opens for another 30s window.
//
// Emits state-change updates to the shared Prometheus gauge so dashboards
// can chart breaker state per vendor.

import { setCircuitBreakerState } from "@callora/shared";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class VendorUnavailableError extends Error {
  readonly vendor: string;
  readonly status = 503 as const;
  constructor(vendor: string, message?: string) {
    super(message ?? `Vendor "${vendor}" is temporarily unavailable`);
    this.name = "VendorUnavailableError";
    this.vendor = vendor;
  }
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  openMs?: number;
}

export class CircuitBreaker {
  private readonly vendor: string;
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(vendor: string, opts: CircuitBreakerOptions = {}) {
    this.vendor = vendor;
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.openMs = opts.openMs ?? 30_000;
    setCircuitBreakerState(this.vendor, this.state);
  }

  private transition(next: CircuitState): void {
    if (this.state === next) return;
    this.state = next;
    setCircuitBreakerState(this.vendor, next);
  }

  getState(): CircuitState {
    return this.state;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.openedAt >= this.openMs) {
        this.transition("HALF_OPEN");
      } else {
        throw new VendorUnavailableError(this.vendor);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.transition("CLOSED");
  }

  private onFailure(): void {
    this.consecutiveFailures += 1;
    if (
      this.state === "HALF_OPEN" ||
      this.consecutiveFailures >= this.failureThreshold
    ) {
      this.openedAt = Date.now();
      this.transition("OPEN");
    }
  }
}
