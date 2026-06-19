-- Add Under/Over 2.5 as an optional ranking tie-breaker criterion.
ALTER TYPE "RankingCriterion" ADD VALUE IF NOT EXISTS 'UNDER_OVER';
