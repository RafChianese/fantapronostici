import { prisma } from "./prisma.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";

const AUTO_LOCK_MINUTES_BEFORE_MATCHDAY = 30;
const MATCH_FALLBACK_DURATION_MINUTES = 180; // safety fallback if provider statuses lag

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

type AutoLockInfo = {
  matchday: number;
  windowStart: Date;
  expectedWindowEnd: Date;
  allFinished: boolean;
};

async function computeAutoLockInfo(now: Date): Promise<AutoLockInfo | null> {
  // Find the earliest match that isn't finished yet. That match's matchday is our "active/next" matchday.
  const next = await prisma.match.findFirst({
    where: { status: { not: "FINISHED" } },
    orderBy: { kickoffAt: "asc" },
  });

  if (!next) return null;

  const matchday = next.matchday ?? 1;

  const matches = await prisma.match.findMany({
    where: { matchday },
    orderBy: { kickoffAt: "asc" },
  });

  if (!matches.length) return null;

  const firstKickoff = new Date(matches[0].kickoffAt);
  const lastKickoff = new Date(matches[matches.length - 1].kickoffAt);

  // "Expected" end is a fallback used only if the provider hasn't updated statuses.
  const expectedWindowEnd = addMinutes(lastKickoff, MATCH_FALLBACK_DURATION_MINUTES);

  const allFinished = matches.every((m) => {
    if (m.status === "FINISHED") return true;
    // Fallback: if the match kickoff was long enough ago, consider it finished for the purpose of unlocking.
    const expectedEnd = addMinutes(new Date(m.kickoffAt), MATCH_FALLBACK_DURATION_MINUTES);
    return now >= expectedEnd;
  });

  return {
    matchday,
    windowStart: addMinutes(firstKickoff, -AUTO_LOCK_MINUTES_BEFORE_MATCHDAY),
    expectedWindowEnd,
    allFinished,
  };
}

export async function getLockInfo(leagueId: string) {
  // Auto-heal: ensure Setting/Rule exist for the league.
  await ensureLeagueConfig(leagueId);

  const setting = await prisma.setting.findUnique({ where: { leagueId } });
  if (!setting) throw new Error("Missing Setting row for league (unexpected).");

  const now = new Date();

  // lockMode: MANUAL_UNTIL | AUTO_MATCHDAY_30MIN
  if (setting.lockMode === "AUTO_MATCHDAY_30MIN") {
    const auto = await computeAutoLockInfo(now);

    if (!auto) {
      // No fixtures / all finished: treat as unlocked unless forced.
      const farFuture = addMinutes(now, 365 * 24 * 60);
      const lockedByTime = false
      const isLocked = setting.isForceLocked || lockedByTime;
      return { ...setting, lockUntil: farFuture, lockedByTime, isLocked, autoLock: null };
    }

    const lockedByTime = now >= auto.windowStart && !auto.allFinished
    const isLocked = setting.isForceLocked || lockedByTime;

    // IMPORTANT: expose lockUntil as the *start* time of the lock window so existing UI countdown stays meaningful.
    return {
      ...setting,
      lockUntil: auto.windowStart,
      lockedByTime,
      isLocked,
      autoLock: {
        matchday: auto.matchday,
        windowStart: auto.windowStart,
        expectedWindowEnd: auto.expectedWindowEnd,
        allFinished: auto.allFinished,
      },
    };
  }

  const lockedByTime = now >= setting.lockUntil;
  const isLocked = setting.isForceLocked || lockedByTime;
  return { ...setting, lockedByTime, isLocked, autoLock: null };
}

export async function assertPredictionsEditable(leagueId: string) {
  const info: any = await getLockInfo(leagueId);
  if (info.isLocked) {
    const msg = info.isForceLocked
      ? "Pronostici bloccati (lock manuale)"
      : (info.lockMode === "AUTO_MATCHDAY_30MIN"
        ? "Pronostici bloccati (lock automatico di giornata)"
        : "Pronostici bloccati (scadenza)");

    const until = info.lockUntil.toISOString();
    const err: any = new Error(msg);
    err.status = 403;
    err.payload = { message: msg, lockUntil: until, isLocked: true };
    throw err;
  }
}
