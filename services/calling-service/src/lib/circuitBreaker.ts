/**
 * Lightweight circuit breaker for outbound HTTP calls (Vapi).
 *
 * States: CLOSED → (N consecutive failures) → OPEN → (after cooldown) → HALF_OPEN
 *         HALF_OPEN → success → CLOSED ; failure → OPEN
 *
 * Per-instance state, single-process only. Emits state-change updates to
 * the shared Prometheus gauge for dashboarding.
 */

import { setCircuitBreakerState } from "@callora/shared";

type State = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number; // consecutive failures before tripping
  cooldownMs?: number; // OPEN → HALF_OPEN delay
}

export class CircuitBreaker {
  private state: State = "CLOSED";
  private failures = 0;
  private nextAttempt = 0;
  private readonly name: string;
  private readonly threshold: number;
  private readonly cooldown: number;

  constructor(opts: CircuitBreakerOptions) {
    this.name = opts.name;
    this.threshold = opts.failureThreshold ?? 5;
    this.cooldown = opts.cooldownMs ?? 30_000;
    setCircuitBreakerState(this.name, this.state);
  }

  private transition(next: State): void {
    if (this.state === next) return;
    this.state = next;
    setCircuitBreakerState(this.name, next);
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`[${this.name}] circuit open`);
      }
      this.transition("HALF_OPEN");
    }
    try {
      const v = await fn();
      this.onSuccess();
      return v;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.transition("CLOSED");
  }

  private onFailure(): void {
    this.failures++;
    if (this.state === "HALF_OPEN" || this.failures >= this.threshold) {
      this.nextAttempt = Date.now() + this.cooldown;
      this.transition("OPEN");
    }
  }
}
