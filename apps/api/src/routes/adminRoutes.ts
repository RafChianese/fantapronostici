import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireLeagueAdmin, requireSuperAdmin, resolveLeagueId, AuthedRequest } from "../middleware/authMiddleware.js";
import { recalcAllScoresForLeague } from "../lib/scoring.js";
import { getLockInfo } from "../lib/lock.js";
import { clearMatchdayAwardsForLeague } from "../lib/matchdayAwards.js";
import { Prisma } from "@prisma/client";
import { runSyncOnce } from "../jobs/syncJob.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";
import { buildAutoLockSentinel, decodeLeagueSettings } from "../lib/leagueConfigEncoding.js";

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

  const lockInfo: any = await getLockInfo(leagueId);
  const lockedSet = new Set<number>((lockInfo?.auto?.lockedMatchdays || []).map((x: any) => Number(x)));

  // If force locked or lockAll, there are no editable predictions
  if (lockInfo?.isForceLocked || lockInfo?.auto?.lockAll) {
    return res.json({
      members: members.map((m: any) => ({
        id: m.id,
        role: m.role,
        status: m.status,
        predictionCheck: { required: 0, done: 0, missing: 0, complete: true },
        user: {
          id: m.user.id,
          email: m.user.email,
          displayName: m.user.displayName,
          isActive: m.user.isActive,
          globalRole: m.user.globalRole,
        },
        createdAt: m.createdAt,
      })),
    });
  }

  const matches = await prisma.match.findMany({
    orderBy: [{ matchday: "asc" }, { kickoffAt: "asc" }],
    select: { id: true, matchday: true, status: true },
  });

  const editableMatchIds = matches
    .filter((mx: any) => mx.status === "NOT_STARTED" && !lockedSet.has(Number(mx.matchday || 1)))
    .map((mx: any) => String(mx.id));

  const required = editableMatchIds.length;
  const userIds = members.map((m: any) => m.userId);

  const counts = required
    ? await prisma.prediction.groupBy({
        by: ["userId"],
        where: { leagueId, userId: { in: userIds }, matchId: { in: editableMatchIds } },
        _count: { _all: true },
      })
    : [];

  const countByUser = new Map<string, number>();
  for (const row of counts as any[]) countByUser.set(String(row.userId), Number(row._count?._all ?? 0));

  res.json({
    members: members.map((m: any) => {
      const done = required ? countByUser.get(String(m.userId)) || 0 : 0;
      const missing = required ? Math.max(0, required - done) : 0;
      return {
        id: m.id,
        role: m.role,
        status: m.status,
        predictionCheck: required
          ? { required, done, missing, complete: missing === 0 }
          : { required: 0, done: 0, missing: 0, complete: true },
        user: {
          id: m.user.id,
          email: m.user.email,
          displayName: m.user.displayName,
          isActive: m.user.isActive,
          globalRole: m.user.globalRole,
        },
        createdAt: m.createdAt,
      };
    }),
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
  const monetization = await prisma.leagueMonetization.findUnique({
    where: { leagueId },
    include: { prizes: true },
  });

  // Backward/forward compatible shaping:
  // - Legacy UI reads entryFeeCents + prizesJson from Rule
  // - New additive table is source of truth if present
  if (monetization && rules) {
    const shaped = {
      ...rules,
      entryFeeCents: typeof monetization.entryFeeCents === "number" ? monetization.entryFeeCents : rules.entryFeeCents,
      prizesJson:
        monetization.prizes?.length
          ? monetization.prizes
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((p) => ({ position: p.position, amountCents: p.amountCents }))
          : (rules as any).prizesJson,
    };
    return res.json({ rules: shaped });
  }
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

  // Optional monetization
  entryFeeCents: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  prizesJson: z
    .array(
      z.object({
        position: z.number().int().min(1).max(100),
        amountCents: z.number().int().min(0).max(1_000_000_000),
      })
    )
    .max(50)
    .optional()
    .nullable(),
});

