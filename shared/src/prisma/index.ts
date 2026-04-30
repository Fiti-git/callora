import { PrismaClient, Prisma } from "./generated/index.js";

// Soft-delete extension shared by all microservices that consume the
// generated Prisma client. Mirrors backend/src/lib/prismaSoftDelete.ts so
// that microservice routes (lead-service, crm-service, etc.) inherit the
// same automatic `deletedAt: null` filter and don't accidentally surface
// rows soft-deleted from a tenant DELETE endpoint or a GDPR action.

const SOFT_DELETE_MODELS = new Set([
  "Lead",
  "Contact",
  "Deal",
  "Task",
  "Note",
  "Campaign",
  "CallLog",
  "Blacklist",
]);

// findUnique / findUniqueOrThrow excluded — Prisma's strict where signature
// only accepts unique-constraint fields; injecting `deletedAt: null` breaks
// the `findUnique({ where: { id, organizationId } })` tenant-scoping idiom.
const READ_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

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
      async $allOperations({ model, operation, args, query }: any) {
        if (!SOFT_DELETE_MODELS.has(model) || !READ_OPS.has(operation)) {
          return query(args);
        }
        if (args && args._includeDeleted === true) {
          const { _includeDeleted, ...rest } = args;
          return query(rest);
        }
        const where = (args && args.where) || {};
        if (whereMentionsDeletedAt(where)) return query(args);
        return query({ ...args, where: { ...where, deletedAt: null } });
      },
    },
  },
});

const baseClient = new PrismaClient();
const prisma = baseClient.$extends(softDeleteExtension);

export default prisma as unknown as PrismaClient;
export { baseClient as rawPrisma };
export { prisma };
