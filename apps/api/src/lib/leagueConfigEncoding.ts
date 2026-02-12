/**
 * Deploy-safe encoding of additional league settings WITHOUT adding DB columns.
 *
 * We only have Setting.lockUntil (DateTime) + isForceLocked (boolean) in DB.
 * To avoid migrations, we encode extra settings in lockUntil.
 *
 * Encoding (UTC):
 * - lockMode:
 *   - MANUAL: lockUntil.getUTCFullYear() !== 2099
 *   - AUTO:   lockUntil.getUTCFullYear() === 2099
 *
 * - When lockMode=AUTO:
 *   - day=1 => MATCHDAY_BY_MATCHDAY
 *   - day=2 => TOURNAMENT_PRE
 *   - hour/minute encode lockOffsetMinutes as minutes since midnight (0..120)
 *     (offset = hour*60 + minute, clamped)
 *
 * - predictionMode (always, even in MANUAL): encoded in milliseconds
 *   - ms >= 500 => TOURNAMENT_PRE
 *   - ms <  500 => MATCHDAY_BY_MATCHDAY
 *
 * Notes:
 * - Milliseconds encoding is harmless for lock timing (sub-second).
 * - UI/API should display lockUntil without milliseconds.
 */

export type LockMode = "MANUAL" | "AUTO";
export type PredictionMode = "MATCHDAY_BY_MATCHDAY" | "TOURNAMENT_PRE";

export type DecodedLeagueSettings = {
  lockMode: LockMode;
  lockOffsetMinutes: number; // 0..120
  predictionMode: PredictionMode;
};

const AUTO_YEAR = 2099;

export function clampInt(n: number, min: number, max: number) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

export function decodeLeagueSettings(lockUntil: Date): DecodedLeagueSettings {
  const y = lockUntil.getUTCFullYear();
  const ms = lockUntil.getUTCMilliseconds();
  const predictionMode: PredictionMode = ms >= 500 ? "TOURNAMENT_PRE" : "MATCHDAY_BY_MATCHDAY";

  const lockMode: LockMode = y === AUTO_YEAR ? "AUTO" : "MANUAL";
  if (lockMode === "AUTO") {
    // hour/minute encode lockOffsetMinutes as minutes since midnight (0..120)
    // NOTE: 0 is a valid value ("blocca all'inizio"), so do NOT coerce to default.
    const offset = clampInt(lockUntil.getUTCHours() * 60 + lockUntil.getUTCMinutes(), 0, 120);
    // day=1 matchday-by-matchday, day=2 tournament-pre (fallback to predictionMode)
    const d = lockUntil.getUTCDate();
    const pm: PredictionMode = d === 2 ? "TOURNAMENT_PRE" : d === 1 ? "MATCHDAY_BY_MATCHDAY" : predictionMode;
    return { lockMode, lockOffsetMinutes: offset, predictionMode: pm };
  }

  // Manual lock: offset is irrelevant but still return default.
  return { lockMode, lockOffsetMinutes: 30, predictionMode };
}

export function encodePredictionModeMs(base: Date, predictionMode: PredictionMode): Date {
  const d = new Date(base);
  d.setUTCMilliseconds(predictionMode === "TOURNAMENT_PRE" ? 500 : 0);
  return d;
}

export function buildAutoLockSentinel(predictionMode: PredictionMode, lockOffsetMinutes: number): Date {
  const offset = clampInt(lockOffsetMinutes, 0, 120);
  const day = predictionMode === "TOURNAMENT_PRE" ? 2 : 1;
  const hh = Math.floor(offset / 60);
  const mm = offset % 60;
  const d = new Date(Date.UTC(AUTO_YEAR, 0, day, hh, mm, 0, predictionMode === "TOURNAMENT_PRE" ? 500 : 0));
  return d;
}

export function isAutoSentinel(lockUntil: Date): boolean {
  return lockUntil.getUTCFullYear() === AUTO_YEAR;
}

export function stripMs(d: Date): Date {
  const x = new Date(d);
  x.setUTCMilliseconds(0);
  return x;
}
