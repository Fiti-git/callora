/**
 * Number provisioner.
 *
 * Owns the lifecycle of OrgVapiNumber rows:
 *   - provisionDedicated(orgId) — buy a number when an org becomes paid
 *   - releaseNumber(orgId)      — release on cancel / long PAST_DUE
 *   - rotatePoolNumber(id)      — release + replace a pool number weekly
 *
 * All operations are idempotent: every entry-point checks current state
 * before touching Vapi so a retried job never double-buys or double-releases.
 *
 * SCHEMA NOTE
 * -----------
 * `OrgVapiNumber.organizationId` is currently `String @unique` (non-null).
 * Pool numbers therefore need a "tenant" to attach to. To stay schema-safe
 * without a migration, we lazily create a single sentinel Organization row
 * (`POOL_ORG_ID`) and hang every POOL row off it via a synthetic
 * `vapiPhoneNumberId`-shaped key. This keeps the column non-null while
 * letting many POOL numbers coexist (the @unique applies to organizationId,
 * so we cannot have multiple rows with the *same* org — which means in
 * practice, pool rows live on distinct sentinel orgs OR we relax the unique
 * via a follow-up migration. Until that migration, we model the pool as
 * separate sentinel orgs prefixed with `POOL_ORG_PREFIX` so each pool
 * number gets its own row legally.
 *
 * Recommended follow-up: change `organizationId String @unique` to
 *   `organizationId String? @unique` and drop the sentinel rows. See
 *   the report for details.
 */

import { prisma } from "@callora/shared";
import {
  purchaseNumber,
  releaseNumber as vapiReleaseNumber,
  PurchasedNumber,
} from "./vapiClient.js";

const DEFAULT_AREA_CODE = process.env.DEFAULT_AREA_CODE ?? "415";
const DEFAULT_NUMBER_COST_CENTS = Number(
  process.env.VAPI_NUMBER_MONTHLY_CENTS ?? "200"
);

export type NumberProvisioningMode = "vapi-managed" | "byo" | "pool";

export function getProvisioningMode(): NumberProvisioningMode {
  const raw = (process.env.NUMBER_PROVISIONING_MODE ?? "vapi-managed").toLowerCase();
  if (raw === "byo" || raw === "pool" || raw === "vapi-managed") {
    return raw as NumberProvisioningMode;
  }
  return "vapi-managed";
}

const POOL_ORG_PREFIX = "pool::";
const POOL_ROTATE_THRESHOLD_DAYS = 7;
const POOL_SPAM_SCORE_THRESHOLD = Number(process.env.POOL_SPAM_THRESHOLD ?? "0.6");

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

async function ensurePoolSentinelOrg(suffix: string): Promise<string> {
  const id = `${POOL_ORG_PREFIX}${suffix}`;
  await prisma.organization.upsert({
    where: { id },
    update: {},
    create: {
      id,
      name: `__pool_sentinel_${suffix}`,
      status: "SUSPENDED", // never accept tenant traffic
    },
  });
  return id;
}

