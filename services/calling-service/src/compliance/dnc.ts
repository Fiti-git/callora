// DNC scrubbing — checks both platform-wide `DncEntry` (Wave 1 cache, keyed
// by raw phoneE164) and the legacy per-tenant `DNCEntry` (keyed by salted
// phoneHash). Returns blocked + which list matched.

import crypto from "node:crypto";
import { prisma } from "@callora/shared";

export interface DncCheckResult {
  blocked: boolean;
  source?: "platform" | "tenant" | "platform_ftc";
  reason?: string;
}

function hashPhone(e164: string): string | null {
  // The legacy per-tenant DNCEntry table stores a salted SHA-256. If the
  // pepper isn't configured we cannot check it — fail closed by skipping
  // that check (the platform list is still consulted).
  const pepper = process.env.DNC_HASH_PEPPER;
  if (!pepper) return null;
  return crypto.createHash("sha256").update(`${pepper}|${e164}`).digest("hex");
}

/**
 * isOnDnc — checks both the platform-wide DncEntry cache and the per-tenant
 * DNCEntry list. Default-deny: if the DB query throws, return blocked.
 */
export async function isOnDnc(
  phoneE164: string,
  orgId: string
): Promise<DncCheckResult> {
  // 1. Platform-wide cache (raw E.164, may have expiresAt)
  try {
    const platformRow = await prisma.dncEntry.findUnique({
      where: { phoneE164 },
    });
    if (platformRow) {
      const isExpired =
        platformRow.expiresAt !== null &&
        platformRow.expiresAt !== undefined &&
        platformRow.expiresAt.getTime() < Date.now();
      if (!isExpired) {
        return {
          blocked: true,
          source: "platform",
          reason: `dnc_platform:${platformRow.source}`,
        };
      }
    }
  } catch (err) {
    // Default-deny on uncertainty.
    return {
      blocked: true,
      reason: "compliance_check_failed:platform_dnc",
    };
  }

  // 2. Per-tenant DNCEntry (salted phoneHash, may also be a global row with
  //    organizationId === null per the existing schema).
  const phoneHash = hashPhone(phoneE164);
  if (phoneHash) {
    try {
      const tenantRow = await prisma.dNCEntry.findFirst({
        where: {
          phoneHash,
          OR: [{ organizationId: orgId }, { organizationId: null }],
        },
        orderBy: { createdAt: "desc" },
      });
      if (tenantRow) {
        return {
          blocked: true,
          source: "tenant",
          reason: `dnc_tenant:${tenantRow.source}`,
        };
      }
    } catch (err) {
      return {
        blocked: true,
        reason: "compliance_check_failed:tenant_dnc",
      };
    }
  }

  return { blocked: false };
}
