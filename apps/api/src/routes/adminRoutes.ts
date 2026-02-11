import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireLeagueAdmin, requireSuperAdmin, resolveLeagueId, AuthedRequest } from "../middleware/authMiddleware.js";
import { recalcAllScoresForLeague } from "../lib/scoring.js";
import { clearMatchdayAwardsForLeague } from "../lib/matchdayAwards.js";
import { runSyncOnce } from "../jobs/syncJob.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireLeagueAdmin);

function getLeagueOr400(req: any, res: any): string | null {
  const leagueId = resolveLeagueId(req);
  if (!leagueId) {
    res.status(400).json({ message: "Missing leagueId (header x-league-id or query leagueId)" });
    return null;
  }
  return leagueId;
}

// --- Members management (approve/role) ---
adminRouter.get("/members", async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: { user: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  res.json({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      status: m.status,
      user: { id: m.user.id, email: m.user.email, displayName: m.user.displayName, isActive: m.user.isActive, globalRole: m.user.globalRole },
      createdAt: m.createdAt,
    })),
  });
});

const PatchMemberSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  role: z.enum(["MEMBER", "ADMIN"]).optional(),
});

adminRouter.patch("/members/:id", async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  const { status, role } = PatchMemberSchema.parse(req.body);
  const member = await prisma.leagueMember.findFirst({ where: { id: req.params.id, leagueId } });
  if (!member) return res.status(404).json({ message: "Not found" });
  // Safety: the league must always have at least 1 ADMIN.
  // If you are trying to demote an admin to member, ensure there is another approved admin.
  if (role === "MEMBER" && member.role === "ADMIN") {
    const adminsCount = await prisma.leagueMember.count({
      where: { leagueId, role: "ADMIN", status: "APPROVED" },
    });
    if (adminsCount <= 1) {
      return res.status(400).json({ message: "Impossibile: la lega deve avere almeno 1 admin." });
    }
  }


  const updated = await prisma.leagueMember.update({
    where: { id: member.id },
    data: { ...(status ? { status } : {}), ...(role ? { role } : {}) },
  });

  // If membership changes, leaderboard may change
  await recalcAllScoresForLeague(leagueId);
  res.json({ member: updated });
});

// --- Rules ---
adminRouter.get("/rules", async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  await ensureLeagueConfig(leagueId);
  const rules = await prisma.rule.findUnique({ where: { leagueId } });
  res.json({ rules });
});

const RulesSchema = z.object({
  pointsExact: z.number().int().min(0).max(50),
  pointsOutcome: z.number().int().min(0).max(50),
  pointsSumGoals: z.number().int().min(0).max(50),
  enableUnderOver25: z.boolean().optional().default(false),
  pointsUnderOver25: z.number().int().min(0).max(50).optional().default(1),
  enableMatchdayAwards: z.boolean().optional().default(false),
  scoringMode: z.enum(["CUMULATIVE", "BEST_ONLY", "MIXED"]),
  allowOutcomeWithExact: z.boolean(),
  allowSumGoalsWithExact: z.boolean(),
  allowSumGoalsWithOutcome: z.boolean(),
});

adminRouter.put("/rules", async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  const data = RulesSchema.parse(req.body);

  const rules = await prisma.rule.upsert({
    where: { leagueId },
    create: { leagueId, ...data },
    update: { ...data },
  });

  // If awards are disabled, clear stored awards for consistency.
  if (!rules.enableMatchdayAwards) {
    await clearMatchdayAwardsForLeague(leagueId);
  }

  if (!rules.enableMatchdayAwards) {
    await clearMatchdayAwardsForLeague(leagueId);
  }

  await recalcAllScoresForLeague(leagueId);
  res.json({ rules });
});

// --- Settings (lock) ---
adminRouter.get("/settings", async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  await ensureLeagueConfig(leagueId);
  const settings = await prisma.setting.findUnique({ where: { leagueId } });
  res.json({ settings });
});

