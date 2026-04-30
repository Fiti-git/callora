import { describe, it, expect } from "vitest";
import { injectSoftDeleteFilter } from "../lib/prismaSoftDelete.js";

/**
 * Logic-only tests for the Prisma soft-delete extension.
 *
 * The extension's heart is `injectSoftDeleteFilter` — a pure function that
 * rewrites the `where` clause for every read on a soft-delete-aware model.
 * Asserting it directly avoids spinning up Prisma + a database, so this file
 * runs in CI bootstrap without DATABASE_URL.
 *
 * The DB-touching end-to-end coverage (DELETE endpoint sets deletedAt,
 * cross-org soft-delete blocked) lives in tenant-isolation-extended.test.ts
 * which already gates on a live DB.
 */

describe("injectSoftDeleteFilter", () => {
  it("injects deletedAt: null on findMany for soft-delete-aware models", () => {
    const out = injectSoftDeleteFilter("Lead", "findMany", {
      where: { organizationId: "org_1" },
    });
    expect(out.where).toMatchObject({
      organizationId: "org_1",
      deletedAt: null,
    });
  });

  it("does NOT inject on findUnique (Prisma's strict where would reject it)", () => {
    // findUnique only accepts fields that participate in a unique constraint;
    // injecting `deletedAt: null` there causes PrismaClientValidationError
    // for the `findUnique({ where: { id, organizationId } })` tenant-scoping
    // idiom used throughout this codebase. Routes that need soft-delete
    // filtering on a unique lookup should call findFirst.
    const out = injectSoftDeleteFilter("Contact", "findUnique", {
      where: { id: "x" },
    });
    expect((out.where as any).deletedAt).toBeUndefined();
  });

  it("injects on count and groupBy too", () => {
    const a = injectSoftDeleteFilter("Lead", "count", {
      where: { campaignId: "c1" },
    });
    expect(a.where.deletedAt).toBe(null);

    const b = injectSoftDeleteFilter("Lead", "groupBy", {
      by: ["status"],
      where: { campaignId: "c1" },
    });
    expect((b as any).where.deletedAt).toBe(null);
  });

  it("does NOT modify writes (create/update/delete pass through)", () => {
    const create = injectSoftDeleteFilter("Lead", "create", {
      data: { businessName: "Acme" },
    });
    expect(create).not.toHaveProperty("where");

    const update = injectSoftDeleteFilter("Lead", "update", {
      where: { id: "l1" },
      data: { status: "CALLED" },
    });
    // Update args pass through unchanged — soft-delete is enforced at READ time.
    expect(update.where).toEqual({ id: "l1" });
  });

  it("does NOT modify reads on non-soft-delete models", () => {
    const out = injectSoftDeleteFilter("User", "findMany", {
      where: { organizationId: "org_1" },
    });
    expect(out.where).toEqual({ organizationId: "org_1" });
    expect(out.where).not.toHaveProperty("deletedAt");
  });

  it("respects opt-out via _includeDeleted: true and strips the marker", () => {
    const out = injectSoftDeleteFilter("Lead", "findMany", {
      where: { organizationId: "org_1" },
      _includeDeleted: true,
    });
    expect(out.where).toEqual({ organizationId: "org_1" });
    expect((out as any)._includeDeleted).toBeUndefined();
  });

  it("respects an explicit deletedAt mention in the user's where", () => {
    // Caller wants only soft-deleted rows — admin restore tooling, etc.
    const out = injectSoftDeleteFilter("Lead", "findMany", {
      where: {
        organizationId: "org_1",
        deletedAt: { not: null },
      },
    });
    expect((out.where as any).deletedAt).toEqual({ not: null });
  });

  it("respects deletedAt nested inside OR/AND/NOT", () => {
    const out = injectSoftDeleteFilter("Lead", "findMany", {
      where: {
        organizationId: "org_1",
        OR: [{ deletedAt: null }, { deletedAt: { not: null } }],
      },
    });
    // Filter not added — caller is being deliberate.
    expect((out.where as any).deletedAt).toBeUndefined();
  });

  it("applies to all listed soft-delete models", () => {
    for (const model of [
      "Lead",
      "Contact",
      "Deal",
      "Task",
      "Note",
      "Campaign",
      "CallLog",
      "Blacklist",
    ]) {
      const out = injectSoftDeleteFilter(model, "findMany", {
        where: { organizationId: "org_1" },
      });
      expect(out.where).toMatchObject({ deletedAt: null });
    }
  });
});
