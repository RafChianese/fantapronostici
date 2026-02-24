import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";
import { requireAuth, requireLeagueMember, resolveLeagueId, AuthedRequest } from "../middleware/authMiddleware.js";
import { assertPredictionsEditableForMatches, getLockInfo } from "../lib/lock.js";
import { recalcAllScoresForLeague } from "../lib/scoring.js";
import { getMonetizationConfig } from "../lib/monetization.js";
import {
  extractEventsFromMatchDetail,
  extractLineupsFromMatchDetail,
  extractScorersFromMatchDetail,
  fetchCompetitionScorers,
  fetchCompetitionTeams,
  fetchCompetitionPlayerOptions,
  fetchMatchDetail,
} from "../services/footballDataService.js";
import { AvatarPresetIdSchema } from "../lib/avatarPresets.js";

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get("/", async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, displayName: true, avatarId: true, avatarJson: true, globalRole: true, isActive: true, createdAt: true },
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
  // Allow updating either displayName, avatarId, or both.
  displayName: z.string().trim().min(2).max(60).optional(),
  avatarId: AvatarPresetIdSchema.optional(),
});

meRouter.put("/profile", async (req: AuthedRequest, res) => {
  const { displayName, avatarId } = UpdateProfileSchema.parse(req.body);

  if (!displayName && !avatarId) {
    return res.status(400).json({ message: "Nessun campo da aggiornare" });
  }

  let user;
  try {
    user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(displayName ? { displayName } : {}),
        ...(avatarId ? { avatarId } : {}),
      },
      select: { id: true, email: true, displayName: true, avatarId: true, avatarJson: true, globalRole: true, isActive: true, createdAt: true },
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

  // Include scorer picks so the FE can show the selected scorer on match cards.
  const matchIds = predictions.map((p) => p.matchId);
  const scorerPicks = matchIds.length
    ? await prisma.scorerPick.findMany({
        where: { userId: req.user!.id, leagueId, matchId: { in: matchIds } },
        select: { matchId: true, playerName: true, playerExternalId: true },
      })
    : [];

  res.json({ predictions, scorerPicks });
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

  // football-data.org may provide real lineups in /v4/matches/{id} depending on plan.
  // We normalize those if available; otherwise we fallback to squads from /competitions/{code}/teams.
  const fdMatchId = (match as any)?.footballDataMatchId ? Number((match as any).footballDataMatchId) : null;
  const competitionCode = String((match as any)?.footballDataCompetitionCode || "").trim();

  let lineups: any[] = [];
  let events: any[] = [];
  let goalScorers: Array<{ id: number | null; name: string }> = [];
  if (fdMatchId) {
    try {
      const detail = await fetchMatchDetail({ matchId: fdMatchId });
      lineups = extractLineupsFromMatchDetail(detail);
      events = extractEventsFromMatchDetail(detail);
      goalScorers = extractScorersFromMatchDetail(detail);

      // Prefer DB logos (often already normalized / stable) when present.
      const htId = Number((match as any)?.footballDataHomeTeamId);
      const atId = Number((match as any)?.footballDataAwayTeamId);
      for (const l of lineups) {
        const tid = Number(l?.team?.id);
        if (Number.isFinite(tid)) {
          if (tid === htId && (match as any)?.homeLogo) l.team.logo = (match as any).homeLogo;
          if (tid === atId && (match as any)?.awayLogo) l.team.logo = (match as any).awayLogo;
        }
      }
    } catch (e: any) {
      // best-effort
      lineups = [];
      events = [];
      goalScorers = [];
    }
  }

  // Fallback: Build pseudo-lineups from squads (if match detail does not include real lineups).
  if (!lineups.length) {
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
            startXI: squad.map((p: any) => ({ id: Number(p?.id) || null, name: String(p?.name || "").trim(), number: null, position: null })),
            substitutes: [],
          };
        };

        if (homeTeam) lineups.push(mapSquad(homeTeam));
        if (awayTeam) lineups.push(mapSquad(awayTeam));
      }
    } catch {
      lineups = [];
    }
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

  const payload = {
    match,
    lineupAvailable,
    lineups,
    events,
    goalScorers,
    scorer: pick ? { playerExternalId: pick.playerExternalId, playerName: pick.playerName } : null,
    scorerEnabled,
    pointsScorer,
    canPickScorer,
  };

  // DEBUG: log normalized response sent to FE (non-production only)
  if (process.env.NODE_ENV !== "1") {
    try {
      console.log("📦 MATCH DETAIL NORMALIZED META:", {
        matchId,
        fdMatchId,
        scorerEnabled,
        lineupTeams: Array.isArray(lineups) ? lineups.length : 0,
        startXI: Array.isArray(lineups) ? lineups.reduce((acc, t: any) => acc + ((t?.startXI?.length as number) || 0), 0) : 0,
        subs: Array.isArray(lineups) ? lineups.reduce((acc, t: any) => acc + ((t?.substitutes?.length as number) || 0), 0) : 0,
        events: Array.isArray(events) ? events.length : 0,
        goalScorers: Array.isArray(goalScorers) ? goalScorers.length : 0,
      });
      console.log("📦 MATCH DETAIL NORMALIZED PAYLOAD:", JSON.stringify(payload, null, 2));
    } catch {
      // ignore logging failures
    }
  }

  res.json(payload);
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



