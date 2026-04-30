import { describe, it, expect } from "vitest";
import { dedupVapiCallIds, findDuplicateGroups } from "../../scripts/dedup-vapi-call-ids.js";

process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.PLATFORM_JWT_SECRET ||= "test-platform-secret";
process.env.VAPI_WEBHOOK_SECRET ||= "test-vapi-webhook-secret";
process.env.DATABASE_URL ||= "postgresql://localhost:5432/none";

/**
 * In-memory mock of the slice of PrismaClient the dedup script touches.
 * Avoids the live DB so this test always runs.
 */
function makeMockPrisma(rows: Array<{ id: string; vapiCallId: string | null; createdAt: Date }>) {
  const state = { rows: [...rows], deletedIds: [] as string[] };

  const client = {
    callLog: {
      findMany: async ({ where, orderBy }: any) => {
        let out = state.rows;
        if (where?.vapiCallId?.not === null) {
          out = out.filter((r) => r.vapiCallId !== null);
        }
        if (orderBy?.createdAt === "asc") {
          out = [...out].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        return out;
      },
      deleteMany: async ({ where }: any) => {
        const ids: string[] = where.id.in;
        state.deletedIds.push(...ids);
        state.rows = state.rows.filter((r) => !ids.includes(r.id));
        return { count: ids.length };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  return { client, state };
}

describe("dedup-vapi-call-ids", () => {
  it("identifies duplicate groups by vapiCallId", async () => {
    const { client } = makeMockPrisma([
      { id: "a", vapiCallId: "vapi_1", createdAt: new Date("2026-04-01T10:00:00Z") },
      { id: "b", vapiCallId: "vapi_1", createdAt: new Date("2026-04-01T11:00:00Z") },
      { id: "c", vapiCallId: "vapi_1", createdAt: new Date("2026-04-01T12:00:00Z") },
      { id: "d", vapiCallId: "vapi_2", createdAt: new Date("2026-04-01T10:00:00Z") },
    ]);

    const groups = await findDuplicateGroups(client as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].vapiCallId).toBe("vapi_1");
    expect(groups[0].ids).toEqual(["a", "b", "c"]);
  });

  it("preserves the oldest row and deletes the rest when --apply is set", async () => {
    const { client, state } = makeMockPrisma([
      { id: "newest", vapiCallId: "vapi_dup", createdAt: new Date("2026-04-01T12:00:00Z") },
      { id: "oldest", vapiCallId: "vapi_dup", createdAt: new Date("2026-04-01T10:00:00Z") },
      { id: "middle", vapiCallId: "vapi_dup", createdAt: new Date("2026-04-01T11:00:00Z") },
      { id: "unique", vapiCallId: "vapi_solo", createdAt: new Date("2026-04-01T10:00:00Z") },
    ]);

    const result = await dedupVapiCallIds({
      apply: true,
      client: client as any,
      logger: { log: () => {} },
    });

    expect(result.groups).toBe(1);
    expect(result.deleted).toBe(2);
    expect(state.deletedIds.sort()).toEqual(["middle", "newest"]);
    // The oldest row of the dup group survives, plus the unique row.
    expect(state.rows.map((r) => r.id).sort()).toEqual(["oldest", "unique"]);
  });

  it("performs no deletes in dry-run mode (default)", async () => {
    const { client, state } = makeMockPrisma([
      { id: "a", vapiCallId: "vapi_1", createdAt: new Date("2026-04-01T10:00:00Z") },
      { id: "b", vapiCallId: "vapi_1", createdAt: new Date("2026-04-01T11:00:00Z") },
    ]);

    const result = await dedupVapiCallIds({ client: client as any, logger: { log: () => {} } });

    expect(result.groups).toBe(1);
    expect(result.deleted).toBe(0);
    expect(state.deletedIds).toEqual([]);
    expect(state.rows).toHaveLength(2);
  });

  it("returns zero when there are no duplicates", async () => {
    const { client } = makeMockPrisma([
      { id: "a", vapiCallId: "vapi_1", createdAt: new Date() },
      { id: "b", vapiCallId: "vapi_2", createdAt: new Date() },
      { id: "c", vapiCallId: null, createdAt: new Date() },
    ]);

    const result = await dedupVapiCallIds({
      apply: true,
      client: client as any,
      logger: { log: () => {} },
    });
    expect(result).toEqual({ groups: 0, deleted: 0 });
  });
});
