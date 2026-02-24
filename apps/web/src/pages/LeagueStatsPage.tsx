import React from "react";
import StatsPage from "./StatsPage";

/**
 * League statistics route wrapper.
 *
 * NOTE: a previous refactor left this page returning null, so the route
 * /league-stats appeared blank. We reuse the already-working StatsPage
 * implementation and keep the same layout width/padding used by the app.
 */
export default function LeagueStatsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      <StatsPage />
    </div>
  );
}