adminRouter.put("/rules", async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  const data = RulesSchema.parse(req.body);

  // Prisma JSON fields do not accept plain `null` in TS typings.
  // If admin leaves prizes empty, we omit the field.
  const sanitized = {
    ...data,
    prizesJson:
      data.prizesJson === null || typeof data.prizesJson === "undefined"
        ? undefined
        : (data.prizesJson as Prisma.InputJsonValue),
  };

  const rules = await prisma.rule.upsert({
    where: { leagueId },
    create: { leagueId, ...sanitized },
    update: { ...sanitized },
  });

  // --- Monetization additive table (source of truth) ---
  // Keep Rule fields for backward compatibility, but also persist into LeagueMonetization + LeaguePrize.
  const fee = typeof data.entryFeeCents === "number" ? data.entryFeeCents : null;
  const prizes = Array.isArray(data.prizesJson) ? data.prizesJson : null;
  const hasMonetization = fee !== null || (Array.isArray(prizes) && prizes.length > 0);

  if (hasMonetization) {
    const monetization = await prisma.leagueMonetization.upsert({
      where: { leagueId },
      create: { leagueId, ...(fee !== null ? { entryFeeCents: fee } : {}) },
      update: { ...(fee !== null ? { entryFeeCents: fee } : { entryFeeCents: null }) },
    });

    // Replace prizes atomically (simple and safe)
    await prisma.leaguePrize.deleteMany({ where: { monetizationId: monetization.id } });
    if (Array.isArray(prizes) && prizes.length > 0) {
      await prisma.leaguePrize.createMany({
        data: prizes.map((p) => ({ monetizationId: monetization.id, position: p.position, amountCents: p.amountCents })),
        skipDuplicates: true,
      });
    }
  } else {
    // Clear monetization if admin removed everything
    const existing = await prisma.leagueMonetization.findUnique({ where: { leagueId } });
    if (existing) {
      await prisma.leaguePrize.deleteMany({ where: { monetizationId: existing.id } });
      await prisma.leagueMonetization.delete({ where: { leagueId } });
    }
  }

  // If awards are disabled, clear stored awards for consistency.
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
  if (!settings) return res.json({ settings: null });
  const decoded = decodeLeagueSettings(settings.lockUntil);
  // Expose decoded fields to admin UI (still read-only).
  res.json({ settings: { ...settings, ...decoded } });
});

const SettingsSchema = z.object({
  // lockUntil is no longer edited manually. Kept optional for backward compatibility with older web builds.
  // NOTE: Some older deployments/web builds may omit this field entirely.
  // Using `.default()` makes it effectively optional and prevents runtime crashes.
  lockUntil: z.string().datetime().optional().default("1970-01-01T00:00:00.000Z"),
  isForceLocked: z.boolean().optional(),

  // --- Deploy-safe extensions (optional, backward compatible) ---
  // Deprecated (lock is always automatic). Still accepted for backward compatibility.
  lockMode: z.enum(["MANUAL", "AUTO"]).optional(),
  lockOffsetMinutes: z.number().int().min(0).max(120).optional(),
  predictionMode: z.enum(["TOURNAMENT_PRE", "MATCHDAY_BY_MATCHDAY"]).optional(),

  tieBreak1: z.enum(["EXACT", "OUTCOME", "SUM_GOALS"]).optional(),
  tieBreak2: z.enum(["EXACT", "OUTCOME", "SUM_GOALS"]).optional(),
  tieBreak3: z.enum(["EXACT", "OUTCOME", "SUM_GOALS"]).optional(),
});

adminRouter.put("/settings", async (req, res) => {
  const leagueId = getLeagueOr400(req, res);
  if (!leagueId) return;

  const body = SettingsSchema.parse(req.body);

  // Deploy-safe encoding into Setting.lockUntil (no new DB columns).
  // NEW: lock is ALWAYS automatic. We only persist (predictionMode + lockOffsetMinutes) via sentinel.
  const existing = await prisma.setting.findUnique({ where: { leagueId } });
  const existingDecoded = existing
    ? decodeLeagueSettings(existing.lockUntil)
    : { lockMode: "AUTO", lockOffsetMinutes: 30, predictionMode: "MATCHDAY_BY_MATCHDAY" as const };

  const predictionMode = (body.predictionMode ?? existingDecoded.predictionMode) as any;
  const lockOffsetMinutes = typeof body.lockOffsetMinutes === "number" ? body.lockOffsetMinutes : existingDecoded.lockOffsetMinutes;

  const lockUntilToStore = buildAutoLockSentinel(predictionMode, lockOffsetMinutes);

  const settings = await prisma.setting.upsert({
    where: { leagueId },
    create: {
      leagueId,
      lockUntil: lockUntilToStore,
      isForceLocked: body.isForceLocked ?? false,
      ...(body.tieBreak1 ? { tieBreak1: body.tieBreak1 } : {}),
      ...(body.tieBreak2 ? { tieBreak2: body.tieBreak2 } : {}),
      ...(body.tieBreak3 ? { tieBreak3: body.tieBreak3 } : {}),
    },
    update: {
      lockUntil: lockUntilToStore,
      ...(typeof body.isForceLocked === "boolean" ? { isForceLocked: body.isForceLocked } : {}),
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
    create: { leagueId, lockUntil: new Date(), isForceLocked: true },
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
