import { Badge } from "./ui";

type Props = {
  totalPoints: number;
  rank?: number;
  hasScorer?: boolean;
  hasCompetitionPick?: boolean;
};

export function AchievementsStrip({
  totalPoints,
  rank,
  hasScorer,
  hasCompetitionPick,
}: Props) {
  const achievements = [];

  if (totalPoints > 0) {
    achievements.push({ label: "📝 Primo pronostico" });
  }

  if (hasScorer) {
    achievements.push({ label: "⚽ Marcatore scelto" });
  }

  if (hasCompetitionPick) {
    achievements.push({ label: "🏆 Pronostici torneo" });
  }

  if (rank && rank <= 3) {
    achievements.push({ label: "🥉 Top 3" });
  }

  if (rank === 1) {
    achievements.push({ label: "👑 Leader" });
  }

  if (achievements.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {achievements.map((a, i) => (
        <Badge
          key={i}
          className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs"
        >
          {a.label}
        </Badge>
      ))}
    </div>
  );
}