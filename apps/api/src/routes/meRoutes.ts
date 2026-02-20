import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireLeagueMember, resolveLeagueId, AuthedRequest } from "../middleware/authMiddleware.js";
import { assertPredictionsEditableForMatches, getLockInfo } from "../lib/lock.js";
import { recalcAllScoresForLeague } from "../lib/scoring.js";
import { getMonetizationConfig } from "../lib/monetization.js";
import { fetchCompetitionTeams, fetchMatchDetail, extractEventsFromMatchDetail, extractScorersFromMatchDetail } from "../services/footballDataService.js";

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get("/", async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, displayName: true, globalRole: true, isActive: true, createdAt: true },
  });

  const memberships = await prisma.leagueMember.findMany({
    where: { userId: req.user!.id },
    include: { league: { include: { branding: true } } },
    orderBy: { createdAt: "desc" },
  });

  res.json({ user, memberships });
});


// Update profile (display name)
const UpdateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
});

meRouter.put("/profile", async (req: AuthedRequest, res) => {
  const { displayName } = UpdateProfileSchema.parse(req.body);

  let user;
  try {
    user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { displayName },
      select: { id: true, email: true, displayName: true, globalRole: true, isActive: true, createdAt: true },
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(",") : String(e?.meta?.target || "");
      if (target.includes("displayName")) return res.status(400).json({ message: "Nome visualizzato già in uso" });
    }
    throw e;
  }

  res.json({ user });
});

meRouter.get("/lock", async (req, res) => {
  const leagueId = resolveLeagueId(req);
  if (!leagueId) return res.status(400).json({ message: "Missing leagueId" });

  const info = await getLockInfo(leagueId);
  res.json({
    lock: {
      lockUntil: info.lockUntil,
      isForceLocked: info.isForceLocked,
      lockedByTime: info.lockedByTime,
      isLocked: info.isLocked,
      lockAll: !!info?.auto?.lockAll,
      lockedMatchdays: (info?.auto?.lockedMatchdays || []).map((x: any) => Number(x)),
    },
  });
});

meRouter.get("/predictions", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;

  const predictions = await prisma.prediction.findMany({
    where: { userId: req.user!.id, leagueId },
    include: { match: true },
    orderBy: { match: { kickoffAt: "asc" } },
  });

  res.json({ predictions });
});