async function pickAreaCodeForOrg(orgId: string): Promise<string> {
  // Best-effort: pick the most common area-code prefix among the org's
  // recent leads. Falls back to DEFAULT_AREA_CODE.
  try {
    const leads = await prisma.lead.findMany({
      where: { organizationId: orgId, phone: { not: null } },
      select: { phone: true },
      take: 200,
      orderBy: { createdAt: "desc" },
    });
    const counts = new Map<string, number>();
    for (const l of leads) {
      const phone = l.phone ?? "";
      const digits = phone.replace(/[^0-9]/g, "");
      // crude US area code extraction
      const code = digits.length === 11 ? digits.slice(1, 4) : digits.slice(0, 3);
      if (code.length === 3) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    for (const [k, v] of counts) {
      if (v > bestN) {
        best = k;
        bestN = v;
      }
    }
    return best ?? DEFAULT_AREA_CODE;
  } catch {
    return DEFAULT_AREA_CODE;
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Buy and assign a dedicated Vapi number for `orgId`. Idempotent:
 *   - if the org already has an ACTIVE OrgVapiNumber → return it
 *   - if it has a RELEASED row → buy a new one and overwrite
 */
export async function provisionDedicated(
  orgId: string,
  areaCodeOverride?: string
): Promise<{
  vapiPhoneNumberId: string;
  e164: string;
  alreadyProvisioned: boolean;
}> {
  const existing = await prisma.orgVapiNumber.findUnique({
    where: { organizationId: orgId },
  });
  if (existing && existing.status === "ACTIVE") {
    return {
      vapiPhoneNumberId: existing.vapiPhoneNumberId,
      e164: existing.e164,
      alreadyProvisioned: true,
    };
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  if (!org) throw new Error(`org ${orgId} not found`);

  const mode = getProvisioningMode();
  if (mode === "byo") {
    throw new Error(`BYO number not configured for org ${orgId}`);
  }

  // Determine area code:
  //   - explicit override (signup-supplied) wins
  //   - then the most-common code among recent leads (pool/legacy heuristic)
  //   - else default
  const areaCode =
    (areaCodeOverride && /^\d{3}$/.test(areaCodeOverride)
      ? areaCodeOverride
      : null) ?? (await pickAreaCodeForOrg(orgId));

  // Both `vapi-managed` and `pool` modes ultimately call vapiClient.purchaseNumber
  // with provider:"vapi" + numberDesiredAreaCode. The pool branch differs only
  // in where the resulting row lives (handled by addPoolNumber, not here).
  const bought: PurchasedNumber = await purchaseNumber({
    orgName: org.name,
    areaCode,
    provider: "vapi",
  });

  await prisma.orgVapiNumber.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      vapiPhoneNumberId: bought.id,
      e164: bought.number,
      provider: "vapi",
      status: "ACTIVE",
      monthlyCostCents: DEFAULT_NUMBER_COST_CENTS,
      provisionedAt: new Date(),
      areaCode,
    },
    update: {
      vapiPhoneNumberId: bought.id,
      e164: bought.number,
      provider: "vapi",
      status: "ACTIVE",
      monthlyCostCents: DEFAULT_NUMBER_COST_CENTS,
      provisionedAt: new Date(),
      releasedAt: null,
      areaCode,
    },
  });

  // Mirror the new number on the legacy Organization columns so existing
  // call paths that read Organization.vapiPhoneNumberId continue to work.
  await prisma.organization.update({
    where: { id: orgId },
    data: { vapiPhoneNumberId: bought.id, vapiPhoneNumber: bought.number },
  });

  return {
    vapiPhoneNumberId: bought.id,
    e164: bought.number,
    alreadyProvisioned: false,
  };
}

/**
 * Release the dedicated number for `orgId`. Idempotent:
 *   - no row → no-op
 *   - row already RELEASED → no-op
 */
export async function releaseForOrg(orgId: string): Promise<{ released: boolean }> {
  const row = await prisma.orgVapiNumber.findUnique({
    where: { organizationId: orgId },
  });
  if (!row || row.status === "RELEASED") return { released: false };

  await vapiReleaseNumber(row.vapiPhoneNumberId);

  await prisma.orgVapiNumber.update({
    where: { organizationId: orgId },
    data: { status: "RELEASED", releasedAt: new Date() },
  });

  // Clear legacy mirror columns.
  await prisma.organization.update({
    where: { id: orgId },
    data: { vapiPhoneNumberId: null, vapiPhoneNumber: null },
  });

  return { released: true };
}

/**
 * Rotate a single POOL number. Releases the old SID, buys a new one with
 * the same area code, and updates the row in place. Idempotent in the
 * sense that if the underlying Vapi number is already gone (404) we still
 * proceed to buy a replacement.
 */
export async function rotatePoolNumber(poolRowId: string): Promise<void> {
  const row = await prisma.orgVapiNumber.findUnique({ where: { id: poolRowId } });
  if (!row) return;
  if (row.status !== "POOL") return;

  await vapiReleaseNumber(row.vapiPhoneNumberId);

  const bought = await purchaseNumber({
    orgName: "pool",
    areaCode: row.areaCode ?? DEFAULT_AREA_CODE,
  });

  await prisma.orgVapiNumber.update({
    where: { id: row.id },
    data: {
      vapiPhoneNumberId: bought.id,
      e164: bought.number,
      lastRotatedAt: new Date(),
      spamScore: 0,
    },
  });
}

/**
 * Add a new POOL number with the given area code. Used during seeding /
 * topping up the pool. Each POOL number gets its own sentinel org row to
 * satisfy the @unique constraint until the schema is relaxed.
 */
export async function addPoolNumber(areaCode = DEFAULT_AREA_CODE): Promise<string> {
  const sentinelSuffix = `${areaCode}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sentinelOrgId = await ensurePoolSentinelOrg(sentinelSuffix);

  const bought = await purchaseNumber({ orgName: "pool", areaCode });

  const row = await prisma.orgVapiNumber.create({
    data: {
      organizationId: sentinelOrgId,
      vapiPhoneNumberId: bought.id,
      e164: bought.number,
      provider: "vapi",
      status: "POOL",
      monthlyCostCents: DEFAULT_NUMBER_COST_CENTS,
      provisionedAt: new Date(),
      areaCode,
    },
  });
  return row.id;
}

/**
 * Pick a pool number for a trial-org call. Best-effort area-code match;
 * falls back to any POOL row.
 */
export async function pickPoolNumber(preferredAreaCode?: string): Promise<{
  vapiPhoneNumberId: string;
  e164: string;
} | null> {
  if (preferredAreaCode) {
    const match = await prisma.orgVapiNumber.findFirst({
      where: { status: "POOL", areaCode: preferredAreaCode },
      orderBy: { lastRotatedAt: "desc" },
    });
    if (match) {
      return {
        vapiPhoneNumberId: match.vapiPhoneNumberId,
        e164: match.e164,
      };
    }
  }
  const any = await prisma.orgVapiNumber.findFirst({
    where: { status: "POOL" },
    orderBy: { lastRotatedAt: "desc" },
  });
  if (!any) return null;
  return { vapiPhoneNumberId: any.vapiPhoneNumberId, e164: any.e164 };
}

/**
 * Returns POOL rows that need rotation:
 *   - lastRotatedAt is null OR older than POOL_ROTATE_THRESHOLD_DAYS
 *   - OR spamScore exceeds POOL_SPAM_SCORE_THRESHOLD
 */
export async function findPoolNumbersDueForRotation(): Promise<string[]> {
  const cutoff = new Date(Date.now() - POOL_ROTATE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.orgVapiNumber.findMany({
    where: {
      status: "POOL",
      OR: [
        { lastRotatedAt: null },
        { lastRotatedAt: { lt: cutoff } },
        { spamScore: { gte: POOL_SPAM_SCORE_THRESHOLD } },
      ],
    },
    select: { id: true },
  });
  return rows.map((r: { id: string }) => r.id);
}
