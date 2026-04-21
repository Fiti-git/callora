import "dotenv/config";
import prisma from "../src/lib/prisma.js";

const plans = [
  {
    tier: "FREE" as const,
    name: "Free Trial",
    stripePriceId: process.env.STRIPE_PRICE_FREE || "price_free_placeholder",
    monthlyCallQuota: 25,
    monthlyLeadQuota: 100,
    seatLimit: 2,
    priceCents: 0,
  },
  {
    tier: "STARTER" as const,
    name: "Starter",
    stripePriceId: process.env.STRIPE_PRICE_STARTER || "price_starter_placeholder",
    monthlyCallQuota: 500,
    monthlyLeadQuota: 2000,
    seatLimit: 5,
    priceCents: 4900,
  },
  {
    tier: "PRO" as const,
    name: "Pro",
    stripePriceId: process.env.STRIPE_PRICE_PRO || "price_pro_placeholder",
    monthlyCallQuota: 2500,
    monthlyLeadQuota: 10000,
    seatLimit: 20,
    priceCents: 19900,
  },
  {
    tier: "ENTERPRISE" as const,
    name: "Enterprise",
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE || "price_enterprise_placeholder",
    monthlyCallQuota: 25000,
    monthlyLeadQuota: 100000,
    seatLimit: 100,
    priceCents: 99900,
  },
];

async function main() {
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { tier: p.tier },
      update: p,
      create: p,
    });
    console.log(`✓ Seeded plan ${p.tier}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
