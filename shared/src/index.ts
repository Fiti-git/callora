export * from "./types/index.js";
export * from "./auth/index.js";
export * from "./quota/index.js";
export * from "./errors.js";
export { default as prisma, rawPrisma } from "./prisma/index.js";
export { startOtel, activeTraceId } from "./observability/otel.js";
export {
  buildHealthBody,
  makeHealthHandler,
  type HealthBody,
  type HealthHandlerOptions,
} from "./observability/health.js";
export {
  logger,
  withRequestId,
  redactPhone,
  redactEmail,
  redactTranscript,
  PINO_REDACT_PATHS,
  registry,
  httpRequestCounter,
  httpRequestDurationHistogram,
  vendorCallDurationHistogram,
  circuitBreakerStateGauge,
  spendPerOrgGauge,
  timeVendorCall,
  setCircuitBreakerState,
  PROM_CONTENT_TYPE,
  requestIdMiddleware,
  httpMetricsMiddleware,
  type Logger,
} from "./observability/index.js";
export {
  getSecret,
  getSecretSync,
  clearCache as clearSecretsCache,
  SECRET_TTL_MS,
  SecretNotFoundError,
  EnvSecretBackend,
  AwsSecretsManagerBackend,
  DbSecretBackend,
  encryptSecret,
  decryptSecret,
  maskSecret,
  BOOTSTRAP_SECRETS,
  _resetBackendForTesting,
  type SecretBackend,
  type SecretBackendName,
} from "./secrets/index.js";