// --- Competition predictions (winner + top scorer) ---
const PutCompetitionPredictionsSchema = z.object({
  winnerTeamId: z.number().int().positive().nullable().optional(),
  winnerTeamName: z.string().trim().min(1).max(200).nullable().optional(),
  topScorerPlayerId: z.number().int().positive().nullable().optional(),
  topScorerPlayerName: z.string().trim().min(1).max(200).nullable().optional(),
});

meRouter.get("/competition-predictions", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;
  await ensureLeagueConfig(leagueId);

  const [rules, settings, picks, superSetting] = await Promise.all([
    prisma.rule.findUnique({ where: { leagueId } }),
    prisma.setting.findUnique({ where: { leagueId } }),
    prisma.competitionPick.findMany({ where: { leagueId, userId: req.user!.id } }),
    prisma.superSetting.findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null as any),
  ]);

  const deadline = settings?.competitionPredictionsDeadline
    ? new Date(settings.competitionPredictionsDeadline)
    : (await prisma.match.findFirst({ orderBy: { kickoffAt: "asc" }, select: { kickoffAt: true } }))?.kickoffAt ?? null;
  const deadlineMs = deadline ? new Date(deadline).getTime() : NaN;
  const canEdit = !deadline || !Number.isFinite(deadlineMs) ? true : Date.now() < deadlineMs;

  const enableWinner = !!(rules as any)?.enableCompetitionWinner;
  const enableTop = !!(rules as any)?.enableCompetitionTopScorer;

  const provider = String(superSetting?.provider || "FOOTBALL_DATA").toUpperCase();
  const competitionCode = String(superSetting?.footballDataCompetitionCode || "").trim();
  const season = superSetting?.footballDataSeason ?? null;

  let teams: any[] = [];
  let scorers: any[] = [];
  if (provider === "FOOTBALL_DATA" && competitionCode) {
    try {
      teams = await fetchCompetitionTeams({ competitionCode });
    } catch {
      teams = [];
    }
    try {
      const resp = await fetchCompetitionScorers({ competitionCode, ...(season ? { season } : {}), limit: 50 });
      scorers = Array.isArray((resp as any)?.scorers) ? (resp as any).scorers : [];
    } catch {
      scorers = [];
    }

    // Best-effort fallback: if scorers endpoint returns empty, use cached/derived squad players.
    if (!scorers.length) {
      const cache = await prisma.competitionOutcome.findUnique({ where: { leagueId } }).catch(() => null as any);
      const fresh = cache?.playerOptionsFetchedAt
        ? Date.now() - new Date(cache.playerOptionsFetchedAt).getTime() < 24 * 60 * 60 * 1000
        : false;

      if (fresh && cache?.playerOptionsJson) {
        scorers = Array.isArray(cache.playerOptionsJson) ? cache.playerOptionsJson : [];
      } else {
        try {
          const players = await fetchCompetitionPlayerOptions({ competitionCode });
          scorers = players.map((p) => ({ id: p.id, name: p.name, teamName: p.teamName ?? null, goals: 0 }));

          await prisma.competitionOutcome.upsert({
            where: { leagueId },
            create: {
              leagueId,
              provider: "FOOTBALL_DATA",
              competitionCode,
              ...(season ? { season: Number(season) } : {}),
              playerOptionsJson: players as any,
              playerOptionsFetchedAt: new Date(),
            },
            update: {
              provider: "FOOTBALL_DATA",
              competitionCode,
              ...(season ? { season: Number(season) } : { season: null }),
              playerOptionsJson: players as any,
              playerOptionsFetchedAt: new Date(),
            },
          });
        } catch {
          scorers = [];
        }
      }
    }
  }

  const pickWinner = picks.find((p) => p.type === "WINNER") || null;
  const pickTop = picks.find((p) => p.type === "TOP_SCORER") || null;

  res.json({
    enabled: { winner: enableWinner, topScorer: enableTop },
    points: {
      winner: (rules as any)?.pointsCompetitionWinner ?? 15,
      topScorer: (rules as any)?.pointsCompetitionTopScorer ?? 12,
    },
    deadline: deadline ? new Date(deadline).toISOString() : null,
    canEdit,
    picks: {
      winner: pickWinner
        ? { teamExternalId: pickWinner.teamExternalId, teamName: pickWinner.teamName, pointsAwarded: pickWinner.pointsAwarded }
        : null,
      topScorer: pickTop
        ? { playerExternalId: pickTop.playerExternalId, playerName: pickTop.playerName, pointsAwarded: pickTop.pointsAwarded }
        : null,
    },
    options: {
      teams: teams
        .map((t: any) => ({ id: Number(t.id), name: String(t.shortName || t.name || "").trim(), crest: (t as any).crest ?? null }))
        .filter((t: any) => Number.isFinite(t.id) && t.name),
      scorers: scorers
        .map((s: any) => ({
          id: Number(s?.player?.id ?? s?.id),
          name: String(s?.player?.name ?? s?.name ?? "").trim(),
          teamName: String(s?.team?.name ?? "").trim() || null,
          goals: Number(s?.goals ?? s?.numberOfGoals ?? 0) || 0,
        }))
        .filter((p: any) => Number.isFinite(p.id) && p.name),
    },
  });
});

