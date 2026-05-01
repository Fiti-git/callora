/**
 * Observability barrel — pino logger + Prometheus metrics + Express middleware.
 *
 * Re-exported from `@callora/shared` so services can import:
 *   import { logger, registry, timeVendorCall, setCircuitBreakerState }
 *     from "@callora/shared";
 */

export { logger, withRequestId, type Logger } from "./logger";
export {
  redactPhone,
  redactEmail,
  redactTranscript,
  PINO_REDACT_PATHS,
} from "./redact";
export {
  registry,
  httpRequestCounter,
  httpRequestDurationHistogram,
  vendorCallDurationHistogram,
  circuitBreakerStateGauge,
  spendPerOrgGauge,
  timeVendorCall,
  setCircuitBreakerState,
  PROM_CONTENT_TYPE,
} from "./metrics";
export { requestIdMiddleware } from "./requestId";
export { httpMetricsMiddleware } from "./httpMetrics";
