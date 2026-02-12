import { prisma } from "./prisma.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";
import { decodeLeagueSettings, isAutoSentinel, stripMs, type PredictionMode } from "./leagueConfigEncoding.js";

const AUTO_FALLBACK_HOURS = 12;

function allFinished(matches: { status: any }[]) {
  return matches.length > 0 && matches.every((m) => m.status === "FINISHED");
}

function getMatchdayBounds(matches: { kickoffAt: Date }[]) {
  const sorted = [...matches].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
  const first = sorted[0]?.kickoffAt;
  const last = sorted[sorted.length - 1]?.kickoffAt;
  return { first, last };
}

async function computeAutoLockInfo(leagueId: string, predictionMode: PredictionMode, offsetMinutes: number) {
  const now = new Date();
  const matches = await prisma.match.findMany({
    orderBy: [{ matchday: "asc" }, { kickoffAt: "asc" }],
    select: { id: true, matchday: true, kickoffAt: true, status: true },
  });

  // No matches yet: keep unlocked.
  if (!matches.length) {
    return {
      lockUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      lockedByTime: false,
      isLocked: false,
      auto: { targetMatchday: null as any, startAt: null as any, endAt: null as any },
    };
  }

  const byMd = new Map<number, typeof matches>();
  for (const m of matches) {
    const md = Number(m.matchday || 1);
    if (!byMd.has(md)) byMd.set(md, [] as any);
    (byMd.get(md) as any).push(m);
  }
  const mds = Array.from(byMd.keys()).sort((a, b) => a - b);

  // Tournament-pre: lock relative to the very first match of matchday 1 (or earliest kickoff overall).
  if (predictionMode === "TOURNAMENT_PRE") {
    const day1 = byMd.get(1);
    const candidate = (day1 && day1.length ? day1 : matches) as any;
    const { first } = getMatchdayBounds(candidate);
    const startAt = new Date(first.getTime() - offsetMinutes * 60_000);
    const lockedByTime = now >= startAt;
    return {
      lockUntil: startAt,
      lockedByTime,
      isLocked: lockedByTime,
      auto: { targetMatchday: 1, startAt, endAt: null as any },
    };
  }

  // MATCHDAY_BY_MATCHDAY: find ongoing (started but not concluded) matchday, else upcoming.
  const startedNotConcluded = mds.find((md) => {
    const ms = byMd.get(md) as any;
    const started = ms.some((m: any) => m.status !== "NOT_STARTED" || m.kickoffAt.getTime() <= now.getTime());
    const concluded = allFinished(ms);
    return started && !concluded;
  });

  const upcomingMatch = matches
    .filter((m) => m.status === "NOT_STARTED" && m.kickoffAt.getTime() > now.getTime())
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime())[0];
  const upcomingMd = upcomingMatch ? Number(upcomingMatch.matchday || 1) : null;

  const targetMd = (startedNotConcluded ?? upcomingMd ?? mds[mds.length - 1]) as number;
  const targetMatches = byMd.get(targetMd) as any;
  const { first, last } = getMatchdayBounds(targetMatches);
  const startAt = new Date(first.getTime() - offsetMinutes * 60_000);

  // Unlock when all finished; fallback: last kickoff + N hours.
  const fallbackEndAt = new Date(last.getTime() + AUTO_FALLBACK_HOURS * 60 * 60_000);
  const concluded = allFinished(targetMatches);

  const lockedByTime = now >= startAt;
  const isLocked = lockedByTime && !concluded && now < fallbackEndAt;

  return {
    lockUntil: startAt,
    lockedByTime,
    isLocked,
    auto: { targetMatchday: targetMd, startAt, endAt: concluded ? now : fallbackEndAt },
  };
}

export async function getLockInfo(leagueId: string) {
  // Auto-heal: ensure Setting/Rule exist for the league.
  await ensureLeagueConfig(leagueId);

  const setting = await prisma.setting.findUnique({ where: { leagueId } });
  if (!setting) throw new Error("Missing Setting row for league (unexpected).");

  const decoded = decodeLeagueSettings(setting.lockUntil);

  // MANUAL: lockUntil is the actual deadline. Ignore milliseconds in comparisons.
  if (!isAutoSentinel(setting.lockUntil)) {
    const now = new Date();
    const lockUntil = stripMs(setting.lockUntil);
    const lockedByTime = now >= lockUntil;
    const isLocked = setting.isForceLocked || lockedByTime;
    return { ...setting, lockUntil, lockedByTime, isLocked, leagueSettings: decoded } as any;
  }

  // AUTO: compute dynamic lock based on matches.
  const auto = await computeAutoLockInfo(leagueId, decoded.predictionMode, decoded.lockOffsetMinutes);
  const isLocked = setting.isForceLocked || auto.isLocked;
  return {
    ...setting,
    lockUntil: auto.lockUntil,
    lockedByTime: auto.lockedByTime,
    isLocked,
    leagueSettings: decoded,
    auto,
  } as any;
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
