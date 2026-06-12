import cron from "node-cron";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";
import {
  fetchCompetitionMatches,
  fetchCompetitionTeams,
  mapFootballDataStatus,
  fetchMatchDetail,
  extractScorersFromMatchDetail,
  fetchCompetitionScorers,
  fetchCompetitionStandings,
  extractWinnerFromStandings,
  extractTopScorerFromScorers,
} from "../services/footballDataService.js";
import { fetchFixtures, mapApiFootballStatus, computeMatchday, fetchFixtureEvents } from "../services/apiFootball.js";
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

      // Cache goal scorers only for finished matches (used by "marcatore" feature)
      let goalScorersJson: any = null;
      if (status === "FINISHED") {
        try {
          const events = await fetchFixtureEvents(row.fixture.id);
          const uniq = new Map<number, string>();
          for (const ev of events) {
            const type = String(ev?.type || "").toLowerCase();
            if (type !== "goal") continue;
            const pid = ev?.player?.id;
            const pname = String(ev?.player?.name || "").trim();
            const n = Number(pid);
            if (!Number.isFinite(n) || !pname) continue;
            if (!uniq.has(n)) uniq.set(n, pname);
          }
          goalScorersJson = Array.from(uniq.entries()).map(([id, name]) => ({ id, name }));
        } catch (e: any) {
          console.warn("[sync] api-football events error", e?.message || e);
        }
      }

      const existing = await prisma.match.findUnique({ where: { externalId } });
      if (existing) {
        const updated = await prisma.match.update({
          where: { id: existing.id },
          data: {
            group,
            matchday,
            homeTeam: row.teams.home.name,
            awayTeam: row.teams.away.name,
            homeLogo: (row as any).teams?.home?.logo ?? null,
            awayLogo: (row as any).teams?.away?.logo ?? null,
            kickoffAt,
            status,
            homeScore,
            awayScore,
            ...(goalScorersJson ? { goalScorersJson } : {}),
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
            homeLogo: (row as any).teams?.home?.logo ?? null,
            awayLogo: (row as any).teams?.away?.logo ?? null,
            kickoffAt,
            status,
            homeScore,
            awayScore,
            ...(goalScorersJson ? { goalScorersJson } : {}),
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

    // NOTE: football-data match endpoints may omit crest/shortName.
    // We still store team IDs for later enrichment via /competitions/{code}/teams.
    const homeTeamId = (m as any).homeTeam?.id ?? null;
    const awayTeamId = (m as any).awayTeam?.id ?? null;

    const homeName = (m.homeTeam?.shortName || m.homeTeam?.name || "").trim() || "Home";
    const awayName = (m.awayTeam?.shortName || m.awayTeam?.name || "").trim() || "Away";
    const homeLogo = m.homeTeam?.crest ?? null;
    const awayLogo = m.awayTeam?.crest ?? null;

    const existing = await prisma.match.findFirst({ where: { source: "FOOTBALL_DATA", footballDataMatchId: m.id } });
    if (existing) {
      const updated = await prisma.match.update({
        where: { id: existing.id },
        data: {
          matchday,
          homeTeam: homeName,
          awayTeam: awayName,
          homeLogo,
          awayLogo,
          footballDataHomeTeamId: homeTeamId,
          footballDataAwayTeamId: awayTeamId,
          kickoffAt,
          status,
          homeScore,
          awayScore,
          footballDataCompetitionCode: competitionCode,
          footballDataSeason: season,
        },
      });

      // If "marcatore" feature is used, cache scorers for finished matches (best-effort, rate-limit safe).
      if (status === "FINISHED") {
        const picks = await prisma.scorerPick.count({ where: { matchId: updated.id } }).catch(() => 0);
        if (picks > 0) {
          try {
            const detail = await fetchMatchDetail({ matchId: m.id });
            const scorers = extractScorersFromMatchDetail(detail)
              .filter((s) => s.id !== null)
              .map((s) => ({ id: Number(s.id), name: s.name }));
            if (scorers.length) {
              await prisma.match.update({ where: { id: updated.id }, data: { goalScorersJson: scorers as any } });
            }
          } catch (e: any) {
            console.warn("[sync] football-data match detail error", e?.message || e);
          }
        }
      }
      await recalcScoresForMatchAcrossLeagues(updated.id);
    } else {
      const created = await prisma.match.create({
        data: {
          externalId: `fd:${m.id}`,
          group: competitionCode.slice(0, 20),
          matchday,
          homeTeam: homeName,
          awayTeam: awayName,
          homeLogo,
          awayLogo,
          kickoffAt,
          status,
          homeScore,
          awayScore,
          source: "FOOTBALL_DATA",
          footballDataMatchId: m.id,
          footballDataHomeTeamId: homeTeamId,
          footballDataAwayTeamId: awayTeamId,
          footballDataCompetitionCode: competitionCode,
          footballDataSeason: season,
        },
      });
      await recalcScoresForMatchAcrossLeagues(created.id);
    }
  }

  // --- Enrich team crest + shortName (match endpoints may omit them) ---
  try {
    const teams = await fetchCompetitionTeams({ competitionCode });
    const teamMap = new Map<number, { crest: string | null; shortName: string | null; name: string }>();
    for (const t of teams) {
      if (!t?.id) continue;
      teamMap.set(t.id, {
        crest: (t as any).crest ?? null,
        shortName: ((t as any).shortName || "").trim() || null,
        name: (t as any).name || "",
      });
    }

    const where: any = { source: "FOOTBALL_DATA", footballDataCompetitionCode: competitionCode };
    if (season) where.footballDataSeason = season;
    const local = await prisma.match.findMany({
      where,
      select: {
        id: true,
        homeTeam: true,
        awayTeam: true,
        homeLogo: true,
        awayLogo: true,
        footballDataHomeTeamId: true,
        footballDataAwayTeamId: true,
      },
    });

    for (const row of local) {
      const ht = row.footballDataHomeTeamId ? teamMap.get(row.footballDataHomeTeamId) : undefined;
      const at = row.footballDataAwayTeamId ? teamMap.get(row.footballDataAwayTeamId) : undefined;

      const nextHomeLogo = ht?.crest ?? row.homeLogo ?? null;
      const nextAwayLogo = at?.crest ?? row.awayLogo ?? null;
      const nextHomeName = (ht?.shortName || ht?.name || row.homeTeam).trim();
      const nextAwayName = (at?.shortName || at?.name || row.awayTeam).trim();

      const needsUpdate =
        (nextHomeLogo ?? null) !== (row.homeLogo ?? null) ||
        (nextAwayLogo ?? null) !== (row.awayLogo ?? null) ||
        nextHomeName !== row.homeTeam ||
        nextAwayName !== row.awayTeam;

      if (!needsUpdate) continue;
      await prisma.match.update({
        where: { id: row.id },
        data: {
          homeLogo: nextHomeLogo,
          awayLogo: nextAwayLogo,
          homeTeam: nextHomeName,
          awayTeam: nextAwayName,
        },
      });
      // No need to recalc scores: names/logos changes don't affect points.
    }
  } catch (e: any) {
    // Enrichment is best-effort (rate-limit / temporary API issues).
    console.error("[sync] football-data teams enrichment error", e?.message || e);
  }

  // --- Competition predictions resolution (best-effort, football-data only) ---
  // If the competition is fully finished, resolve outcome once per league and award points.
  try {
    // If Super Admin has set a GLOBAL manual outcome, do not auto-resolve via provider.
    if (superSetting?.competitionOutcomeResolvedAt) {
      // Manual global resolution is applied immediately on save.
      // This guard prevents overwriting points/outcome via provider sync.
      return { ok: true, message: `Synced ${matches.length} matches from football-data.org (${competitionCode}${season ? `/${season}` : ""})` };
    }

    const allFinished = matches.every((m: any) => mapFootballDataStatus(String(m.status || "")) === "FINISHED");
    if (allFinished && competitionCode) {
      const leagues = await prisma.league.findMany({
        include: { rules: true, settings: true, competitionOutcome: true },
      });

      const needAny = leagues.some(
        (l: any) =>
          (l.rules?.enableCompetitionWinner || l.rules?.enableCompetitionTopScorer) && !l.competitionOutcome?.resolvedAt
      );

      if (needAny) {
        const [standings, scorers] = await Promise.all([
          fetchCompetitionStandings({ competitionCode, ...(season ? { season } : {}) }).catch(() => []),
          fetchCompetitionScorers({ competitionCode, ...(season ? { season } : {}), limit: 1 }).catch(() => []),
        ]);

        const winner = extractWinnerFromStandings(standings as any);
        const topScorer = extractTopScorerFromScorers(scorers as any);

        for (const league of leagues as any[]) {
          const rules = league.rules;
          if (!rules) continue;
          const wants = !!rules.enableCompetitionWinner || !!rules.enableCompetitionTopScorer;
          if (!wants) continue;
          if (league.competitionOutcome?.resolvedAt) continue;

          const outcome = await prisma.competitionOutcome.upsert({
            where: { leagueId: league.id },
            create: {
              leagueId: league.id,
              provider: "FOOTBALL_DATA",
              competitionCode,
              season: season ?? null,
              winnerTeamExternalId: winner.teamExternalId,
              winnerTeamName: winner.teamName,
              topScorerPlayerExternalId: topScorer.playerExternalId,
              topScorerPlayerName: topScorer.playerName,
              resolvedAt: new Date(),
            },
            update: {
              provider: "FOOTBALL_DATA",
              competitionCode,
              season: season ?? null,
              winnerTeamExternalId: winner.teamExternalId,
              winnerTeamName: winner.teamName,
              topScorerPlayerExternalId: topScorer.playerExternalId,
              topScorerPlayerName: topScorer.playerName,
              resolvedAt: new Date(),
            },
          });

          // Award points
          const picks = await prisma.competitionPick.findMany({ where: { leagueId: league.id } });
          for (const p of picks as any[]) {
            let pts = 0;
            if (p.type === "WINNER" && rules.enableCompetitionWinner && winner.teamExternalId && p.teamExternalId === winner.teamExternalId) {
              pts = Number(rules.pointsCompetitionWinner ?? 15);
            }
            if (
              p.type === "TOP_SCORER" &&
              rules.enableCompetitionTopScorer &&
              topScorer.playerExternalId &&
              p.playerExternalId === topScorer.playerExternalId
            ) {
              pts = Number(rules.pointsCompetitionTopScorer ?? 12);
            }
            if (Number(p.pointsAwarded ?? 0) !== pts) {
              await prisma.competitionPick.update({ where: { id: p.id }, data: { pointsAwarded: pts } });
            }
          }

          console.log(`[sync] competition outcome resolved for league ${league.id}: ${outcome.id}`);
        }
      }
    }
  } catch (e: any) {
    console.warn("[sync] competition resolution error", e?.message || e);
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
