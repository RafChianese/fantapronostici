import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma.js";
import { ensureMonetizationConfig } from "./lib/monetization.js";
/**
 * Idempotent bootstrap to make the app usable immediately after a fresh DB.
 * This runs at API startup and is safe to run multiple times.
 */
export async function bootstrapDefaults() {
    // If the DB is not reachable yet (e.g., container still starting), just fail silently.
    // The first request that needs data will work after DB becomes available.
    try {
        await prisma.$queryRaw `SELECT 1`;
    }
    catch {
        return;
    }
    // SuperSetting (global) - required by monetization / ads logic.
    await ensureMonetizationConfig();
    // Super Admin (global)
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
}
