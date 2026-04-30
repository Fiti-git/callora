/**
 * dedup-vapi-call-ids.ts
 *
 * One-off cleanup: finds CallLog rows that share a `vapiCallId` and keeps the
 * OLDEST (lowest `createdAt`) row of each group, deleting the rest.
 *
 * MUST be run with `--apply` BEFORE the migration that adds
 * `CallLog.vapiCallId @unique` is applied to a database that may contain
 * duplicates. Otherwise `CREATE UNIQUE INDEX` will fail.
 *
 * Usage:
 *   npm run dedup:vapi-call-ids                # dry-run (default)
 *   npm run dedup:vapi-call-ids -- --apply     # actually delete
 */

import "dotenv/config";
import prisma from "../src/lib/prisma.js";

interface DuplicateGroup {
  vapiCallId: string;
  ids: string[]; // ordered oldest -> newest
}

export async function findDuplicateGroups(
  client: { callLog: { findMany: Function } } = prisma as any
): Promise<DuplicateGroup[]> {
  const rows: Array<{ id: string; vapiCallId: string | null; createdAt: Date }> =
    await client.callLog.findMany({
      where: { vapiCallId: { not: null } },
      select: { id: true, vapiCallId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

  const groups = new Map<string, DuplicateGroup>();
  for (const row of rows) {
    if (!row.vapiCallId) continue;
    const existing = groups.get(row.vapiCallId);
    if (existing) {
      existing.ids.push(row.id);
    } else {
      groups.set(row.vapiCallId, { vapiCallId: row.vapiCallId, ids: [row.id] });
    }
  }
  return Array.from(groups.values()).filter((g) => g.ids.length > 1);
}

export async function dedupVapiCallIds(
  options: { apply?: boolean; client?: any; logger?: { log: (msg: string) => void } } = {}
): Promise<{ groups: number; deleted: number }> {
  const apply = options.apply ?? false;
  const client = options.client ?? prisma;
  const logger = options.logger ?? console;

  const dupGroups = await findDuplicateGroups(client);
  // Slice off the first id (oldest) of each group; rest get deleted.
  const idsToDelete: string[] = dupGroups.flatMap((g) => g.ids.slice(1));

  if (dupGroups.length === 0) {
    logger.log("No duplicate vapiCallId rows found.");
    return { groups: 0, deleted: 0 };
  }

  if (!apply) {
    logger.log(
      `[DRY-RUN] Found ${dupGroups.length} duplicate groups, would delete ${idsToDelete.length} rows. ` +
        `Re-run with --apply to delete.`
    );
    return { groups: dupGroups.length, deleted: 0 };
  }

  await client.$transaction([
    client.callLog.deleteMany({ where: { id: { in: idsToDelete } } }),
  ]);

  logger.log(`Found ${dupGroups.length} duplicate groups, deleted ${idsToDelete.length} rows.`);
  return { groups: dupGroups.length, deleted: idsToDelete.length };
}

// CLI entry point. Skip when imported (e.g., by tests).
const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`
  || process.argv[1]?.endsWith("dedup-vapi-call-ids.ts");
if (isMain) {
  const apply = process.argv.includes("--apply");
  dedupVapiCallIds({ apply })
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error("dedup-vapi-call-ids failed:", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
