/**
 * Standard /health endpoint helper used by every Callora service.
 *
 * Response shape:
 *   {
 *     status:  "ok" | "degraded",
 *     uptime:  <seconds since process start>,
 *     db:      "ok" | "error" | "skipped",
 *     queue:   "ok" | "error" | "skipped",
 *     version: <git sha or pkg version>,
 *     service: <service name>
 *   }
 *
 * Always returns HTTP 200 — content of `status` is the readiness signal.
 * Docker-compose / k8s healthchecks must parse the body and assert
 * `status === "ok"` so a degraded-but-reachable service reports unhealthy.
 */

export interface HealthHandlerOptions {
  serviceName: string;
  version?: string;
  pingDb?: () => Promise<unknown>;
  pingQueue?: () => Promise<unknown>;
}

export interface HealthBody {
  status: "ok" | "degraded";
  uptime: number;
  db: "ok" | "error" | "skipped";
  queue: "ok" | "error" | "skipped";
  version: string;
  service: string;
}

export async function buildHealthBody(
  opts: HealthHandlerOptions
): Promise<HealthBody> {
  const version =
    opts.version || process.env.GIT_SHA || process.env.npm_package_version || "unknown";

  let db: "ok" | "error" | "skipped" = "skipped";
  if (opts.pingDb) {
    try {
      await opts.pingDb();
      db = "ok";
    } catch {
      db = "error";
    }
  }

  let queue: "ok" | "error" | "skipped" = "skipped";
  if (opts.pingQueue) {
    try {
      await opts.pingQueue();
      queue = "ok";
    } catch {
      queue = "error";
    }
  }

  const status: "ok" | "degraded" =
    db === "error" || queue === "error" ? "degraded" : "ok";

  return {
    status,
    uptime: Math.round(process.uptime()),
    db,
    queue,
    version,
    service: opts.serviceName,
  };
}

/**
 * Express handler factory. Mount with:
 *   app.get("/health", makeHealthHandler({ serviceName, pingDb, pingQueue }))
 */
export function makeHealthHandler(opts: HealthHandlerOptions) {
  return async (_req: unknown, res: any) => {
    const body = await buildHealthBody(opts);
    res.status(200).json(body);
  };
}
