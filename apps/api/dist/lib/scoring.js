import { prisma } from "./prisma.js";
import { recomputeMatchdayAwardsForLeague } from "./matchdayAwards.js";
import { getPredictionWindow, isPredictableMatch } from "./predictableMatches.js";
function outcome(home, away) {
    if (home > away)
        return "H";
    if (home < away)
        return "A";
    return "D";
}
function decimalToNumber(value, fallback = 0) {
    const n = Number(value ?? fallback);
    return Number.isFinite(n) ? n : fallback;
}
function computeAdjustedPoints(params) {
    const { mode } = params;
    let ex = params.pointsExact;
    let out = params.pointsOutcome;
    let sum = params.pointsSumGoals;
    let uo = params.pointsUnderOver;
    const uoWithExact = params.allowUnderOverWithExact ?? true;
    const uoWithOutcome = params.allowUnderOverWithOutcome ?? true;
    const uoWithSum = params.allowUnderOverWithSumGoals ?? true;
    if (mode === "CUMULATIVE") {
        return { pointsExact: ex, pointsOutcome: out, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: ex + out + sum + uo };
    }
    if (mode === "BEST_ONLY") {
        const max = Math.max(ex, out, sum, uo);
        if (max <= 0)
            return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: 0 };
        // Deterministic priority if tie: EXACT > OUTCOME > SUM_GOALS > UNDER/OVER
        if (ex === max)
            return { pointsExact: ex, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: ex };
        if (out === max)
            return { pointsExact: 0, pointsOutcome: out, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: out };
        if (sum === max)
            return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: sum, pointsUnderOver: 0, totalPoints: sum };
        return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: uo, totalPoints: uo };
    }
    // MIXED: allow fine-grained cumulability between categories.
    // Under/Over (if enabled) is NOT always cumulative: it respects per-category flags.
    if (ex > 0) {
        out = out > 0 && params.allowOutcomeWithExact ? out : 0;
        sum = sum > 0 && params.allowSumGoalsWithExact ? sum : 0;
        uo = uo > 0 && uoWithExact ? uo : 0;
        return { pointsExact: ex, pointsOutcome: out, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: ex + out + sum + uo };
    }
    if (out > 0) {
        sum = sum > 0 && params.allowSumGoalsWithOutcome ? sum : 0;
        uo = uo > 0 && uoWithOutcome ? uo : 0;
        return { pointsExact: 0, pointsOutcome: out, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: out + sum + uo };
    }
    if (sum > 0) {
        uo = uo > 0 && uoWithSum ? uo : 0;
        return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: sum, pointsUnderOver: uo, totalPoints: sum + uo };
    }
    // Under/Over only
    if (uo > 0) {
        return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: uo, totalPoints: uo };
    }
    return { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, totalPoints: 0 };
}
function applyJollyMultiplier(adjusted, multiplier) {
    const m = Math.max(1, Math.floor(multiplier || 1));
    if (m === 1)
        return adjusted;
    return {
        pointsExact: adjusted.pointsExact * m,
        pointsOutcome: adjusted.pointsOutcome * m,
        pointsSumGoals: adjusted.pointsSumGoals * m,
        pointsUnderOver: adjusted.pointsUnderOver * m,
        pointsScorer: adjusted.pointsScorer * m,
        totalPoints: adjusted.totalPoints * m,
    };
}
function scorerHit(match, scorerExternalId) {
    const sel = String(scorerExternalId || "").trim();
    if (!sel)
        return false;
    const m = sel.match(/^(?:afp:|fdp:)?(\d+)$/i);
    const pid = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(pid))
        return false;
    const arr = Array.isArray(match?.goalScorersJson) ? match.goalScorersJson : [];
    return arr.some((x) => Number(x?.id) === pid);
}
async function getRulesOrThrow(leagueId) {
    const rules = await prisma.rule.findUnique({ where: { leagueId } });
    if (!rules)
        throw new Error("Missing Rule row for league (seed your DB).");
    return rules;
}
export async function recalcAllScoresForLeague(leagueId) {
    const [rules, matches, predictions, jollyRows, scorerPicks] = await Promise.all([
        getRulesOrThrow(leagueId),
        prisma.match.findMany(),
        prisma.prediction.findMany({ where: { leagueId } }),
        prisma.matchdayJolly.findMany({ where: { leagueId } }),
        prisma.scorerPick.findMany({ where: { leagueId } }),
    ]);
    const predictionWindow = await getPredictionWindow();
    const matchById = new Map(matches.map((m) => [m.id, m]));
    const jollyByMatchId = new Set(jollyRows.map((r) => String(r.matchId)));
    const scorerByUserMatch = new Map();
    for (const sp of scorerPicks)
        scorerByUserMatch.set(`${sp.userId}:${sp.matchId}`, String(sp.playerExternalId));
    const updates = [];
    for (const p of predictions) {
        const m = matchById.get(p.matchId);
        if (!m || !isPredictableMatch(m, predictionWindow) || m.status !== "FINISHED" || m.homeScore === null || m.awayScore === null) {
            updates.push({ id: p.id, pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, pointsScorer: 0, totalPoints: 0 });
            continue;
        }
        let pointsExact = 0, pointsOutcome = 0, pointsSumGoals = 0, pointsUnderOver = 0;
        if (p.homeGoals === m.homeScore && p.awayGoals === m.awayScore)
            pointsExact = decimalToNumber(rules.pointsExact);
        if (outcome(p.homeGoals, p.awayGoals) === outcome(m.homeScore, m.awayScore))
            pointsOutcome = decimalToNumber(rules.pointsOutcome);
        if (p.homeGoals + p.awayGoals === m.homeScore + m.awayScore)
            pointsSumGoals = decimalToNumber(rules.pointsSumGoals);
        if (rules.enableUnderOver25) {
            const predOver = p.homeGoals + p.awayGoals > 2;
            const realOver = m.homeScore + m.awayScore > 2;
            if (predOver === realOver)
                pointsUnderOver = decimalToNumber(rules.pointsUnderOver25);
        }
        const adjustedBase = computeAdjustedPoints({
            mode: rules.scoringMode,
            pointsExact,
            pointsOutcome,
            pointsSumGoals,
            pointsUnderOver,
            allowOutcomeWithExact: rules.allowOutcomeWithExact,
            allowSumGoalsWithExact: rules.allowSumGoalsWithExact,
            allowSumGoalsWithOutcome: rules.allowSumGoalsWithOutcome,
            allowUnderOverWithExact: rules.allowUnderOverWithExact,
            allowUnderOverWithOutcome: rules.allowUnderOverWithOutcome,
            allowUnderOverWithSumGoals: rules.allowUnderOverWithSumGoals,
        });
        const sel = scorerByUserMatch.get(`${p.userId}:${p.matchId}`) || null;
        const pointsScorer = rules.enableScorer && scorerHit(m, sel) ? decimalToNumber(rules.pointsScorer) : 0;
        const adjusted = { ...adjustedBase, pointsScorer, totalPoints: adjustedBase.totalPoints + pointsScorer };
        const withJolly = rules.enableJolly && jollyByMatchId.has(String(m.id)) ? applyJollyMultiplier(adjusted, rules.jollyMultiplier) : adjusted;
        updates.push({ id: p.id, ...withJolly });
    }
    if (updates.length === 0)
        return;
    await prisma.$transaction(updates.map((u) => prisma.prediction.update({ where: { id: u.id }, data: u })));
    // Refresh matchday awards (if enabled)
    await recomputeMatchdayAwardsForLeague(leagueId);
}
export async function recalcScoresForMatchAcrossLeagues(matchId) {
    // When a match result updates, we need to recalc predictions for ALL leagues.
    const leagues = await prisma.league.findMany({ select: { id: true } });
    for (const l of leagues) {
        await recalcScoresForMatchForLeague(l.id, matchId);
    }
}
export async function recalcScoresForMatchForLeague(leagueId, matchId) {
    const [rules, match, predictions, jollyRow] = await Promise.all([
        getRulesOrThrow(leagueId),
        prisma.match.findUnique({ where: { id: matchId } }),
        prisma.prediction.findMany({ where: { leagueId, matchId } }),
        prisma.matchdayJolly.findFirst({ where: { leagueId, matchId } }),
    ]);
    if (!match)
        return;
    const predictionWindow = await getPredictionWindow();
    if (!isPredictableMatch(match, predictionWindow)) {
        await prisma.prediction.updateMany({
            where: { leagueId, matchId },
            data: { pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, pointsScorer: 0, totalPoints: 0 },
        });
        return;
    }
    const updates = [];
    const picks = await prisma.scorerPick.findMany({ where: { leagueId, matchId } });
    const scorerByUser = new Map();
    for (const sp of picks)
        scorerByUser.set(String(sp.userId), String(sp.playerExternalId));
    for (const p of predictions) {
        if (match.status !== "FINISHED" || match.homeScore === null || match.awayScore === null) {
            updates.push({ id: p.id, pointsExact: 0, pointsOutcome: 0, pointsSumGoals: 0, pointsUnderOver: 0, pointsScorer: 0, totalPoints: 0 });
            continue;
        }
        let pointsExact = 0, pointsOutcome = 0, pointsSumGoals = 0, pointsUnderOver = 0;
        if (p.homeGoals === match.homeScore && p.awayGoals === match.awayScore)
            pointsExact = decimalToNumber(rules.pointsExact);
        if (outcome(p.homeGoals, p.awayGoals) === outcome(match.homeScore, match.awayScore))
            pointsOutcome = decimalToNumber(rules.pointsOutcome);
        if (p.homeGoals + p.awayGoals === match.homeScore + match.awayScore)
            pointsSumGoals = decimalToNumber(rules.pointsSumGoals);
        if (rules.enableUnderOver25) {
            const predOver = p.homeGoals + p.awayGoals > 2;
            const realOver = match.homeScore + match.awayScore > 2;
            if (predOver === realOver)
                pointsUnderOver = decimalToNumber(rules.pointsUnderOver25);
        }
        const adjustedBase = computeAdjustedPoints({
            mode: rules.scoringMode,
            pointsExact,
            pointsOutcome,
            pointsSumGoals,
            pointsUnderOver,
            allowOutcomeWithExact: rules.allowOutcomeWithExact,
            allowSumGoalsWithExact: rules.allowSumGoalsWithExact,
            allowSumGoalsWithOutcome: rules.allowSumGoalsWithOutcome,
            allowUnderOverWithExact: rules.allowUnderOverWithExact,
            allowUnderOverWithOutcome: rules.allowUnderOverWithOutcome,
            allowUnderOverWithSumGoals: rules.allowUnderOverWithSumGoals,
        });
        const sel = scorerByUser.get(String(p.userId)) || null;
        const pointsScorer = rules.enableScorer && scorerHit(match, sel) ? decimalToNumber(rules.pointsScorer) : 0;
        const adjusted = { ...adjustedBase, pointsScorer, totalPoints: adjustedBase.totalPoints + pointsScorer };
        const withJolly = rules.enableJolly && !!jollyRow ? applyJollyMultiplier(adjusted, rules.jollyMultiplier) : adjusted;
        updates.push({ id: p.id, ...withJolly });
    }
    if (updates.length === 0)
        return;
    await prisma.$transaction(updates.map((u) => prisma.prediction.update({ where: { id: u.id }, data: u })));
    // Refresh awards for this matchday only (if enabled)
    await recomputeMatchdayAwardsForLeague(leagueId, match.matchday);
}
