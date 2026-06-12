-- Convert scoring fields from integer to decimal without deleting existing data.
ALTER TABLE "Prediction"
  ALTER COLUMN "pointsExact" TYPE DECIMAL(8,2) USING "pointsExact"::DECIMAL(8,2),
  ALTER COLUMN "pointsOutcome" TYPE DECIMAL(8,2) USING "pointsOutcome"::DECIMAL(8,2),
  ALTER COLUMN "pointsSumGoals" TYPE DECIMAL(8,2) USING "pointsSumGoals"::DECIMAL(8,2),
  ALTER COLUMN "pointsUnderOver" TYPE DECIMAL(8,2) USING "pointsUnderOver"::DECIMAL(8,2),
  ALTER COLUMN "pointsScorer" TYPE DECIMAL(8,2) USING "pointsScorer"::DECIMAL(8,2),
  ALTER COLUMN "totalPoints" TYPE DECIMAL(8,2) USING "totalPoints"::DECIMAL(8,2);

ALTER TABLE "Rule"
  ALTER COLUMN "pointsExact" TYPE DECIMAL(8,2) USING "pointsExact"::DECIMAL(8,2),
  ALTER COLUMN "pointsOutcome" TYPE DECIMAL(8,2) USING "pointsOutcome"::DECIMAL(8,2),
  ALTER COLUMN "pointsSumGoals" TYPE DECIMAL(8,2) USING "pointsSumGoals"::DECIMAL(8,2),
  ALTER COLUMN "pointsUnderOver25" TYPE DECIMAL(8,2) USING "pointsUnderOver25"::DECIMAL(8,2),
  ALTER COLUMN "pointsScorer" TYPE DECIMAL(8,2) USING "pointsScorer"::DECIMAL(8,2),
  ALTER COLUMN "pointsCompetitionWinner" TYPE DECIMAL(8,2) USING "pointsCompetitionWinner"::DECIMAL(8,2),
  ALTER COLUMN "pointsCompetitionTopScorer" TYPE DECIMAL(8,2) USING "pointsCompetitionTopScorer"::DECIMAL(8,2),
  ALTER COLUMN "pointsCompetitionQuarterFinalist" TYPE DECIMAL(8,2) USING "pointsCompetitionQuarterFinalist"::DECIMAL(8,2),
  ALTER COLUMN "pointsCompetitionSemiFinalist" TYPE DECIMAL(8,2) USING "pointsCompetitionSemiFinalist"::DECIMAL(8,2),
  ALTER COLUMN "pointsCompetitionFinalist" TYPE DECIMAL(8,2) USING "pointsCompetitionFinalist"::DECIMAL(8,2);

ALTER TABLE "CompetitionPick"
  ALTER COLUMN "pointsAwarded" TYPE DECIMAL(8,2) USING "pointsAwarded"::DECIMAL(8,2);
