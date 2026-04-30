/**
 * Boot-time seeding for CallWindowConfig (Phase 2 Agent 9).
 *
 * Idempotent: safe to call on every boot. Uses upsert keyed on `state`.
 * Existing rows that have been hand-edited (e.g. by an admin in Studio)
 * are NOT overwritten — only new states are inserted, and `source` lets
 * the operator know which rows were seeded vs manually overridden.
 *
 * NOTE: the times encoded here are a starting point for TCPA compliance.
 * They are NOT legal advice — operations should review per state with
 * counsel before sending traffic.
 */
import { prisma } from "@callora/shared";
import { buildStateDefaults } from "./callWindow.js";

export async function ensureCallWindowDefaults(): Promise<{ seeded: number }> {
  let seeded = 0;
  for (const row of buildStateDefaults()) {
    try {
      const existing = await prisma.callWindowConfig.findUnique({
        where: { state: row.state },
      });
      if (existing) continue;
      await prisma.callWindowConfig.create({
        data: {
          state: row.state,
          allowedFrom: row.allowedFrom,
          allowedTo: row.allowedTo,
          timezone: row.timezone,
          source: row.source,
        },
      });
      seeded++;
    } catch (err) {
      // Race-safe: another process may have inserted in the meantime.
      // Log and continue — don't crash boot over a benign collision.
      console.warn(`[tcpaSeed] could not seed ${row.state}:`, err);
    }
  }
  return { seeded };
}
