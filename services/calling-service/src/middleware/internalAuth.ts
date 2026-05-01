import type { Request, Response, NextFunction } from "express";

/**
 * Internal service-to-service auth.
 *
 * Cluster-internal callers (campaign-service, billing-service, gateway) must
 * present `x-internal-token: <INTERNAL_SERVICE_TOKEN>` if the env var is set.
 * If the env var is NOT set (legacy / local dev) the middleware passes
 * through — this preserves the existing behaviour where /internal endpoints
 * are protected only by network locality.
 */
export function requireInternalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) {
    next();
    return;
  }
  const got = req.headers["x-internal-token"];
  if (typeof got === "string" && got === expected) {
    next();
    return;
  }
  res.status(401).json({ error: "internal auth required" });
}
