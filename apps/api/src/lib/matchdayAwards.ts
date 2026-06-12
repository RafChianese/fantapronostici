import { prisma } from "./prisma.js";
import { filterPredictableMatches } from "./predictableMatches.js";

async function isMatchdayCompleted(matchday: number): Promise<{ completed: boolean; matchIds: string[] }> {
  const allMatches = await prisma.match.findMany({
    where: { matchday },
    select: { id: true, status: true, homeScore: true, awayScore: true, homeTeam: true, awayTeam: true, kickoffAt: true },
  });
  const matches = await filterPredictableMatches(allMatches);
  if (matches.length === 0) return { completed: false, matchIds: [] };
  const completed = matches.every((m) => m.status === "FINISHED" && m.homeScore !== null && m.awayScore !== null);
  return { completed, matchIds: matches.map((m) => m.id) };
}

export async function recomputeMatchdayAwardsForLeague(leagueId: string, matchday?: number) {
  const rules = await prisma.rule.findUnique({ where: { leagueId } });
  if (!rules || !rules.enableMatchdayAwards) return;

  const matchdays =
    typeof matchday === "number"
      ? [matchday]
      : (
          await filterPredictableMatches(await prisma.match.findMany({
            select: { matchday: true, homeTeam: true, awayTeam: true, kickoffAt: true },
            distinct: ["matchday"],
            orderBy: { matchday: "asc" },
          }))
        ).map((m) => m.matchday);

  for (const md of matchdays) {
    const { completed, matchIds } = await isMatchdayCompleted(md);

    // If not completed, ensure no awards are stored for that matchday.
    if (!completed) {
      await prisma.matchdayAward.deleteMany({ where: { leagueId, matchday: md } });
      continue;
    }

    const members = await prisma.leagueMember.findMany({
      where: { leagueId, status: "APPROVED" },
      select: { userId: true },
    });
    const userIds = members.map((m) => m.userId);

    const preds = await prisma.prediction.findMany({
      where: { leagueId, matchId: { in: matchIds } },
      select: { userId: true, totalPoints: true },
    });

    const sums = new Map<string, number>();
    const counts = new Map<string, number>();

    // Only consider users who placed at least one prediction for the matchday.
    for (const p of preds) {
      sums.set(p.userId, (sums.get(p.userId) ?? 0) + Number(p.totalPoints ?? 0));
      counts.set(p.userId, (counts.get(p.userId) ?? 0) + 1);
    }

    const participants = userIds.filter((uid) => (counts.get(uid) ?? 0) > 0);

    // If nobody predicted anything in this matchday, store no awards.
    if (participants.length === 0) {
      await prisma.matchdayAward.deleteMany({ where: { leagueId, matchday: md } });
      continue;
    }

    const max = Math.max(...participants.map((uid) => sums.get(uid) ?? 0), 0);
    const winners = participants.filter((uid) => (sums.get(uid) ?? 0) === max);

await prisma.$transaction([
      prisma.matchdayAward.deleteMany({ where: { leagueId, matchday: md } }),
      ...(winners.length
        ? [
            prisma.matchdayAward.createMany({
              data: winners.map((uid) => ({ leagueId, matchday: md, userId: uid })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }
}

export async function clearMatchdayAwardsForLeague(leagueId: string) {
  await prisma.matchdayAward.deleteMany({ where: { leagueId } });
}
