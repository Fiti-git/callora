import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../src/lib/prisma.js";

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const name = process.env.PLATFORM_ADMIN_NAME || "Platform Admin";

  if (!email || !password) {
    console.error(
      "Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD in env before running."
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.platformUser.upsert({
    where: { email },
    update: { passwordHash, name, isSuperAdmin: true },
    create: { email, passwordHash, name, isSuperAdmin: true },
  });

  console.log(`✓ Platform admin ready: ${admin.email} (${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
