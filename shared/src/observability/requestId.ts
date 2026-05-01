/**
 * Express middleware: ensure every request has an `x-request-id`.
 *
 *  - Reuses the incoming `X-Request-Id` header when present (so a request
 *    that flows edge -> core -> io keeps a single id end-to-end).
 *  - Otherwise generates a uuid v4.
 *  - Attaches the id to `req.requestId` and a child logger to `req.log`.
 *  - Echoes the id in the response header.
 */

import { randomUUID } from "node:crypto";
import { logger, withRequestId, type Logger } from "./logger";

// Local Express types; we keep this ts-light so shared doesn't depend on @types/express.
interface ReqLike {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
  log?: Logger;
}
interface ResLike {
  setHeader: (name: string, value: string) => void;
}
type Next = (err?: unknown) => void;

export function requestIdMiddleware(req: ReqLike, res: ResLike, next: Next): void {
  const incoming = req.headers["x-request-id"];
  const id =
    (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
  req.requestId = id;
  req.log = withRequestId(id);
  res.setHeader("x-request-id", id);
  next();
}

export { logger };
