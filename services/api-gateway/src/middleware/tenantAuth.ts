import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface TenantJwtPayload {
  sub?: string;
  userId?: string;
  id?: string;
  organizationId?: string;
  orgId?: string;
  role?: string;
  [key: string]: unknown;
}

const SECRET = process.env.NEXTAUTH_SECRET;

export default function tenantAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!SECRET) {
    res.status(500).json({ error: "NEXTAUTH_SECRET not configured" });
    return;
  }

  const header = req.headers["authorization"];
  if (!header || Array.isArray(header) || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const decoded = jwt.verify(token, SECRET) as TenantJwtPayload;

    const userId = decoded.userId ?? decoded.sub ?? decoded.id;
    const organizationId = decoded.organizationId ?? decoded.orgId;
    const role = decoded.role;

    if (userId) req.headers["x-user-id"] = String(userId);
    if (organizationId)
      req.headers["x-organization-id"] = String(organizationId);
    if (role) req.headers["x-user-role"] = String(role);

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
