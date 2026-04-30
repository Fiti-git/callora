/**
 * DNC list helpers (Phase 2 Agent 9).
 *
 * Checks both:
 *   - tenant-private DNC entries (organizationId = orgId), and
 *   - platform-wide DNC entries (organizationId IS NULL)
 *
 * Returns the first match found.
 */
import prisma from "./prisma.js";
import { hashPhone, normalizeE164 } from "./phone.js";

export interface DNCResult {
  onDnc: boolean;
  source?: string;
}

export async function isOnDNC(phone: string, orgId: string): Promise<DNCResult> {
  const e164 = normalizeE164(phone);
  if (!e164) return { onDnc: false };
  const phoneHash = hashPhone(e164);

  const row = await prisma.dNCEntry.findFirst({
    where: {
      phoneHash,
      OR: [{ organizationId: orgId }, { organizationId: null }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { onDnc: false };
  return { onDnc: true, source: row.source };
}