const SettingsSchema = z.object({
  lockUntil: z.string().datetime(),
  isForceLocked: z.boolean().optional(),
  lockMode: z.enum(["MANUAL_UNTIL", "AUTO_MATCHDAY_30MIN"]).optional(),
  tieBreak1: z.enum(["EXACT", "OUTCOME", "SUM_GOALS"]).optional(),
  tieBreak2: z.enum(["EXACT", "OUTCOME", "SUM_GOALS"]).optional(),
  tieBreak3: z.enum(["EXACT", "OUTCOME", "SUM_GOALS"]).optional(),
});

adminRouter.put("/settings", async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  const body = SettingsSchema.parse(req.body);
  const settings = await prisma.setting.upsert({
    where: { leagueId },
    create: {
      leagueId,
      lockUntil: new Date(body.lockUntil),
      isForceLocked: body.isForceLocked ?? false,
      ...(body.lockMode ? { lockMode: body.lockMode } : {}),
      ...(body.tieBreak1 ? { tieBreak1: body.tieBreak1 } : {}),
      ...(body.tieBreak2 ? { tieBreak2: body.tieBreak2 } : {}),
      ...(body.tieBreak3 ? { tieBreak3: body.tieBreak3 } : {}),
    },
    update: {
      lockUntil: new Date(body.lockUntil),
      ...(typeof body.isForceLocked === "boolean" ? { isForceLocked: body.isForceLocked } : {}),
      ...(body.lockMode ? { lockMode: body.lockMode } : {}),
      ...(body.tieBreak1 ? { tieBreak1: body.tieBreak1 } : {}),
      ...(body.tieBreak2 ? { tieBreak2: body.tieBreak2 } : {}),
      ...(body.tieBreak3 ? { tieBreak3: body.tieBreak3 } : {}),
    },
  });

  res.json({ settings });
});

adminRouter.post("/lock-now", async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  const settings = await prisma.setting.upsert({
    where: { leagueId },
    create: { leagueId, lockUntil: new Date(), isForceLocked: true, lockMode: "MANUAL_UNTIL" },
    update: { isForceLocked: true },
  });

  res.json({ settings });
});

// --- Manual match result (fallback) ---
const ManualResultSchema = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "FINISHED"]),
  homeScore: z.number().int().min(0).max(99).nullable(),
  awayScore: z.number().int().min(0).max(99).nullable(),
});

adminRouter.put("/matches/:id/result", requireSuperAdmin, async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  const { status, homeScore, awayScore } = ManualResultSchema.parse(req.body);

  const existing = await prisma.match.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ message: "Not found" });
  if (existing.source === "API_FOOTBALL" || existing.source === "FOOTBALL_DATA") {
    return res.status(400).json({ message: "Risultati non modificabili manualmente per partite importate da provider esterno." });
  }

  const match = await prisma.match.update({
    where: { id: req.params.id },
    data: { status, homeScore, awayScore, source: "MANUAL" },
  });

  await recalcAllScoresForLeague(leagueId);
  res.json({ match });
});

// --- Force sync ---
adminRouter.post("/sync", requireSuperAdmin, async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  const report = await runSyncOnce();
  await recalcAllScoresForLeague(leagueId);
  res.json({ report });
});

// --- Export leaderboard CSV (league-scoped) ---
adminRouter.get("/leaderboard.csv", async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  const rows = await prisma.prediction.groupBy({
    by: ["userId"],
    where: { leagueId },
    _sum: { totalPoints: true },
  });

  const members = await prisma.leagueMember.findMany({
    where: { leagueId, status: "APPROVED" },
    include: { user: true },
  });

  const mapName = new Map(members.map((m) => [m.userId, m.user.displayName]));
  const mapEmail = new Map(members.map((m) => [m.userId, m.user.email]));

  const data = rows
    .map((r) => ({ userId: r.userId, points: r._sum.totalPoints ?? 0 }))
    .sort((a, b) => b.points - a.points);

  const csv = ["displayName,email,totalPoints"]
    .concat(data.map((d) => `${JSON.stringify(mapName.get(d.userId) ?? d.userId)},${JSON.stringify(mapEmail.get(d.userId) ?? "")},${d.points}`))
    .join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=leaderboard.csv");
  res.send(csv);
});
