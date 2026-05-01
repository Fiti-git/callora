// FTC National Do Not Call Registry fallback.
//
// TODO(prod): wire this to the real FTC DNC API. Using the live registry
// requires Telemarketer registration with the FTC and downloading the DNC
// data feed (organized per area code). The recommended pattern is:
//   1. Nightly cron downloads area-code partitions into our `DncEntry`
//      cache with source="ftc" and a 30-day expiresAt window.
//   2. This live fallback is only consulted when the local cache row is
//      missing or expired — not on every call (cost + latency).
//
// Until that's wired, this stub returns blocked=false so calls aren't held
// up. Compliance still goes through the platform `DncEntry` cache and the
// per-tenant DNCEntry list (see ./dnc.ts).

export interface FtcDncResult {
  blocked: boolean;
  reason?: string;
}

export async function checkFtcDnc(_phoneE164: string): Promise<FtcDncResult> {
  // Intentionally a no-op until FTC registration is complete.
  return { blocked: false };
}
