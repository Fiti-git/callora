/**
 * Shared pino logger for all Callora services.
 *
 *  - JSON output in production (machine-parseable, ships to CloudWatch / Loki)
 *  - pino-pretty in development (human-readable)
 *  - PII redact paths declared once in `redact.ts`
 *  - `withRequestId(id)` returns a child logger tagged with the request id
 */

import pino, { type Logger, type LoggerOptions } from "pino";
import { PINO_REDACT_PATHS } from "./redact";

const isProd = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL || (isProd ? "info" : "debug");

const baseOptions: LoggerOptions = {
  level,
  base: {
    service: process.env.SERVICE_NAME || process.env.npm_package_name || "callora",
    env: process.env.NODE_ENV || "development",
  },
  redact: {
    paths: [...PINO_REDACT_PATHS],
    censor: "[redacted]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

const transport: pino.TransportSingleOptions | undefined = isProd
  ? undefined
  : {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: false,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    };

export const logger: Logger = transport
  ? pino({ ...baseOptions, transport })
  : pino(baseOptions);

/** Return a child logger tagged with the given request id. */
export function withRequestId(reqId: string | undefined): Logger {
  if (!reqId) return logger;
  return logger.child({ reqId });
}

export type { Logger };
