// KeyAccessLog audit writer.
//
// Audit must NEVER break secret fetch — every write is fire-and-forget and
// errors are swallowed (logged to console.warn at most). The `KeyAccessLog`
// model is added by Agent 1A; if it doesn't exist yet on the prisma client,
// we degrade silently.

import prisma from "../prisma/index.js";

export interface KeyAccessAuditEntry {
  service: string;
  keyName: string;
  success: boolean;
  backend?: string;
  errorMessage?: string;
}

export function logKeyAccess(entry: KeyAccessAuditEntry): void {
  // Fire-and-forget. Never await, never throw.
  void writeKeyAccess(entry).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`[secrets/audit] failed to write KeyAccessLog: ${msg}`);
  });
}

async function writeKeyAccess(entry: KeyAccessAuditEntry): Promise<void> {
  const client = prisma as unknown as {
    keyAccessLog?: {
      create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    };
  };
  if (!client.keyAccessLog || typeof client.keyAccessLog.create !== "function") {
    // Model not generated yet (Agent 1A still in flight). Skip silently.
    return;
  }
  await client.keyAccessLog.create({
    data: {
      service: entry.service,
      keyName: entry.keyName,
      success: entry.success,
      backend: entry.backend ?? null,
      errorMessage: entry.errorMessage ?? null,
    },
  });
}
