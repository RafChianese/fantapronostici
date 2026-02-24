import { prisma } from "./prisma.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";
import { decodeLeagueSettings, type PredictionMode } from "./leagueConfigEncoding.js";

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

type DynamicLock = {
  lockUntil: Date; // next transition (next lock start if open, next unlock if locked)
  lockedByTime: boolean;
  isLocked: boolean;
  lockAll: boolean;
  lockedMatchdays: number[];
  auto: { startAt: Date | null; endAt: Date | null; nextStartAt: Date | null };
};

async function computeDynamicLockInfo(leagueId: string, predictionMode: PredictionMode, offsetMinutes: number): Promise<DynamicLock> {
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
      lockAll: false,
      lockedMatchdays: [],
      auto: { startAt: null, endAt: null, nextStartAt: null },
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
      lockAll: lockedByTime,
      lockedMatchdays: lockedByTime ? mds : [],
      auto: { startAt, endAt: null, nextStartAt: startAt },
    };
  }

  // MATCHDAY_BY_MATCHDAY: lock is scoped per matchday, so postponed matches from a previous matchday
  // must NOT block editing of the next matchday until its own lock time.
  const activeLocked: Array<{ md: number; endAt: Date; startAt: Date }> = [];
  let nextStartAt: Date | null = null;

  for (const md of mds) {
    const ms = byMd.get(md) as any;
    const { first, last } = getMatchdayBounds(ms);
    if (!first || !last) continue;

    const startAt = new Date(first.getTime() - offsetMinutes * 60_000);
    const fallbackEndAt = new Date(last.getTime() + AUTO_FALLBACK_HOURS * 60 * 60_000);
    const concluded = allFinished(ms);

    const isActive = !concluded && now >= startAt && now < fallbackEndAt;
    if (isActive) {
      activeLocked.push({ md, endAt: fallbackEndAt, startAt });
    } else {
      if (!concluded && now < startAt) {
        if (!nextStartAt || startAt.getTime() < nextStartAt.getTime()) nextStartAt = startAt;
      }
    }
  }

  if (activeLocked.length) {
    const minEnd = activeLocked.reduce((acc, x) => (x.endAt.getTime() < acc.getTime() ? x.endAt : acc), activeLocked[0].endAt);
    return {
      lockUntil: minEnd,
      lockedByTime: true,
      isLocked: true,
      lockAll: false,
      lockedMatchdays: activeLocked.map((x) => x.md),
      auto: { startAt: activeLocked[0].startAt, endAt: minEnd, nextStartAt },
    };
  }

  // Not locked right now: return the next lock start (if any).
  const future = nextStartAt ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
  return {
    lockUntil: future,
    lockedByTime: false,
    isLocked: false,
    lockAll: false,
    lockedMatchdays: [],
    auto: { startAt: null, endAt: null, nextStartAt },
  };
}

export async function getLockInfo(leagueId: string) {
  // Very hot endpoint (/api/lock is frequently polled by the UI).
  // To avoid exhausting Prisma's connection pool under load, we cache both the
  // in-flight promise and the last successful result for a short TTL.
  (globalThis as any).__LOCKINFO_CACHE__ ??= new Map();
  const cache: Map<string, { exp: number; value?: any; inflight?: Promise<any> }> = (globalThis as any).__LOCKINFO_CACHE__;
  const now = Date.now();
  const hit = cache.get(leagueId);
  if (hit?.value && hit.exp > now) return hit.value;
  if (hit?.inflight) return hit.inflight;

  const p = (async () => {
  // Auto-heal: ensure Setting/Rule exist for the league.
  await ensureLeagueConfig(leagueId);

  const setting = await prisma.setting.findUnique({ where: { leagueId } });
  if (!setting) throw new Error("Missing Setting row for league (unexpected).");

  const decoded = decodeLeagueSettings(setting.lockUntil);

  // NEW BEHAVIOR: lock is ALWAYS automatic.
  // We keep the sentinel encoding only to persist predictionMode + offsetMinutes without DB migrations.
  // If an older league still has a non-sentinel lockUntil, we treat it as "automatic with defaults".
  const auto = await computeDynamicLockInfo(leagueId, decoded.predictionMode, decoded.lockOffsetMinutes);
  const isLocked = setting.isForceLocked || auto.isLocked;
  const result = {
    ...setting,
    lockUntil: auto.lockUntil,
    lockedByTime: auto.lockedByTime,
    isLocked,
    leagueSettings: decoded,
    auto,
  } as any;

  cache.set(leagueId, { value: result, exp: Date.now() + 5_000 }); // 5s TTL
  return result;
  })();

  cache.set(leagueId, { exp: now + 1_000, inflight: p });
  try {
    return await p;
  } finally {
    const cur = cache.get(leagueId);
    if (cur?.inflight === p) {
      // keep last value if it was set, otherwise clear
      cache.set(leagueId, { value: cur.value, exp: cur.exp ?? 0 });
    }
  }
}

export async function assertPredictionsEditableForMatches(leagueId: string, matchIds: string[]) {
  const info: any = await getLockInfo(leagueId);
  if (info.isForceLocked) {
    const msg = "Pronostici bloccati (forzato dall'admin)";
    const err: any = new Error(msg);
    err.status = 403;
    err.payload = { message: msg, isLocked: true };
    throw err;
  }

  // Tournament-pre: once locked, nothing is editable.
  if (info?.auto?.lockAll) {
    const msg = "Pronostici bloccati (tutti prima del torneo)";
    const err: any = new Error(msg);
    err.status = 403;
    err.payload = { message: msg, isLocked: true };
    throw err;
  }

  const matches = await prisma.match.findMany({
    where: { id: { in: matchIds } },
    select: { id: true, status: true, matchday: true, kickoffAt: true },
  });
  const lockedSet = new Set<number>((info?.auto?.lockedMatchdays || []).map((x: any) => Number(x)));

  const blocked = matches.find((m) => {
    const md = Number(m.matchday || 1);
    // Always block once a match has started.
    if (m.status !== "NOT_STARTED") return true;
    // If this matchday is currently locked, block.
    if (lockedSet.has(md)) return true;
    return false;
  });

  if (blocked) {
    const msg = "Pronostici bloccati per la giornata in corso";
    const err: any = new Error(msg);
    err.status = 403;
    err.payload = { message: msg, isLocked: true };
    throw err;
  }
}
