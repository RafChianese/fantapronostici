// Deploy-safe encoding for league configuration WITHOUT DB migrations.
// We reuse Setting.lockUntil as a persistence carrier.
//
// Sentinel format (UTC):
// - If lockUntil year !== 2099 => MANUAL mode (lockUntil is the manual deadline)
// - If lockUntil year === 2099 => AUTO mode
//   - day=1 => MATCHDAY_BY_MATCHDAY predictions mode
//   - day=2 => TOURNAMENT_PRE predictions mode
//   - hour/minute => lockOffsetMinutes encoded as (hour*60 + minute), clamped 0..120
//
// Why this works:
// - No new DB columns
// - Backward compatible (existing leagues keep manual lockUntil)

export type LockMode = "MANUAL" | "AUTO_MATCHDAY";
export type PredictionsMode = "MATCHDAY_BY_MATCHDAY" | "TOURNAMENT_PRE";

export type LeagueConfigDecoded = {
  lockMode: LockMode;
  predictionsMode: PredictionsMode;
  lockOffsetMinutes: number; // 0..120
  manualLockUntil: Date; // only meaningful when lockMode=MANUAL
};

const SENTINEL_YEAR = 2099;

export function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function decodeLeagueConfigFromLockUntil(lockUntil: Date): LeagueConfigDecoded {
  const manualLockUntil = lockUntil;
  const lockMode: LockMode = lockUntil.getUTCFullYear() === SENTINEL_YEAR ? "AUTO_MATCHDAY" : "MANUAL";

  // defaults
  let predictionsMode: PredictionsMode = "MATCHDAY_BY_MATCHDAY";
  let lockOffsetMinutes = 30;

  if (lockMode === "AUTO_MATCHDAY") {
    const day = lockUntil.getUTCDate();
    predictionsMode = day === 2 ? "TOURNAMENT_PRE" : "MATCHDAY_BY_MATCHDAY";
    const encoded = lockUntil.getUTCHours() * 60 + lockUntil.getUTCMinutes();
    lockOffsetMinutes = clamp(encoded, 0, 120);
  }

  return {
    lockMode,
    predictionsMode,
    lockOffsetMinutes,
    manualLockUntil,
  };
}

export function encodeLockUntilFromLeagueConfig(cfg: {
  lockMode: LockMode;
  predictionsMode: PredictionsMode;
  lockOffsetMinutes: number;
  manualLockUntil: Date;
}): Date {
  if (cfg.lockMode === "MANUAL") {
    return cfg.manualLockUntil;
  }

  const off = clamp(cfg.lockOffsetMinutes ?? 30, 0, 120);
  const day = cfg.predictionsMode === "TOURNAMENT_PRE" ? 2 : 1;
  const hours = Math.floor(off / 60);
  const mins = off % 60;

  // Fixed month/day to avoid DST confusion: 2099-01-[day] HH:MM:00Z
  return new Date(Date.UTC(SENTINEL_YEAR, 0, day, hours, mins, 0, 0));
}

export function isSentinelAuto(lockUntil: Date) {
  return lockUntil.getUTCFullYear() === SENTINEL_YEAR;
}
