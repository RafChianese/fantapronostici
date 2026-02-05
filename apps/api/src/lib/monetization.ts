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

export async function getMonetizationConfig(): Promise<MonetizationConfig> {
  const row = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
  if (!row) return DEFAULTS;
  return {
    adsEnabled: row.adsEnabled,
    demoAdsEnabled: row.demoAdsEnabled,
    unlockMinutes: Math.max(1, Math.min(120, row.unlockMinutes || DEFAULTS.unlockMinutes)),
  };
}

export async function ensureMonetizationConfig() {
  const exists = await prisma.superSetting.findFirst({ select: { id: true } });
  if (exists) return;
  await prisma.superSetting.create({ data: DEFAULTS });
}
