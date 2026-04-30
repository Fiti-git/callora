import { PrismaClient, Prisma } from "@prisma/client";
import { softDeleteExtension } from "./prismaSoftDelete.js";

// Singleton Prisma client extended with the soft-delete filter. The extended
// client is type-compatible with PrismaClient for all the operations the app
// uses, so existing imports (`import prisma from "../lib/prisma.js"`) keep
// working — they just transparently exclude soft-deleted rows now.
const SLOW_QUERY_LOG =
  process.env.NODE_ENV === "development" && process.env.PRISMA_QUERY_LOG === "1";

const baseClient = new PrismaClient(
  SLOW_QUERY_LOG
    ? {
        log: [
          { emit: "event", level: "query" },
          { emit: "stdout", level: "warn" },
          { emit: "stdout", level: "error" },
        ],
      }
    : undefined
);

if (SLOW_QUERY_LOG) {
  // Slow-query logger — gated behind PRISMA_QUERY_LOG=1 so production stays
  // quiet. Anything over 200ms is surfaced with target + where so devs can
  // spot N+1s and missing indexes during local repro.
  (baseClient as any).$on("query", (e: Prisma.QueryEvent) => {
    if (e.duration >= 200) {
      // eslint-disable-next-line no-console
      console.warn(
        `[prisma slow ${e.duration}ms] ${e.query} -- params=${e.params}`
      );
    }
  });
}

const prisma = baseClient.$extends(softDeleteExtension);

export default prisma as unknown as PrismaClient;
export { baseClient as rawPrisma };
