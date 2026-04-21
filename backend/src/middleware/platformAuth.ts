import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

const PLATFORM_SECRET =
  process.env.PLATFORM_JWT_SECRET || "platform_fallback_secret";

export interface PlatformAuthRequest extends Request {
  platformUser?: {
    id: string;
    email: string;
    isSuperAdmin: boolean;
  };
}

export const authenticatePlatform = async (
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
    const decoded = jwt.verify(token, PLATFORM_SECRET) as any;
    const platformUser = await prisma.platformUser.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, isSuperAdmin: true },
    });
    if (!platformUser) {
      return res.status(401).json({ error: "Platform user not found" });
    }
    (req as PlatformAuthRequest).platformUser = platformUser;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const pu = (req as PlatformAuthRequest).platformUser;
  if (!pu?.isSuperAdmin) {
    return res.status(403).json({ error: "Super-admin required" });
  }
  next();
};

export function signPlatformToken(payload: { id: string; email: string }) {
  return jwt.sign(payload, PLATFORM_SECRET, { expiresIn: "12h" });
}
