import pino from "pino";
import { activeTraceId } from "./otel.js";

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  base: { service: "callora-backend" },
  mixin() {
    // Correlate every log line with the active OTel trace id so structured
    // logs and APM spans can be cross-referenced.
    const traceId = activeTraceId();
    return traceId ? { traceId } : {};
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
      "*.apiKey",
      "*.geminiKey",
      "*.googleMapsKey",
      "*.vapiKey",
    ],
    censor: "[REDACTED]",
  },
  transport: isProd
    ? undefined
    : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } },
});
