import { prisma } from "./prisma.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";
import { decodeLeagueConfigFromLockUntil } from "./leagueConfigEncoding.js";

type MatchLite = { matchday: number; kickoffAt: Date; status: string };

function groupByMatchday(matches: MatchLite[]) {
  const map = new Map<number, MatchLite[]>();
  for (const m of matches) {
    const day = m.matchday ?? 1;
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(m);
  }
  // Ensure deterministic ordering inside groups
  for (const [k, arr] of map.entries()) {
    arr.sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
    map.set(k, arr);
  }
  return map;
}

function computeMatchdayMeta(matches: MatchLite[], now: Date) {
  const firstKickoff = matches[0]?.kickoffAt;
  const lastKickoff = matches[matches.length - 1]?.kickoffAt;
  const allFinished = matches.every((m) => String(m.status) === "FINISHED");
  const anyStartedOrPast = matches.some(
    (m) => String(m.status) === "IN_PROGRESS" || String(m.status) === "FINISHED" || m.kickoffAt.getTime() <= now.getTime()
  );
  const anyNotStartedFuture = matches.some((m) => String(m.status) === "NOT_STARTED" && m.kickoffAt.getTime() > now.getTime());
  return { firstKickoff, lastKickoff, allFinished, anyStartedOrPast, anyNotStartedFuture };
}

async function computeAutoLockInfo(leagueId: string, cfg: { predictionsMode: "MATCHDAY_BY_MATCHDAY" | "TOURNAMENT_PRE"; lockOffsetMinutes: number }) {
  const now = new Date();
  const matches = await prisma.match.findMany({
    where: { predictions: { some: { leagueId } } },
    select: { matchday: true, kickoffAt: true, status: true },
    orderBy: [{ matchday: "asc" }, { kickoffAt: "asc" }],
  });

  // If no matches are scoped by predictions yet (new league), fallback to global matches list.
  const all = matches.length
    ? matches
    : await prisma.match.findMany({ select: { matchday: true, kickoffAt: true, status: true }, orderBy: [{ matchday: "asc" }, { kickoffAt: "asc" }] });

  const byDay = groupByMatchday(all as any);
  if (byDay.size === 0) {
    return { lockStart: new Date(0), isLocked: false, lockedByTime: false, targetMatchday: null };
  }

  const days = Array.from(byDay.keys()).sort((a, b) => a - b);

  // Determine target day depending on predictionsMode
  let target: number | null = null;

  if (cfg.predictionsMode === "TOURNAMENT_PRE") {
    target = days[0];
  } else {
    // next day to start = day with closest future first kickoff
    let bestDay: number | null = null;
    let bestKick = Infinity;
    for (const d of days) {
      const arr = byDay.get(d)!;
      const meta = computeMatchdayMeta(arr, now);
      if (!meta.firstKickoff) continue;
      const t = meta.firstKickoff.getTime();
      if (t > now.getTime() && t < bestKick) {
        bestKick = t;
        bestDay = d;
      }
    }
    // If all firstKickoff are in the past (season ended), keep last matchday.
    target = bestDay ?? days[days.length - 1];
  }

  const matchesTarget = byDay.get(target!) || [];
  const meta = computeMatchdayMeta(matchesTarget, now);
  const firstKickoff = meta.firstKickoff ?? now;
  const lastKickoff = meta.lastKickoff ?? now;
  const lockStart = new Date(firstKickoff.getTime() - cfg.lockOffsetMinutes * 60_000);

  const fallbackUnlock = new Date(lastKickoff.getTime() + 12 * 60 * 60_000);
  const concluded = meta.allFinished || now.getTime() >= fallbackUnlock.getTime();

  const lockedByTime = now.getTime() >= lockStart.getTime();
  const isLocked = lockedByTime && !concluded;

  return { lockStart, isLocked, lockedByTime, targetMatchday: target };
}

export async function getLockInfo(leagueId: string) {
  // Auto-heal: ensure Setting/Rule exist for the league.
  await ensureLeagueConfig(leagueId);

  const setting = await prisma.setting.findUnique({ where: { leagueId } });
  if (!setting) throw new Error("Missing Setting row for league (unexpected).");

  const cfg = decodeLeagueConfigFromLockUntil(setting.lockUntil);

  // AUTO: compute dynamic lock based on matches.
  if (cfg.lockMode === "AUTO_MATCHDAY") {
    const auto = await computeAutoLockInfo(leagueId, {
      predictionsMode: cfg.predictionsMode,
      lockOffsetMinutes: cfg.lockOffsetMinutes,
    });
    const isLocked = setting.isForceLocked || auto.isLocked;
    return {
      ...setting,
      lockUntil: auto.lockStart,
      lockedByTime: auto.lockedByTime,
      isLocked,
      // extra debug/info fields (ignored by old clients)
      _lockMode: cfg.lockMode,
      _predictionsMode: cfg.predictionsMode,
      _lockOffsetMinutes: cfg.lockOffsetMinutes,
      _targetMatchday: auto.targetMatchday,
    } as any;
  }

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
