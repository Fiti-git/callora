/**
 * Self-contained OTel + /health helpers for api-gateway.
 *
 * The gateway doesn't depend on @callora/shared (it has its own Dockerfile
 * context), so this file mirrors shared/src/observability/* as a local copy.
 * Keep in sync.
 */

let otelStarted = false;

export function startOtel(serviceName = "api-gateway"): void {
  if (otelStarted || process.env.NODE_ENV === "test") return;
  otelStarted = true;
  try {
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

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
    const sampleRate = Number(process.env.OTEL_TRACE_SAMPLE_RATE || "0.1");

    const sdk = new NodeSDK({
      resource: new Resource({
        "service.name": serviceName,
        "deployment.environment": process.env.NODE_ENV || "development",
      }),
      sampler: new TraceIdRatioBasedSampler(sampleRate),
      traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/traces` }),
      instrumentations: [
        getNodeAutoInstrumentations({ "@opentelemetry/instrumentation-fs": { enabled: false } }),
      ],
    });
    sdk.start();
    // eslint-disable-next-line no-console
    console.log(`[otel] started service=${serviceName} endpoint=${endpoint}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[otel] disabled:", (err as Error).message);
  }
}

export interface HealthOpts {
  serviceName: string;
  pingDb?: () => Promise<unknown>;
  pingQueue?: () => Promise<unknown>;
}

export function makeHealthHandler(opts: HealthOpts) {
  return async (_req: unknown, res: any) => {
    let db: "ok" | "error" | "skipped" = "skipped";
    let queue: "ok" | "error" | "skipped" = "skipped";
    if (opts.pingDb) {
      try { await opts.pingDb(); db = "ok"; } catch { db = "error"; }
    }
    if (opts.pingQueue) {
      try { await opts.pingQueue(); queue = "ok"; } catch { queue = "error"; }
    }
    const status: "ok" | "degraded" = db === "error" || queue === "error" ? "degraded" : "ok";
    res.status(200).json({
      status,
      uptime: Math.round(process.uptime()),
      db,
      queue,
      version: process.env.GIT_SHA || process.env.npm_package_version || "unknown",
      service: opts.serviceName,
    });
  };
}
