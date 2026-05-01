/**
 * Singleton Prometheus registry + the metric primitives used across all
 * Callora services. Importing this module is side-effect-free beyond
 * registering default node metrics on the singleton registry.
 *
 * Bundles expose `GET /metrics` which serializes `registry.metrics()`.
 */

import client, { Registry, Counter, Histogram, Gauge } from "prom-client";

const HISTOGRAM_BUCKETS_SECONDS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export const registry: Registry = new client.Registry();

// Default node/process metrics (event loop lag, RSS, etc.).
client.collectDefaultMetrics({ register: registry });

export const httpRequestCounter = new Counter({
  name: "callora_http_requests_total",
  help: "Total HTTP requests processed",
  labelNames: ["service", "method", "route", "status"] as const,
  registers: [registry],
});

export const httpRequestDurationHistogram = new Histogram({
  name: "callora_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["service", "method", "route", "status"] as const,
  buckets: HISTOGRAM_BUCKETS_SECONDS,
  registers: [registry],
});

export const vendorCallDurationHistogram = new Histogram({
  name: "callora_vendor_call_duration_seconds",
  help: "Outbound vendor API call duration in seconds",
  labelNames: ["vendor", "op", "status"] as const,
  buckets: HISTOGRAM_BUCKETS_SECONDS,
  registers: [registry],
});

export const circuitBreakerStateGauge = new Gauge({
  name: "callora_circuit_breaker_state",
  help: "Circuit breaker state per vendor (1 = active, 0 = inactive). Labels: vendor, state in {CLOSED, OPEN, HALF_OPEN}",
  labelNames: ["vendor", "state"] as const,
  registers: [registry],
});

export const spendPerOrgGauge = new Gauge({
  name: "callora_spend_per_org_usd",
  help: "Estimated spend per organization in USD (rolling)",
  labelNames: ["organizationId"] as const,
  registers: [registry],
});

/** Helper: time a vendor call and record the result. */
export async function timeVendorCall<T>(
  vendor: string,
  op: string,
  fn: () => Promise<T>
): Promise<T> {
  const end = vendorCallDurationHistogram.startTimer({ vendor, op });
  try {
    const v = await fn();
    end({ status: "ok" });
    return v;
  } catch (err) {
    end({ status: "error" });
    throw err;
  }
}

/**
 * Set the circuit breaker state gauge so exactly one of {CLOSED, OPEN,
 * HALF_OPEN} is 1 for the given vendor.
 */
export function setCircuitBreakerState(
  vendor: string,
  state: "CLOSED" | "OPEN" | "HALF_OPEN"
): void {
  for (const s of ["CLOSED", "OPEN", "HALF_OPEN"] as const) {
    circuitBreakerStateGauge.labels(vendor, s).set(s === state ? 1 : 0);
  }
}

export const PROM_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";
