import { prisma } from "./prisma.js";

export type MonetizationConfig = {
  adsEnabled: boolean;
  demoAdsEnabled: boolean;
  unlockMinutes: number;
};

const DEFAULTS: MonetizationConfig = {
  adsEnabled: false,
  demoAdsEnabled: true,
  unlockMinutes: 5,
};

function isMissingTableError(err: unknown): boolean {
  // Prisma error code P2021 = table does not exist
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    // @ts-expect-error prisma error shape
    (err as any).code === "P2021"
  );
}

export async function getMonetizationConfig(): Promise<MonetizationConfig> {
  try {
    const row = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
    if (!row) return DEFAULTS;
    return {
      adsEnabled: row.adsEnabled,
      demoAdsEnabled: row.demoAdsEnabled,
      unlockMinutes: Math.max(1, Math.min(120, row.unlockMinutes || DEFAULTS.unlockMinutes)),
    };
  } catch (err) {
    // If migrations haven't been applied yet, don't crash the API.
    if (isMissingTableError(err)) return DEFAULTS;
    throw err;
  }
}

export async function ensureMonetizationConfig() {
  try {
    const exists = await prisma.superSetting.findFirst({ select: { id: true } });
    if (exists) return;
    await prisma.superSetting.create({ data: DEFAULTS });
  } catch (err) {
    // If the table doesn't exist yet, skip. This typically means migrations haven't run.
    if (isMissingTableError(err)) return;
    throw err;
  }
}
