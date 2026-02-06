import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function ensureSuperSetting() {
  // Keep this minimal: the app expects at least 1 superSetting row for monetization/ads config.
  const existing = await prisma.superSetting.findFirst({ select: { id: true } });
  if (existing) return;
  await prisma.superSetting.create({
    data: {
      adsEnabled: false,
      demoAdsEnabled: true,
      unlockMinutes: 5,
      // Provider-related fields (if present in schema) are nullable.
    },
  });
}

async function main() {
  // IMPORTANT: this seed is intentionally "clean".
  // It does NOT create demo leagues, demo users, or matches.

  await ensureSuperSetting();

  const superEmail = "superadmin@example.com";
  const superPassword = "Admin123!";
  const superHash = await bcrypt.hash(superPassword, 10);

  await prisma.user.upsert({
    where: { email: superEmail },
    update: {
      passwordHash: superHash,
      globalRole: "SUPER_ADMIN",
      isActive: true,
      displayName: "Super Admin",
    },
    create: {
      email: superEmail,
      displayName: "Super Admin",
      passwordHash: superHash,
      globalRole: "SUPER_ADMIN",
      isActive: true,
    },
  });

  console.log("Seed completed.");
  console.log("SuperAdmin:", superEmail, "/", superPassword);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