// Match detail (lineups + events) + scorer pick
meRouter.get("/matches/:matchId/detail", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;
  const matchId = String(req.params.matchId || "");
  if (!matchId) return res.status(400).json({ message: "Missing matchId" });

  const [match, rules, pick] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.rule.findUnique({ where: { leagueId } }),
    prisma.scorerPick.findUnique({ where: { userId_leagueId_matchId: { userId: req.user!.id, leagueId, matchId } } }).catch(() => null as any),
  ]);
  if (!match) return res.status(404).json({ message: "Match non trovato" });

  const scorerEnabled = !!(rules as any)?.enableScorer;
  const pointsScorer = Number((rules as any)?.pointsScorer ?? 3) || 3;

  // football-data.org does not provide real lineups. We expose squads (if available) as a "lineup-like" list.
  const fdMatchId = (match as any)?.footballDataMatchId ? Number((match as any).footballDataMatchId) : null;
  const competitionCode = String((match as any)?.footballDataCompetitionCode || "").trim();

  let events: any[] = [];
  let goalScorers: Array<{ id: number | null; name: string }> = [];
  if (fdMatchId) {
    try {
      const detail = await fetchMatchDetail({ matchId: fdMatchId });
      events = extractEventsFromMatchDetail(detail);
      goalScorers = extractScorersFromMatchDetail(detail);
    } catch (e: any) {
      // best-effort
      events = [];
      goalScorers = [];
    }
  }

  // Build pseudo-lineups from squads (if football-data returns squads for competition teams).
  let lineups: any[] = [];
  try {
    if (competitionCode) {
      const teams = await fetchCompetitionTeams({ competitionCode });
      const htId = Number((match as any)?.footballDataHomeTeamId);
      const atId = Number((match as any)?.footballDataAwayTeamId);
      const homeTeam = teams.find((t: any) => Number(t?.id) === htId);
      const awayTeam = teams.find((t: any) => Number(t?.id) === atId);

      const mapSquad = (t: any) => {
        const tid = Number(t?.id) || null;
        const logo =
          tid && tid === Number(htId)
            ? (match as any)?.homeLogo ?? null
            : tid && tid === Number(atId)
              ? (match as any)?.awayLogo ?? null
              : (t as any)?.crest ?? null;
        const squad = Array.isArray(t?.squad) ? t.squad : [];
        return {
          team: { id: tid, name: String(t?.shortName || t?.name || "").trim() || "Team", logo },
          startXI: squad.map((p: any) => ({ id: Number(p?.id) || null, name: String(p?.name || "").trim() })),
          substitutes: [],
        };
      };

      if (homeTeam) lineups.push(mapSquad(homeTeam));
      if (awayTeam) lineups.push(mapSquad(awayTeam));
    }
  } catch {
    lineups = [];
  }

  const lineupAvailable = Array.isArray(lineups) && lineups.some((t) => (t.startXI?.length || 0) > 0 || (t.substitutes?.length || 0) > 0);

  // Can pick scorer only if feature enabled, lineup available, and match editable.
  let canPickScorer = false;
  if (scorerEnabled && lineupAvailable) {
    try {
      await assertPredictionsEditableForMatches(leagueId, [matchId]);
      canPickScorer = match.status === "NOT_STARTED";
    } catch {
      canPickScorer = false;
    }
  }

  res.json({
    match,
    lineupAvailable,
    lineups,
    events,
    goalScorers,
    scorer: pick ? { playerExternalId: pick.playerExternalId, playerName: pick.playerName } : null,
    scorerEnabled,
    pointsScorer,
    canPickScorer,
  });
});

const PutScorerSchema = z.object({
  playerId: z.number().int().positive().nullable(),
  playerName: z.string().trim().min(1).max(120).nullable().optional(),
});

meRouter.put("/matches/:matchId/scorer", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;
  const matchId = String(req.params.matchId || "");
  if (!matchId) return res.status(400).json({ message: "Missing matchId" });

  const data = PutScorerSchema.parse(req.body);
  const [match, rules] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.rule.findUnique({ where: { leagueId } }),
  ]);
  if (!match) return res.status(404).json({ message: "Match non trovato" });

  if (!((rules as any)?.enableScorer)) {
    return res.status(400).json({ message: "Funzionalità marcatore non attiva", reason: "SCORER_DISABLED" });
  }

  // Editable gate (lock + started)
  try {
    await assertPredictionsEditableForMatches(leagueId, [matchId]);
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json(e.payload ?? { message: e.message });
    return res.status(400).json({ message: "Non modificabile" });
  }

  if (match.status !== "NOT_STARTED") {
    return res.status(400).json({ message: "Non modificabile: partita iniziata/terminata", reason: "MATCH_STARTED" });
  }

  const competitionCode = String((match as any)?.footballDataCompetitionCode || "").trim();
  if (!competitionCode) {
    return res.status(400).json({ message: "Rosa non disponibile per questo match", reason: "NO_SQUAD_PROVIDER" });
  }

  // Clear
  if (data.playerId === null) {
    await prisma.scorerPick.deleteMany({ where: { userId: req.user!.id, leagueId, matchId } });
    await recalcAllScoresForLeague(leagueId);
    return res.json({ ok: true, scorer: null });
  }

  const teams = await fetchCompetitionTeams({ competitionCode });
  const htId = Number((match as any)?.footballDataHomeTeamId);
  const atId = Number((match as any)?.footballDataAwayTeamId);
  const homeTeam = teams.find((t: any) => Number(t?.id) === htId);
  const awayTeam = teams.find((t: any) => Number(t?.id) === atId);
  const allPlayers: { id: number; name: string }[] = [];
  for (const t of [homeTeam, awayTeam]) {
    const squad = Array.isArray((t as any)?.squad) ? (t as any).squad : [];
    for (const p of squad) allPlayers.push({ id: Number((p as any).id), name: String((p as any).name) });
  }
  if (!allPlayers.length) {
    return res.status(400).json({ message: "Lista giocatori non disponibile per questo match", reason: "NO_SQUAD" });
  }
  const pid = Number(data.playerId);
  const hit = allPlayers.find((x) => Number(x.id) === pid);
  if (!hit) {
    return res.status(400).json({ message: "Giocatore non valido (non presente nella rosa)", reason: "INVALID_PLAYER" });
  }

  const playerExternalId = `fdp:${pid}`;
  const playerName = String(data.playerName || hit.name).trim().slice(0, 120);

  const pick = await prisma.scorerPick.upsert({
    where: { userId_leagueId_matchId: { userId: req.user!.id, leagueId, matchId } },
    create: { userId: req.user!.id, leagueId, matchId, playerExternalId, playerName },
    update: { playerExternalId, playerName },
  });

  await recalcAllScoresForLeague(leagueId);
  res.json({ ok: true, scorer: { playerExternalId: pick.playerExternalId, playerName: pick.playerName } });
});