meRouter.put("/competition-predictions", requireLeagueMember, async (req: AuthedRequest, res) => {
  const leagueId = resolveLeagueId(req)!;
  const body = PutCompetitionPredictionsSchema.parse(req.body);

  await ensureLeagueConfig(leagueId);
  const [rules, settings] = await Promise.all([
    prisma.rule.findUnique({ where: { leagueId } }),
    prisma.setting.findUnique({ where: { leagueId } }),
  ]);

  const deadline = settings?.competitionPredictionsDeadline
    ? new Date(settings.competitionPredictionsDeadline)
    : (await prisma.match.findFirst({ orderBy: { kickoffAt: "asc" }, select: { kickoffAt: true } }))?.kickoffAt ?? null;

  if (deadline) {
    const ms = new Date(deadline).getTime();
    if (Number.isFinite(ms) && Date.now() >= ms) {
      return res.status(400).json({ message: "Deadline scaduta: pronostici competizione bloccati", reason: "DEADLINE" });
    }
  }

  const enableWinner = !!(rules as any)?.enableCompetitionWinner;
  const enableTop = !!(rules as any)?.enableCompetitionTopScorer;

  if (enableWinner) {
    if (body.winnerTeamId === null) {
      await prisma.competitionPick.deleteMany({ where: { leagueId, userId: req.user!.id, type: "WINNER" } });
    } else if (typeof body.winnerTeamId === "number") {
      await prisma.competitionPick.upsert({
        where: { userId_leagueId_type: { userId: req.user!.id, leagueId, type: "WINNER" } },
        create: {
          userId: req.user!.id,
          leagueId,
          type: "WINNER",
          teamExternalId: body.winnerTeamId,
          teamName: body.winnerTeamName ?? null,
        },
        update: { teamExternalId: body.winnerTeamId, teamName: body.winnerTeamName ?? null },
      });
    }
  }

  if (enableTop) {
    if (body.topScorerPlayerId === null) {
      await prisma.competitionPick.deleteMany({ where: { leagueId, userId: req.user!.id, type: "TOP_SCORER" } });
    } else if (typeof body.topScorerPlayerId === "number") {
      await prisma.competitionPick.upsert({
        where: { userId_leagueId_type: { userId: req.user!.id, leagueId, type: "TOP_SCORER" } },
        create: {
          userId: req.user!.id,
          leagueId,
          type: "TOP_SCORER",
          playerExternalId: body.topScorerPlayerId,
          playerName: body.topScorerPlayerName ?? null,
        },
        update: { playerExternalId: body.topScorerPlayerId, playerName: body.topScorerPlayerName ?? null },
      });
    }
  }

  const picks = await prisma.competitionPick.findMany({ where: { leagueId, userId: req.user!.id } });
  res.json({ picks });
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