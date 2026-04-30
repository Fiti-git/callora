import { Prisma } from "@prisma/client";

/**
 * Prisma client extension that transparently filters out soft-deleted rows.
 *
 * Models with a `deletedAt` column where this is enforced:
 *   Lead, Contact, Deal, Task, Note, Campaign, CallLog, Blacklist
 *
 * It rewrites the `where` clause of every read operation to AND
 * `deletedAt: null`. Existing route code that does
 *   prisma.lead.findMany({ where: { organizationId } })
 * continues to work — soft-deleted leads simply don't show up.
 *
 * Opt-out: pass `_includeDeleted: true` at the top level of the query args.
 * It's stripped before the query is forwarded to Prisma, so it never reaches
 * the database. Use it sparingly — typically only the GDPR export path
 * needs it.
 *
 * Caveat — findUnique / findUniqueOrThrow are intentionally excluded.
 * Prisma's strict findUnique signature only accepts unique-constraint
 * fields, so injecting `deletedAt: null` breaks the very common
 * `findUnique({ where: { id, organizationId } })` tenant-scoping idiom
 * used throughout this codebase. Routes that want to hide soft-deleted
 * rows on a direct id lookup should switch that one call to `findFirst`
 * (which is automatically filtered).
 *
 * Mutations (create/update/delete/upsert/createMany/etc.) are NOT modified —
 * a tenant DELETE endpoint that wants soft-delete behaviour must explicitly
 * call `prisma.X.update({ data: { deletedAt: new Date() } })`.
 */

const SOFT_DELETE_MODELS = new Set([
  "Lead",
  "Contact",
  "Deal",
  "Task",
  "Note",
  "Campaign",
  "CallLog",
  "Blacklist",
  // Phase 3 Agent 10 — email marketing soft-deletable models. Sends, list
  // members, and automation runs are immutable history → no soft-delete.
  "EmailCampaign",
  "EmailRecipientList",
  "EmailTemplate",
  "EmailAutomation",
  // Phase 3 Agent 12 — tenant-data soft-delete.
  "TenantWebhook",
]);

// findUnique / findUniqueOrThrow are NOT auto-filtered. Prisma's strict
// findUnique signature only accepts fields that form a unique constraint;
// silently injecting `deletedAt: null` there causes
// `PrismaClientValidationError` for the very common
// `findUnique({ where: { id, organizationId } })` tenant-scoping pattern.
// Routes that need to skip soft-deleted rows on a unique lookup should call
// `findFirst` instead — which IS filtered.
const READ_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Pure helper — exported so the soft-delete tests can assert filter injection
 * without spinning up a Prisma client. Given the model and operation, mutates
 * `args` to include `deletedAt: null` (unless `_includeDeleted` is set).
 * Returns the (possibly modified) args.
 */
export function injectSoftDeleteFilter<TArgs extends Record<string, any>>(
  model: string,
  operation: string,
  args: TArgs
): TArgs {
  if (!SOFT_DELETE_MODELS.has(model)) return args;
  if (!READ_OPS.has(operation)) return args;

  // Opt-out for GDPR export and other administrative reads.
  if (args && (args as any)._includeDeleted === true) {
    const { _includeDeleted, ...rest } = args as any;
    return rest as TArgs;
  }

  const where = (args && args.where) || {};

  // If the caller already mentions deletedAt anywhere, respect it — they're
  // doing something deliberate (e.g. listing only soft-deleted rows for an
  // admin restore tool).
  if (whereMentionsDeletedAt(where)) return args;

  return {
    ...args,
    where: { ...where, deletedAt: null },
  };
}

function whereMentionsDeletedAt(where: any): boolean {
  if (!where || typeof where !== "object") return false;
  if ("deletedAt" in where) return true;
  for (const key of ["AND", "OR", "NOT"]) {
    const v = where[key];
    if (Array.isArray(v) && v.some(whereMentionsDeletedAt)) return true;
    if (v && typeof v === "object" && !Array.isArray(v) && whereMentionsDeletedAt(v)) return true;
  }
  return false;
}

export const softDeleteExtension = Prisma.defineExtension({
  name: "callora-soft-delete",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const next = injectSoftDeleteFilter(model as string, operation as string, args as any);
        return query(next);
      },
    },
  },
});