const PredictionInput = z.object({
  matchId: z.string().min(1),
  homeGoals: z.number().int().min(0).max(99),
  awayGoals: z.number().int().min(0).max(99),
});
const PutPredictionsSchema = z.object({
  // FE should prevent empty saves, but we also guard on BE to avoid hard failures.
  predictions: z.array(PredictionInput).min(0).max(400),
});

meRouter.put("/predictions", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;

  const { predictions } = PutPredictionsSchema.parse(req.body);

  try {
    await assertPredictionsEditableForMatches(
      leagueId,
      predictions.map((p) => p.matchId)
    );
  } catch (e: any) {
    if (e?.status) return res.status(e.status).json(e.payload ?? { message: e.message });
    throw e;
  }

  if (!predictions.length) {
    return res.status(400).json({ message: "Nessun pronostico da salvare.", reason: "EMPTY_PREDICTIONS" });
  }

  const upserts = predictions.map((p) =>
    prisma.prediction.upsert({
      where: { userId_leagueId_matchId: { userId: req.user!.id, leagueId, matchId: p.matchId } },
      create: { userId: req.user!.id, leagueId, matchId: p.matchId, homeGoals: p.homeGoals, awayGoals: p.awayGoals },
      update: { homeGoals: p.homeGoals, awayGoals: p.awayGoals },
    })
  );

  await prisma.$transaction(upserts);

  // Recalc for this league (in case match already finished / or rules changed)
  await recalcAllScoresForLeague(leagueId);

  return res.json({ ok: true });
});

// Rewarded-ad unlock (client-side simulated by default): unlock viewing other users' predictions.
// Unlock is GLOBAL (valid across all leagues).
meRouter.get("/ad-unlock", async (req: AuthedRequest, res) => {
  const row = await prisma.adUnlock.findUnique({ where: { userId: req.user!.id } });
  const now = new Date();
  const isUnlocked = !!row && row.expiresAt.getTime() > now.getTime();
  res.json({ unlocked: isUnlocked, expiresAt: row?.expiresAt ?? null });
});

meRouter.post("/ad-unlock", async (req: AuthedRequest, res) => {
  const cfg = await getMonetizationConfig();
  const now = new Date();
  const minutes = Math.max(1, Math.min(120, cfg.unlockMinutes || 5));
  const expiresAt = new Date(now.getTime() + minutes * 60 * 1000);

  const row = await prisma.adUnlock.upsert({
    where: { userId: req.user!.id },
    update: { expiresAt },
    create: { userId: req.user!.id, expiresAt },
  });

  // Log unlock for stats
  await prisma.adUnlockLog.create({ data: { userId: req.user!.id, minutes } });

  res.json({ unlocked: true, expiresAt: row.expiresAt });
});

// Change password (logged-in)
const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8),
});

meRouter.put("/password", async (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = ChangePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.isActive) return res.status(401).json({ message: "Utente non valido" });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ message: "Password attuale non corretta" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return res.json({ ok: true });
});