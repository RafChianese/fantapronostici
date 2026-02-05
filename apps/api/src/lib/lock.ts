import { prisma } from "./prisma.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";

export async function getLockInfo(leagueId: string) {
  // Auto-heal: ensure Setting/Rule exist for the league.
  await ensureLeagueConfig(leagueId);

  const setting = await prisma.setting.findUnique({ where: { leagueId } });
  if (!setting) throw new Error("Missing Setting row for league (unexpected).");

  const now = new Date();
  const lockedByTime = now >= setting.lockUntil;
  const isLocked = setting.isForceLocked || lockedByTime;
  return { ...setting, lockedByTime, isLocked };
}

export async function assertPredictionsEditable(leagueId: string) {
  const info = await getLockInfo(leagueId);
  if (info.isLocked) {
    const msg = info.isForceLocked ? "Pronostici bloccati (lock manuale)" : "Pronostici bloccati (scadenza)";
    const until = info.lockUntil.toISOString();
    const err: any = new Error(msg);
    err.status = 403;
    err.payload = { message: msg, lockUntil: until, isLocked: true };
    throw err;
  }
}
