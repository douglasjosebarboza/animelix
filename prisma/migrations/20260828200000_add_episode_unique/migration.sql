-- Collapse duplicate EpisodeWatch rows (re-watches) into a single watched-set
-- membership before enforcing the unique constraint.
DELETE FROM "EpisodeWatch" a
USING "EpisodeWatch" b
WHERE a."watchEntryId" = b."watchEntryId"
  AND a."season" = b."season"
  AND a."episode" = b."episode"
  AND a."id" < b."id";

-- An Episode can only be watched once per WatchEntry: it belongs to the watched
-- set, not to a viewing log.
ALTER TABLE "EpisodeWatch" ADD CONSTRAINT "EpisodeWatch_watchEntryId_season_episode_key" UNIQUE ("watchEntryId", "season", "episode");
