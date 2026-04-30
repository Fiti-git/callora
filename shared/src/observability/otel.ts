/**
 * OpenTelemetry bootstrap for Callora services.
 *
 * Each service should call `startOtel()` BEFORE any other import in its
 * `src/index.ts` so the SDK can monkey-patch HTTP / Express / ioredis at
 * load time. The function is idempotent and safe to invoke multiple times.
 *
 * Env (all optional):
 *   OTEL_SERVICE_NAME        defaults to process.env.SERVICE_NAME or "callora-backend"
 *   OTEL_EXPORTER_OTLP_ENDPOINT  defaults to "http://localhost:4318"
 *   OTEL_TRACE_SAMPLE_RATE   default 0.1
 *   SENTRY_DSN               if set, Sentry's APM also receives spans
 *
 * Tests: gate the call with `if (process.env.NODE_ENV !== "test") startOtel()`.
 *
 * Loaded lazily/dynamically — if @opentelemetry packages aren't installed
 * for a particular service, `startOtel()` becomes a no-op (logged) rather
 * than crashing the process. This keeps the bootstrap safe to import from
 * every service even if dependencies haven't been hoisted yet.
 */

let started = false;

export interface StartOtelOptions {
  serviceName?: string;
  endpoint?: string;
  sampleRate?: number;
}

export function startOtel(options: StartOtelOptions = {}): void {
  if (started) return;
  if (process.env.NODE_ENV === "test") return;

  const serviceName =
    options.serviceName ||
    process.env.OTEL_SERVICE_NAME ||
    process.env.SERVICE_NAME ||
    "callora-backend";

  const endpoint =
    options.endpoint ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    "http://localhost:4318";

  const sampleRate = Number(
    options.sampleRate ?? process.env.OTEL_TRACE_SAMPLE_RATE ?? "0.1"
  );

  try {
    // Use require so a missing dep produces a soft warning, not an unhandled
    // ESM resolve failure at module-load time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeSDK } = require("@opentelemetry/sdk-node");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resource } = require("@opentelemetry/resources");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TraceIdRatioBasedSampler } = require("@opentelemetry/sdk-trace-base");

    const sdk = new NodeSDK({
      resource: new Resource({
        "service.name": serviceName,
        "deployment.environment": process.env.NODE_ENV || "development",
      }),
      sampler: new TraceIdRatioBasedSampler(sampleRate),
      traceExporter: new OTLPTraceExporter({
        url: `${endpoint.replace(/\/$/, "")}/v1/traces`,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // FS instrumentation is too noisy in dev; keep off.
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
      ],
    });

    sdk.start();
    started = true;

    // eslint-disable-next-line no-console
    console.log(
      `[otel] started service=${serviceName} endpoint=${endpoint} sampleRate=${sampleRate}`
    );

    process.on("SIGTERM", () => {
      sdk
        .shutdown()
        .catch((err: unknown) => console.error("[otel] shutdown error", err));
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[otel] disabled — missing @opentelemetry packages or init failed:",
      (err as Error).message
    );
  }
}

/**
 * Returns the active trace id (hex string) if any, otherwise null.
 * Used by the pino mixin so every log line is correlatable.
 */
export function activeTraceId(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require("@opentelemetry/api");
    const span = api.trace?.getActiveSpan?.();
    const ctx = span?.spanContext?.();
    if (ctx?.traceId && ctx.traceId !== "00000000000000000000000000000000") {
      return ctx.traceId;
    }
  } catch {
    // package not installed — fall through
  }
  return null;
}
