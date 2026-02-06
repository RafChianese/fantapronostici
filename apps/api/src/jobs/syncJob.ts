import cron from "node-cron";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import { fetchCompetitionMatches, mapFootballDataStatus } from "../services/footballDataService.js";
import { fetchFixtures, mapApiFootballStatus, computeMatchday } from "../services/apiFootball.js";
import { recalcScoresForMatchAcrossLeagues } from "../lib/scoring.js";

export async function runSyncOnce() {
  let superSetting: any = null;
  try {
    superSetting = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
  } catch (err: any) {
    // Prisma P2021 => table does not exist (migrations not applied yet). Do not crash the job.
    if (err?.code === "P2021") {
      return { ok: true, message: "External sync disabled (missing SuperSetting table - run Prisma migrations)." };
    }
    throw err;
  }

  const provider = (superSetting?.provider || "FOOTBALL_DATA").toUpperCase();

  // Provider 1: API-Football (api-football.com)
  if (provider === "API_FOOTBALL") {
    const leagueId = superSetting?.apiFootballLeagueId ?? null;
    const season = superSetting?.apiFootballSeason ?? null;
    const tz = superSetting?.apiFootballTimezone || "Europe/Rome";

    if (!leagueId || !season) {
      return { ok: true, message: "External sync disabled (API_FOOTBALL missing leagueId/season)." };
    }

    if (!env.API_FOOTBALL_KEY?.trim()) {
      return { ok: false, message: "API_FOOTBALL_KEY mancante in .env" };
    }

    const fixtures = await fetchFixtures({ leagueId, season, timezone: tz });

    for (const row of fixtures) {
      const externalId = `af:${row.fixture.id}`;
      const group = row.league?.name ? String(row.league.name).slice(0, 20) : `L${leagueId}`;
      const matchday = computeMatchday(row.league?.round);
      const kickoffAt = new Date(row.fixture.date);
      const status = mapApiFootballStatus(row.fixture.status?.short) as any;
      const homeScore = row.goals?.home ?? null;
      const awayScore = row.goals?.away ?? null;

      const existing = await prisma.match.findUnique({ where: { externalId } });
      if (existing) {
        const updated = await prisma.match.update({
          where: { id: existing.id },
          data: {
            group,
            matchday,
            homeTeam: row.teams.home.name,
            awayTeam: row.teams.away.name,
            homeLogo: (row as any).teams?.home?.crest ?? null,
            awayLogo: (row as any).teams?.away?.crest ?? null,
            kickoffAt,
            status,
            homeScore,
            awayScore,
            source: "API_FOOTBALL",
            apiFootballFixtureId: row.fixture.id,
            apiLeagueId: leagueId,
            apiSeason: season,
            apiRound: row.league?.round ?? null,
          },
        });
        await recalcScoresForMatchAcrossLeagues(updated.id);
      } else {
        const created = await prisma.match.create({
          data: {
            externalId,
            group,
            matchday,
            homeTeam: row.teams.home.name,
            awayTeam: row.teams.away.name,
            homeLogo: (row as any).teams?.home?.crest ?? null,
            awayLogo: (row as any).teams?.away?.crest ?? null,
            kickoffAt,
            status,
            homeScore,
            awayScore,
            source: "API_FOOTBALL",
            apiFootballFixtureId: row.fixture.id,
            apiLeagueId: leagueId,
            apiSeason: season,
            apiRound: row.league?.round ?? null,
          },
        });
        await recalcScoresForMatchAcrossLeagues(created.id);
      }
    }

    return { ok: true, message: `Synced ${fixtures.length} matches from API-Football (league=${leagueId}, season=${season})` };
  }

  // Provider 2: football-data.org
  if (!env.FOOTBALL_DATA_API_KEY?.trim()) {
    return { ok: false, message: "FOOTBALL_DATA_API_KEY mancante in .env" };
  }

  const competitionCode = superSetting?.footballDataCompetitionCode?.trim();
  const season = superSetting?.footballDataSeason ?? null;
  if (!competitionCode) {
    return { ok: true, message: "External sync disabled (FOOTBALL_DATA missing competitionCode)." };
  }

  const matches = await fetchCompetitionMatches({ competitionCode, ...(season ? { season } : {}) });

  for (const m of matches) {
    const matchday = typeof m.matchday === "number" && Number.isFinite(m.matchday) ? Number(m.matchday) : 1;
    const kickoffAt = new Date(m.utcDate);
    const status = mapFootballDataStatus(m.status) as any;
    const homeScore = m.score?.fullTime?.home ?? null;
    const awayScore = m.score?.fullTime?.away ?? null;

    const existing = await prisma.match.findFirst({ where: { source: "FOOTBALL_DATA", footballDataMatchId: m.id } });
    if (existing) {
      const updated = await prisma.match.update({
        where: { id: existing.id },
        data: {
          matchday,
          homeTeam: m.homeTeam.name,
          awayTeam: m.awayTeam.name,
          kickoffAt,
          status,
          homeScore,
          awayScore,
          footballDataCompetitionCode: competitionCode,
          footballDataSeason: season,
        },
      });
      await recalcScoresForMatchAcrossLeagues(updated.id);
    } else {
      const created = await prisma.match.create({
        data: {
          externalId: `fd:${m.id}`,
          group: competitionCode.slice(0, 20),
          matchday,
          homeTeam: m.homeTeam.name,
          awayTeam: m.awayTeam.name,
          kickoffAt,
          status,
          homeScore,
          awayScore,
          source: "FOOTBALL_DATA",
          footballDataMatchId: m.id,
          footballDataCompetitionCode: competitionCode,
          footballDataSeason: season,
        },
      });
      await recalcScoresForMatchAcrossLeagues(created.id);
    }
  }

  return { ok: true, message: `Synced ${matches.length} matches from football-data.org (${competitionCode}${season ? `/${season}` : ""})` };
}

export function startScheduler() {
  const minutes = env.SYNC_EVERY_MINUTES;
  const expr = `*/${minutes} * * * *`;
  cron.schedule(expr, async () => {
    try {
      await runSyncOnce();
      // eslint-disable-next-line no-console
      console.log(`🕒 Sync job OK (${new Date().toISOString()})`);
    } catch (e: any) {
      console.error("🕒 Sync job ERROR", e?.message || e);
    }
  });
  console.log(`🕒 Scheduler started: every ${minutes} minutes`);
}
