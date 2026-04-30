import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@callora/shared";

const SECRET = process.env.NEXTAUTH_SECRET || "fallback_secret";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    organizationId: string;
    email: string;
    role: string;
  };
}

/**
 * Internal factory: builds the auth middleware. When `enforceVerified` is true
 * (the default), the request is rejected with 403 EMAIL_NOT_VERIFIED for users
 * whose `emailVerified` flag is still false.
 */
function buildAuthMiddleware(enforceVerified: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, SECRET) as any;
      (req as AuthRequest).user = decoded;

      const userId: string = decoded.userId;

      const fullUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { emailVerified: true, tokenVersion: true } as any,
      });
      if (!fullUser) {
        return res.status(401).json({ error: "user not found" });
      }
      // Token-revocation check (B11) — mirrors backend monolith middleware.
      const claimedVersion =
        typeof decoded.tokenVersion === "number" ? decoded.tokenVersion : 0;
      const currentVersion = (fullUser as any).tokenVersion ?? 0;
      if (claimedVersion !== currentVersion) {
        return res.status(401).json({ error: "Unauthorized: Token revoked" });
      }
      if (enforceVerified && !fullUser.emailVerified) {
        return res.status(403).json({
          error: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email first",
        });
      }

      const org = await prisma.organization.findUnique({
        where: { id: decoded.organizationId },
        select: { status: true },
      });

      if (!org) {
        return res.status(401).json({ error: "Unauthorized: Organization not found" });
      }

      if (org.status === "SUSPENDED" || org.status === "CANCELED") {
        return res.status(402).json({
          error: "Account suspended. Please update your billing or contact support.",
        });
      }

      next();
    } catch (err: any) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
  };
}

/** Full auth check: token valid + email verified + org not suspended */
export const requireAuth = buildAuthMiddleware(true);

/** Token valid + org not suspended, but email verification NOT enforced.
 *  Use only on routes that must be accessible before verification (e.g. resend-verify). */
export const requireAuthAllowUnverified = buildAuthMiddleware(false);
