import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { requireEnv } from "../lib/env.js";

// No fallback — fail loud at module load if the secret is missing.
const SECRET = requireEnv("NEXTAUTH_SECRET");

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    organizationId: string;
    email: string;
    role: string;
    tokenVersion?: number;
    jti?: string;
  };
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET) as any;
    (req as AuthRequest).user = decoded;

    const [org, user] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: decoded.organizationId },
        select: { status: true },
      }),
      prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, tokenVersion: true },
      }),
    ]);

    if (!org) {
      return res.status(401).json({ error: "Unauthorized: Organization not found" });
    }
    if (!user) {
      return res.status(401).json({ error: "Unauthorized: User not found" });
    }

    // Token-revocation check (B11): a password reset bumps tokenVersion, which
    // invalidates every existing JWT signed with the old version.
    const tokenVersion = typeof decoded.tokenVersion === "number" ? decoded.tokenVersion : 0;
    if (tokenVersion !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ error: "Unauthorized: Token revoked" });
    }

    if (org.status === "SUSPENDED" || org.status === "CANCELED") {
      return res.status(402).json({
        error: "Organization access blocked",
        status: org.status,
      });
    }

    if (org.status === "PAST_DUE") {
      return res.status(402).json({
        error: "Payment required",
        status: org.status,
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

export const requireRole = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthRequest).user;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
    }
    next();
  };
