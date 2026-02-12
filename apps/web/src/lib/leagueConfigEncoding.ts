// Deploy-safe league config encoding without DB migrations.
// Mirrors apps/api/src/lib/leagueConfigEncoding.ts

export type LockMode = "MANUAL" | "AUTO_MATCHDAY";
export type PredictionsMode = "MATCHDAY_BY_MATCHDAY" | "TOURNAMENT_PRE";

export type DecodedConfig = {
  lockMode: LockMode;
  predictionsMode: PredictionsMode;
  lockOffsetMinutes: number;
  manualLockUntilIso: string; // ISO
};

const SENTINEL_YEAR = 2099;

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function decodeConfigFromLockUntil(lockUntilIso: string): DecodedConfig {
  const d = new Date(lockUntilIso);
  if (!Number.isFinite(d.getTime())) {
    return { lockMode: "MANUAL", predictionsMode: "MATCHDAY_BY_MATCHDAY", lockOffsetMinutes: 30, manualLockUntilIso: lockUntilIso };
  }
  const lockMode: LockMode = d.getUTCFullYear() === SENTINEL_YEAR ? "AUTO_MATCHDAY" : "MANUAL";
  let predictionsMode: PredictionsMode = "MATCHDAY_BY_MATCHDAY";
  let lockOffsetMinutes = 30;
  if (lockMode === "AUTO_MATCHDAY") {
    const day = d.getUTCDate();
    predictionsMode = day === 2 ? "TOURNAMENT_PRE" : "MATCHDAY_BY_MATCHDAY";
    const encoded = d.getUTCHours() * 60 + d.getUTCMinutes();
    lockOffsetMinutes = clamp(encoded, 0, 120);
  }
  return { lockMode, predictionsMode, lockOffsetMinutes, manualLockUntilIso: lockUntilIso };
}

export function encodeLockUntilIso(cfg: { lockMode: LockMode; predictionsMode: PredictionsMode; lockOffsetMinutes: number; manualLockUntilIso: string }): string {
  if (cfg.lockMode === "MANUAL") return cfg.manualLockUntilIso;
  const off = clamp(cfg.lockOffsetMinutes ?? 30, 0, 120);
  const day = cfg.predictionsMode === "TOURNAMENT_PRE" ? 2 : 1;
  const hours = Math.floor(off / 60);
  const mins = off % 60;
  return new Date(Date.UTC(SENTINEL_YEAR, 0, day, hours, mins, 0, 0)).toISOString();
}
