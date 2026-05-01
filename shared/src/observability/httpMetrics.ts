/**
 * Express middleware that records per-request count + latency to Prometheus.
 *
 * Route label uses `req.route?.path` if set (e.g. "/campaigns/:id"), falling
 * back to the request path. We do NOT include query strings or the raw
 * `req.url` to keep the cardinality bounded.
 */

import {
  httpRequestCounter,
  httpRequestDurationHistogram,
} from "./metrics";

interface ReqLike {
  method: string;
  path?: string;
  url?: string;
  route?: { path?: string };
  baseUrl?: string;
}
interface ResLike {
  statusCode: number;
  on: (event: string, cb: () => void) => void;
}
type Next = () => void;

const SERVICE = process.env.SERVICE_NAME || "callora";

export function httpMetricsMiddleware(
  req: ReqLike,
  res: ResLike,
  next: Next
): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durSec =
      Number(process.hrtime.bigint() - start) / 1_000_000_000;
    const route =
      (req.baseUrl ?? "") +
      (req.route?.path ?? req.path ?? req.url ?? "unknown");
    const labels = {
      service: SERVICE,
      method: req.method,
      route,
      status: String(res.statusCode),
    };
    httpRequestCounter.inc(labels);
    httpRequestDurationHistogram.observe(labels, durSec);
  });
  next();
}
