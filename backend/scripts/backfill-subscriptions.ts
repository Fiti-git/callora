import "dotenv/config";
import prisma from "../src/lib/prisma.js";

async function main() {
  const freePlan = await prisma.plan.findUnique({ where: { tier: "FREE" } });
  if (!freePlan) {
    console.error("FREE plan not found. Run seed-plans.ts first.");
    process.exit(1);
  }

  const orgs = await prisma.organization.findMany({
    where: { subscription: null },
    select: { id: true, name: true },
  });

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  for (const org of orgs) {
    await prisma.subscription.create({
      data: {
        organizationId: org.id,
        planId: freePlan.id,
        status: "TRIALING",
        trialEndsAt,
      },
    });
    await prisma.organization.update({
      where: { id: org.id },
      data: { status: "ACTIVE" },
    });
    console.log(`✓ Backfilled subscription for org ${org.name} (${org.id})`);
  }

  console.log(`Done. ${orgs.length} org(s) backfilled.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
