/**
 * Public API key authentication for lead-service `/api/v1/*` routes
 * (Wave 5 — Agent 5C migration of monolith middleware).
 *
 * Resolves a Bearer token (or `X-API-Key` header) against the `PublicApiKey`
 * table. Hashes raw input with sha256 + DNC_HASH_PEPPER (re-using the
 * platform pepper — public API keys are server-side secrets just like DNC
 * entries) and looks up via the unique `keyHash`.
 *
 * On success: sets `req.user = { userId: '<api-key>', organizationId, email: '', role: 'API' }`
 *   so route handlers that rely on `req.user.organizationId` keep working
 *   without conditional branching, and bumps `lastUsedAt` asynchronously.
 *
 * Falls through (`next()` without populating req.user) when no Bearer header
 * is present OR the token doesn't carry the public-API prefix — letting the
 * JWT `authenticate` middleware run next so /api/v1/* accepts EITHER auth.
 *
 * Quota: meters one API_CALL on success and returns 429 on exhaustion.
 */
import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { prisma, meterAndCharge, QuotaExceededError } from "@callora/shared";
import type { AuthRequest } from "./requireAuth.js";

// Public API keys are prefixed `cal_` for easy identification + to let
// apiKeyAuth fall through cleanly when the token is a JWT.
export const API_KEY_PREFIX = "cal_";

let _pepper: string | null = null;
function pepper(): string {
  if (_pepper === null) {
    const raw = process.env.DNC_HASH_PEPPER;
    if (!raw) {
      throw new Error("DNC_HASH_PEPPER env var is required for API key auth");
    }
    _pepper = raw;
  }
  return _pepper;
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey + pepper()).digest("hex");
}

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const body = crypto.randomBytes(32).toString("hex");
  const raw = `${API_KEY_PREFIX}${body}`;
  return {
    raw,
    hash: hashApiKey(raw),
    prefix: raw.slice(0, 12), // "cal_" + 8 chars of body
  };
}

export interface ApiKeyAuthRequest extends AuthRequest {
  apiKey?: { id: string; scopes: string[]; organizationId: string };
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const xKey = req.headers["x-api-key"];
  if (typeof xKey === "string" && xKey.length > 0) return xKey.trim();
  return null;
}

/**
 * Try API-key auth. If the token doesn't look like a public API key,
 * fall through to next middleware (e.g. the JWT `authenticate`).
 */
export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);
  if (!token || !token.startsWith(API_KEY_PREFIX)) {
    next();
    return;
  }

  try {
    const hash = hashApiKey(token);
    const row = await prisma.publicApiKey.findUnique({
      where: { keyHash: hash },
      include: { organization: { select: { id: true, status: true } } },
    });
    if (!row || row.revokedAt) {
      res.status(401).json({ error: "invalid_api_key" });
      return;
    }
    const orgStatus = row.organization?.status;
    if (orgStatus === "SUSPENDED" || orgStatus === "CANCELED") {
      res.status(402).json({ error: "org_blocked", status: orgStatus });
      return;
    }
    // Bump lastUsedAt asynchronously; don't block the request.
    prisma.publicApiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    (req as ApiKeyAuthRequest).user = {
      userId: row.createdById ?? "api-key",
      organizationId: row.organizationId,
      email: "",
      role: "API",
    };
    (req as ApiKeyAuthRequest).apiKey = {
      id: row.id,
      scopes: row.scopes,
      organizationId: row.organizationId,
    };

    // Meter the call. Failure → 429.
    try {
      await meterAndCharge(row.organizationId, "API_CALL", 1);
    } catch (err: any) {
      if (err instanceof QuotaExceededError || err?.name === "QuotaExceededError") {
        res.status(429).json({
          error: "quota_exceeded",
          kind: "API_CALL",
          message: err.message,
        });
        return;
      }
      throw err;
    }
    next();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Helper for routes that want EITHER auth method. Mounts apiKeyAuth first;
 * if `req.user` isn't set after, runs the standard JWT `authenticate`. After
 * the JWT path resolves, meters one API_CALL so all /api/v1/* hits count
 * uniformly regardless of auth method.
 */
export function requireApiOrJwt(
  authenticate: (req: Request, res: Response, next: NextFunction) => unknown
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await apiKeyAuth(req, res, async (apiErr?: unknown) => {
      if (apiErr) return next(apiErr);
      // If apiKeyAuth populated req.user, we're done — it already metered.
      if ((req as AuthRequest).user) return next();
      // Otherwise run JWT auth, then meter once.
      authenticate(req, res, async (jwtErr?: unknown) => {
        if (jwtErr) return next(jwtErr);
        const u = (req as AuthRequest).user;
        if (u) {
          try {
            await meterAndCharge(u.organizationId, "API_CALL", 1);
          } catch (err: any) {
            if (err?.name === "QuotaExceededError") {
              return res.status(429).json({
                error: "quota_exceeded",
                kind: "API_CALL",
                message: err.message,
              });
            }
            return next(err);
          }
        }
        next();
      });
    });
  };
}
