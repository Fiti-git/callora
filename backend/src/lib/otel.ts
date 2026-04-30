/**
 * Thin wrapper around the shared OTel bootstrap. Backend imports this at
 * the very top of `src/index.ts` so the SDK monkey-patches HTTP / Express /
 * Prisma / ioredis before any other import runs.
 *
 * Falls back to a noop if the @opentelemetry packages can't be resolved at
 * runtime — see `shared/src/observability/otel.ts` for details.
 */

let started = false;

export function startOtel(): void {
  if (started) return;
  started = true;

  const serviceName =
    process.env.OTEL_SERVICE_NAME ||
    process.env.SERVICE_NAME ||
    "callora-backend";

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";

  const sampleRate = Number(process.env.OTEL_TRACE_SAMPLE_RATE || "0.1");

  try {
    // Dynamic require so missing deps degrade to a warning, never a crash.
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
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
      ],
    });

    sdk.start();
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
      "[otel] disabled — missing packages or init failed:",
      (err as Error).message
    );
  }
}

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
    /* ignore */
  }
  return null;
}
