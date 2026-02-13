export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const LEAGUE_LOGO_BUCKET = (import.meta.env.VITE_SUPABASE_LEAGUE_LOGO_BUCKET as string | undefined) || "league-logos";

/** Deterministic public URL (no DB needed). Returns null if SUPABASE URL isn't configured. */
export function getLeagueLogoUrl(leagueId: string): string | null {
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${LEAGUE_LOGO_BUCKET}/${leagueId}.png`;
}
