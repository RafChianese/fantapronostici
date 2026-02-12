import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireLeagueMember, resolveLeagueId } from "../middleware/authMiddleware.js";
import { assertPredictionsEditableForMatches, getLockInfo } from "../lib/lock.js";
import { recalcAllScoresForLeague } from "../lib/scoring.js";
import { getMonetizationConfig } from "../lib/monetization.js";
export const meRouter = Router();
meRouter.use(requireAuth);
meRouter.get("/", async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, email: true, displayName: true, globalRole: true, isActive: true, createdAt: true },
    });
    const memberships = await prisma.leagueMember.findMany({
        where: { userId: req.user.id },
        include: { league: true },
        orderBy: { createdAt: "desc" },
    });
    res.json({ user, memberships });
});
// Update profile (display name)
const UpdateProfileSchema = z.object({
    displayName: z.string().trim().min(2).max(60),
});
meRouter.put("/profile", async (req, res) => {
    const { displayName } = UpdateProfileSchema.parse(req.body);
    let user;
    try {
        user = await prisma.user.update({
            where: { id: req.user.id },
            data: { displayName },
            select: { id: true, email: true, displayName: true, globalRole: true, isActive: true, createdAt: true },
        });
    }
    catch (e) {
        if (e?.code === "P2002") {
            const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(",") : String(e?.meta?.target || "");
            if (target.includes("displayName"))
                return res.status(400).json({ message: "Nome visualizzato già in uso" });
        }
        throw e;
    }
    res.json({ user });
});
meRouter.get("/lock", async (req, res) => {
    const leagueId = resolveLeagueId(req);
    if (!leagueId)
        return res.status(400).json({ message: "Missing leagueId" });
    const info = await getLockInfo(leagueId);
    res.json({
        lock: {
            lockUntil: info.lockUntil,
            isForceLocked: info.isForceLocked,
            lockedByTime: info.lockedByTime,
            isLocked: info.isLocked,
            lockAll: !!info?.auto?.lockAll,
            lockedMatchdays: (info?.auto?.lockedMatchdays || []).map((x) => Number(x)),
        },
    });
});
meRouter.get("/predictions", requireLeagueMember, async (req, res) => {
    const leagueId = resolveLeagueId(req);
    const predictions = await prisma.prediction.findMany({
        where: { userId: req.user.id, leagueId },
        include: { match: true },
        orderBy: { match: { kickoffAt: "asc" } },
    });
    res.json({ predictions });
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
meRouter.put("/predictions", requireLeagueMember, async (req, res) => {
    const leagueId = resolveLeagueId(req);
    const { predictions } = PutPredictionsSchema.parse(req.body);
    try {
        await assertPredictionsEditableForMatches(leagueId, predictions.map((p) => p.matchId));
    }
    catch (e) {
        if (e?.status)
            return res.status(e.status).json(e.payload ?? { message: e.message });
        throw e;
    }
    if (!predictions.length) {
        return res.status(400).json({ message: "Nessun pronostico da salvare.", reason: "EMPTY_PREDICTIONS" });
    }
    const upserts = predictions.map((p) => prisma.prediction.upsert({
        where: { userId_leagueId_matchId: { userId: req.user.id, leagueId, matchId: p.matchId } },
        create: { userId: req.user.id, leagueId, matchId: p.matchId, homeGoals: p.homeGoals, awayGoals: p.awayGoals },
        update: { homeGoals: p.homeGoals, awayGoals: p.awayGoals },
    }));
    await prisma.$transaction(upserts);
    // Recalc for this league (in case match already finished / or rules changed)
    await recalcAllScoresForLeague(leagueId);
    return res.json({ ok: true });
});
// Rewarded-ad unlock (client-side simulated by default): unlock viewing other users' predictions.
// Unlock is GLOBAL (valid across all leagues).
meRouter.get("/ad-unlock", async (req, res) => {
    const row = await prisma.adUnlock.findUnique({ where: { userId: req.user.id } });
    const now = new Date();
    const isUnlocked = !!row && row.expiresAt.getTime() > now.getTime();
    res.json({ unlocked: isUnlocked, expiresAt: row?.expiresAt ?? null });
});
meRouter.post("/ad-unlock", async (req, res) => {
    const cfg = await getMonetizationConfig();
    const now = new Date();
    const minutes = Math.max(1, Math.min(120, cfg.unlockMinutes || 5));
    const expiresAt = new Date(now.getTime() + minutes * 60 * 1000);
    const row = await prisma.adUnlock.upsert({
        where: { userId: req.user.id },
        update: { expiresAt },
        create: { userId: req.user.id, expiresAt },
    });
    // Log unlock for stats
    await prisma.adUnlockLog.create({ data: { userId: req.user.id, minutes } });
    res.json({ unlocked: true, expiresAt: row.expiresAt });
});
// Change password (logged-in)
const ChangePasswordSchema = z.object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(8),
});
meRouter.put("/password", async (req, res) => {
    const { currentPassword, newPassword } = ChangePasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.isActive)
        return res.status(401).json({ message: "Utente non valido" });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok)
        return res.status(400).json({ message: "Password attuale non corretta" });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    return res.json({ ok: true });
});
