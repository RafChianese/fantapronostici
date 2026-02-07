import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireSuperAdmin } from "../middleware/authMiddleware.js";
import { ensureMonetizationConfig } from "../lib/monetization.js";
import { env } from "../lib/env.js";
import { listLeagues, fetchFixtures, mapApiFootballStatus, computeMatchday, getStatus } from "../services/apiFootball.js";
import { recalcAllScoresForLeague } from "../lib/scoring.js";
export const apiFootballAdminRouter = Router();
// NOTE: Do NOT apply superadmin middleware globally on this router,
// otherwise it will intercept unrelated /api/admin/* routes (league-admin ones).
// --- Leagues search/list ---
apiFootballAdminRouter.get("/api-football/leagues", requireAuth, requireSuperAdmin, async (req, res) => {
    const season = req.query.season ? Number(req.query.season) : undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const country = req.query.country ? String(req.query.country).trim() : undefined;
    if (!env.API_FOOTBALL_KEY?.trim()) {
        return res.status(400).json({ message: "API_FOOTBALL_KEY mancante in apps/api/.env" });
    }
    const leagues = await listLeagues({ season, search, country });
    res.json({ leagues });
});
// --- Status / quota ---
apiFootballAdminRouter.get("/api-football/status", requireAuth, requireSuperAdmin, async (_req, res) => {
    if (!env.API_FOOTBALL_KEY?.trim()) {
        return res.status(400).json({ message: "API_FOOTBALL_KEY mancante in apps/api/.env" });
    }
    try {
        const status = await getStatus();
        res.json({ status });
    }
    catch (e) {
        console.error("[api-football] status error", e?.message || e);
        res.status(502).json({ message: e?.message || "Errore API-FOOTBALL" });
    }
});
// --- Persist selection ---
const SelectSchema = z.object({
    apiLeagueId: z.number().int().positive(),
    season: z.number().int().min(2000).max(2100),
});
apiFootballAdminRouter.post("/settings/api-football/select", requireAuth, requireSuperAdmin, async (req, res) => {
    await ensureMonetizationConfig();
    const body = SelectSchema.parse(req.body);
    const existing = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
    const updated = await prisma.superSetting.update({
        where: { id: existing.id },
        data: {
            provider: "API_FOOTBALL",
            apiFootballLeagueId: body.apiLeagueId,
            apiFootballSeason: body.season,
        },
    });
    res.json({
        selected: {
            provider: updated.provider,
            apiLeagueId: updated.apiFootballLeagueId,
            season: updated.apiFootballSeason,
            timezone: updated.apiFootballTimezone || "Europe/Rome",
            apiFootballKeyPresent: !!env.API_FOOTBALL_KEY?.trim(),
        },
    });
});
apiFootballAdminRouter.get("/settings/api-football/selected", requireAuth, requireSuperAdmin, async (_req, res) => {
    await ensureMonetizationConfig();
    const row = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
    res.json({
        selected: {
            provider: row?.provider || "FOOTBALL_DATA",
            apiLeagueId: row?.apiFootballLeagueId ?? null,
            season: row?.apiFootballSeason ?? null,
            timezone: row?.apiFootballTimezone || "Europe/Rome",
            apiFootballKeyPresent: !!env.API_FOOTBALL_KEY?.trim(),
        },
    });
});
async function getSelectedOr400(res) {
    await ensureMonetizationConfig();
    const row = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
    const leagueId = row?.apiFootballLeagueId ?? null;
    const season = row?.apiFootballSeason ?? null;
    const tz = row?.apiFootballTimezone || "Europe/Rome";
    if (!env.API_FOOTBALL_KEY?.trim()) {
        res.status(400).json({ message: "API_FOOTBALL_KEY mancante in apps/api/.env" });
        return null;
    }
    if (!leagueId || !season) {
        res.status(400).json({ message: "Selezione mancante: scegli prima lega e stagione" });
        return null;
    }
    return { leagueId, season, tz };
}
// --- Import fixtures ---
apiFootballAdminRouter.post("/api-football/import-fixtures", requireAuth, requireSuperAdmin, async (_req, res) => {
    const cfg = await getSelectedOr400(res);
    if (!cfg)
        return;
    let fixtures = [];
    try {
        fixtures = await fetchFixtures({ leagueId: cfg.leagueId, season: cfg.season, timezone: cfg.tz });
    }
    catch (e) {
        console.error("[api-football] import error", e?.message || e);
        return res.status(502).json({ message: e?.message || "Errore API-FOOTBALL" });
    }
    await prisma.$transaction([
        prisma.matchdayAward.deleteMany({}),
        prisma.prediction.deleteMany({}),
        prisma.match.deleteMany({}),
    ]);
    for (const f of fixtures) {
        const md = computeMatchday(f.league?.round);
        await prisma.match.create({
            data: {
                externalId: `af:${f.fixture.id}`,
                apiFootballFixtureId: f.fixture.id,
                apiLeagueId: cfg.leagueId,
                apiSeason: cfg.season,
                apiRound: f.league?.round ?? null,
                group: (f.league?.name ? String(f.league.name) : `L${cfg.leagueId}`).slice(0, 20),
                matchday: md,
                homeTeam: f.teams.home.name,
                awayTeam: f.teams.away.name,
                homeLogo: f.teams?.home?.logo ?? null,
                awayLogo: f.teams?.away?.logo ?? null,
                kickoffAt: new Date(f.fixture.date),
                status: mapApiFootballStatus(f.fixture.status?.short),
                homeScore: f.goals.home,
                awayScore: f.goals.away,
                source: "API_FOOTBALL",
            },
        });
    }
    const leagues = await prisma.league.findMany({ select: { id: true } });
    for (const l of leagues)
        await recalcAllScoresForLeague(l.id);
    res.json({ ok: true, imported: fixtures.length });
});
// --- Sync results ---
apiFootballAdminRouter.post("/api-football/sync-results", requireAuth, requireSuperAdmin, async (req, res) => {
    const cfg = await getSelectedOr400(res);
    if (!cfg)
        return;
    const matchday = req.query.matchday ? Number(req.query.matchday) : undefined;
    const where = { source: "API_FOOTBALL", apiLeagueId: cfg.leagueId, apiSeason: cfg.season };
    if (matchday)
        where.matchday = matchday;
    const matches = await prisma.match.findMany({ where });
    if (matches.length === 0)
        return res.json({ ok: true, updated: 0, message: "Nessuna partita da sincronizzare" });
    // Distinct rounds for efficient fetch
    const rounds = Array.from(new Set(matches.map((m) => m.apiRound).filter((x) => !!x)));
    const byFixture = new Map(matches.map((m) => [m.apiFootballFixtureId, m]));
    let updatedCount = 0;
    try {
        if (rounds.length > 0) {
            for (const r of rounds) {
                const fixtures = await fetchFixtures({ leagueId: cfg.leagueId, season: cfg.season, timezone: cfg.tz, round: r });
                for (const f of fixtures) {
                    const m = byFixture.get(f.fixture.id);
                    if (!m)
                        continue;
                    const status = mapApiFootballStatus(f.fixture.status?.short);
                    const hs = f.goals.home;
                    const as = f.goals.away;
                    const shouldUpdate = m.status !== status ||
                        (m.homeScore ?? null) !== (hs ?? null) ||
                        (m.awayScore ?? null) !== (as ?? null);
                    if (!shouldUpdate)
                        continue;
                    await prisma.match.update({
                        where: { id: m.id },
                        data: { status, homeScore: hs, awayScore: as },
                    });
                    updatedCount += 1;
                }
            }
        }
        else {
            // Fallback: fetch all fixtures once
            const fixtures = await fetchFixtures({ leagueId: cfg.leagueId, season: cfg.season, timezone: cfg.tz });
            for (const f of fixtures) {
                const m = byFixture.get(f.fixture.id);
                if (!m)
                    continue;
                const status = mapApiFootballStatus(f.fixture.status?.short);
                const hs = f.goals.home;
                const as = f.goals.away;
                const shouldUpdate = m.status !== status ||
                    (m.homeScore ?? null) !== (hs ?? null) ||
                    (m.awayScore ?? null) !== (as ?? null);
                if (!shouldUpdate)
                    continue;
                await prisma.match.update({ where: { id: m.id }, data: { status, homeScore: hs, awayScore: as } });
                updatedCount += 1;
            }
        }
    }
    catch (e) {
        console.error("[api-football] sync error", e?.message || e);
        return res.status(502).json({ message: e?.message || "Errore API-FOOTBALL" });
    }
    const leagues = await prisma.league.findMany({ select: { id: true } });
    for (const l of leagues)
        await recalcAllScoresForLeague(l.id);
    res.json({ ok: true, updated: updatedCount });
});
