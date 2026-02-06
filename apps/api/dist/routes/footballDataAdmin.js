import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireSuperAdmin } from "../middleware/authMiddleware.js";
import { ensureMonetizationConfig } from "../lib/monetization.js";
import { env } from "../lib/env.js";
import { listCompetitions, fetchCompetitionMatches, mapFootballDataStatus } from "../services/footballDataService.js";
import { recalcAllScoresForLeague } from "../lib/scoring.js";
export const footballDataAdminRouter = Router();
// NOTE: Do NOT apply superadmin middleware globally on this router,
// otherwise it will intercept unrelated /api/admin/* routes (league-admin ones).
function keyPresent() {
    return !!(env.FOOTBALL_DATA_API_KEY || "").trim();
}
// --- Competitions list/search ---
footballDataAdminRouter.get("/football-data/competitions", requireAuth, requireSuperAdmin, async (req, res) => {
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : "";
    const area = req.query.area ? String(req.query.area).trim().toLowerCase() : "";
    if (!keyPresent()) {
        return res.status(400).json({ message: "FOOTBALL_DATA_API_KEY mancante in apps/api/.env" });
    }
    try {
        const comps = await listCompetitions();
        const filtered = comps.filter((c) => {
            const name = (c.name || "").toLowerCase();
            const code = (c.code || "").toLowerCase();
            const areaName = (c.area?.name || "").toLowerCase();
            const areaCode = (c.area?.code || "").toLowerCase();
            const okSearch = !search || name.includes(search) || code.includes(search);
            const okArea = !area || areaName.includes(area) || areaCode.includes(area);
            return okSearch && okArea;
        });
        res.json({ competitions: filtered });
    }
    catch (e) {
        console.error("[football-data] competitions error", e?.message || e);
        res.status(502).json({ message: e?.message || "Errore football-data.org" });
    }
});
// --- "Status" (quota/limits via headers is not exposed as a dedicated endpoint)
footballDataAdminRouter.get("/football-data/status", requireAuth, requireSuperAdmin, async (_req, res) => {
    if (!keyPresent()) {
        return res.status(400).json({ message: "FOOTBALL_DATA_API_KEY mancante in apps/api/.env" });
    }
    try {
        // Best-effort: return ok and remind to inspect response headers server logs.
        // The client logs request/429 backoffs; football-data exposes X-RequestsAvailable etc.
        res.json({ ok: true, note: "football-data.org espone rate-limit in response headers (X-RequestsAvailable, X-RequestCounter-Reset)." });
    }
    catch (e) {
        console.error("[football-data] status error", e?.message || e);
        res.status(502).json({ message: e?.message || "Errore football-data.org" });
    }
});
// --- Persist selection ---
const SelectSchema = z.object({
    competitionCode: z.string().min(2).max(10),
    season: z.number().int().min(2000).max(2100).optional().nullable(),
});
footballDataAdminRouter.post("/settings/football-data/select", requireAuth, requireSuperAdmin, async (req, res) => {
    await ensureMonetizationConfig();
    const body = SelectSchema.parse(req.body);
    const existing = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
    const updated = await prisma.superSetting.update({
        where: { id: existing.id },
        data: {
            provider: "FOOTBALL_DATA",
            footballDataCompetitionCode: body.competitionCode.toUpperCase(),
            footballDataSeason: body.season ?? null,
        },
    });
    res.json({
        selected: {
            provider: updated.provider,
            competitionCode: updated.footballDataCompetitionCode,
            season: updated.footballDataSeason,
            footballDataKeyPresent: keyPresent(),
        },
    });
});
footballDataAdminRouter.get("/settings/football-data/selected", requireAuth, requireSuperAdmin, async (_req, res) => {
    await ensureMonetizationConfig();
    const row = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
    res.json({
        selected: {
            provider: row?.provider || "FOOTBALL_DATA",
            competitionCode: row?.footballDataCompetitionCode ?? null,
            season: row?.footballDataSeason ?? null,
            footballDataKeyPresent: keyPresent(),
        },
    });
});
async function getSelectedOr400(res) {
    await ensureMonetizationConfig();
    const row = await prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } });
    const code = row?.footballDataCompetitionCode ?? null;
    const season = row?.footballDataSeason ?? null;
    if (!keyPresent()) {
        res.status(400).json({ message: "FOOTBALL_DATA_API_KEY mancante in apps/api/.env" });
        return null;
    }
    if (!code) {
        res.status(400).json({ message: "Selezione mancante: scegli prima una competizione" });
        return null;
    }
    return { competitionCode: code, season: season ?? undefined };
}
// --- Import fixtures ---
footballDataAdminRouter.post("/football-data/import-fixtures", requireAuth, requireSuperAdmin, async (_req, res) => {
    const cfg = await getSelectedOr400(res);
    if (!cfg)
        return;
    let matches = [];
    try {
        // Import all matches for season (or current season if omitted)
        matches = await fetchCompetitionMatches({ competitionCode: cfg.competitionCode, season: cfg.season });
    }
    catch (e) {
        console.error("[football-data] import error", e?.message || e);
        return res.status(502).json({ message: e?.message || "Errore football-data.org" });
    }
    await prisma.$transaction([
        prisma.matchdayAward.deleteMany({}),
        prisma.prediction.deleteMany({}),
        prisma.match.deleteMany({}),
    ]);
    for (const m of matches) {
        await prisma.match.create({
            data: {
                externalId: `fd:${m.id}`,
                footballDataMatchId: m.id,
                footballDataCompetitionCode: cfg.competitionCode,
                footballDataSeason: cfg.season ?? null,
                group: (cfg.competitionCode || "COMP").slice(0, 20),
                matchday: Number(m.matchday || 1),
                homeTeam: m.homeTeam?.name,
                awayTeam: m.awayTeam?.name,
                kickoffAt: new Date(m.utcDate),
                status: mapFootballDataStatus(m.status),
                homeScore: m.score?.fullTime?.home,
                awayScore: m.score?.fullTime?.away,
                source: "FOOTBALL_DATA",
            },
        });
    }
    const leagues = await prisma.league.findMany({ select: { id: true } });
    for (const l of leagues)
        await recalcAllScoresForLeague(l.id);
    res.json({ ok: true, imported: matches.length });
});
// --- Sync results ---
footballDataAdminRouter.post("/football-data/sync-results", requireAuth, requireSuperAdmin, async (req, res) => {
    const cfg = await getSelectedOr400(res);
    if (!cfg)
        return;
    const matchday = req.query.matchday ? Number(req.query.matchday) : undefined;
    const where = { source: "FOOTBALL_DATA", footballDataCompetitionCode: cfg.competitionCode };
    if (matchday)
        where.matchday = matchday;
    if (cfg.season)
        where.footballDataSeason = cfg.season;
    const local = await prisma.match.findMany({ where });
    if (local.length === 0)
        return res.json({ ok: true, updated: 0, message: "Nessuna partita da sincronizzare" });
    let remote = [];
    try {
        remote = await fetchCompetitionMatches({
            competitionCode: cfg.competitionCode,
            season: cfg.season,
            ...(matchday ? { matchday } : {}),
        });
    }
    catch (e) {
        console.error("[football-data] sync error", e?.message || e);
        return res.status(502).json({ message: e?.message || "Errore football-data.org" });
    }
    const byId = new Map(remote.map((r) => [r.id, r]));
    let updated = 0;
    for (const m of local) {
        const r = byId.get(m.footballDataMatchId);
        if (!r)
            continue;
        const status = mapFootballDataStatus(r.status);
        const hs = r.score?.fullTime?.home;
        const as = r.score?.fullTime?.away;
        const shouldUpdate = m.status !== status || (m.homeScore ?? null) !== (hs ?? null) || (m.awayScore ?? null) !== (as ?? null);
        if (!shouldUpdate)
            continue;
        await prisma.match.update({ where: { id: m.id }, data: { status, homeScore: hs, awayScore: as } });
        updated += 1;
    }
    const leagues = await prisma.league.findMany({ select: { id: true } });
    for (const l of leagues)
        await recalcAllScoresForLeague(l.id);
    res.json({ ok: true, updated });
});
