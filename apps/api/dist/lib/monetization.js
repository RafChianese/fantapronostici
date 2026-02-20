import { prisma } from "./prisma.js";
const DEFAULTS = {
    adsEnabled: false,
    demoAdsEnabled: true,
    unlockMinutes: 5,
};
function isMissingTableError(err) {
    // Prisma error code P2021 = table does not exist
    return (typeof err === "object" &&
        err !== null &&
        "code" in err &&
        err.code === "P2021");
}
export async function getMonetizationConfig() {
    try {
        const row = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
        if (!row)
            return DEFAULTS;
        return {
            adsEnabled: row.adsEnabled,
            demoAdsEnabled: row.demoAdsEnabled,
            unlockMinutes: Math.max(1, Math.min(120, row.unlockMinutes || DEFAULTS.unlockMinutes)),
        };
    }
    catch (err) {
        // If migrations haven't been applied yet, don't crash the API.
        if (isMissingTableError(err))
            return DEFAULTS;
        throw err;
    }
}
export async function ensureMonetizationConfig() {
    try {
        const exists = await prisma.superSetting.findFirst({ select: { id: true } });
        if (exists)
            return;
        await prisma.superSetting.create({ data: DEFAULTS });
    }
    catch (err) {
        // If the table doesn't exist yet, skip. This typically means migrations haven't run.
        if (isMissingTableError(err))
            return;
        throw err;
    }
}
