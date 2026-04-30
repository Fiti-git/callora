/**
 * Public API key authentication (Phase 3 Agent 12).
 *
 * Resolves the bearer token in the Authorization header against the
 * `PublicApiKey` table. The raw key is hashed with sha256 + DNC_HASH_PEPPER
 * (re-using the platform pepper — keys are server-side secrets just like
 * DNC entries) and looked up via the unique `keyHash`.
 *
 * On success: sets `req.user = { userId: '<system>', organizationId, role: 'API', email: '', scopes }`
 *   so downstream route handlers that rely on `req.user.organizationId` keep working.
 *
 * Falls through (`next()` without setting req.user) when no Bearer header is
 * present OR when the header doesn't match a public-API key prefix — letting
 * the JWT-based `authenticate` middleware run next. This makes /api/v1/*
 * routes accept *either* auth method.
 *
 * Quota: callers should call `meterAndCharge(orgId, 'API_CALL', 1)` after
 * resolving auth (whether via API key or JWT) so all /api/v1/* hits are
 * counted uniformly.
 */
import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { requireEnv } from "../lib/env.js";
import type { AuthRequest } from "./auth.js";
import { meterAndCharge, QuotaExceededError } from "../lib/quota.js";

// Public API keys are prefixed `cal_` for easy identification + to let
// apiKeyAuth fall through cleanly when the token is a JWT.
export const API_KEY_PREFIX = "cal_";

let _pepper: string | null = null;
function pepper(): string {
  if (_pepper === null) _pepper = requireEnv("DNC_HASH_PEPPER");
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

/**
 * Try API-key auth. If the Bearer token doesn't look like a public API key,
 * fall through to next middleware (e.g. the JWT `authenticate`).
 */
export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  const token = header.slice("Bearer ".length).trim();
  if (!token.startsWith(API_KEY_PREFIX)) return next();

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
 * either path resolves, meters one API_CALL.
 */
export function requireApiOrJwt(authenticate: (req: Request, res: Response, next: NextFunction) => unknown) {
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
