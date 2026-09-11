-- AlterTable: drop redundant columns
ALTER TABLE "Anime" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "Anime" DROP COLUMN IF EXISTS "seasonCount";
ALTER TABLE "Anime" DROP COLUMN IF EXISTS "snapshotAt";
ALTER TABLE "Anime" DROP COLUMN IF EXISTS "updatedAt";

ALTER TABLE "EpisodeWatch" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "EpisodeWatch" DROP COLUMN IF EXISTS "watchedAt";

-- Drop unique constraint before dropping column "season"
ALTER TABLE "EpisodeWatch" DROP CONSTRAINT IF EXISTS "EpisodeWatch_watchEntryId_season_episode_key";
DROP INDEX IF EXISTS "EpisodeWatch_watchEntryId_season_episode_key";
DROP INDEX IF EXISTS "EpisodeWatch_watchEntryId_season_episode_idx";

ALTER TABLE "EpisodeWatch" DROP COLUMN IF EXISTS "season";

ALTER TABLE "WatchEntry" DROP COLUMN IF EXISTS "autoPauseEnabled";
ALTER TABLE "WatchEntry" DROP COLUMN IF EXISTS "lastEpisodeNumber";
ALTER TABLE "WatchEntry" DROP COLUMN IF EXISTS "lastEpisodeSeason";
ALTER TABLE "WatchEntry" DROP COLUMN IF EXISTS "lastWatchedAt";

-- CreateIndex for new unique
CREATE UNIQUE INDEX IF NOT EXISTS "EpisodeWatch_watchEntryId_episode_key" ON "EpisodeWatch"("watchEntryId", "episode");
-- Also need constraint? Prisma expects constraint not index? For @@unique([watchEntryId, episode]) it creates unique constraint/index. Using CREATE UNIQUE INDEX is okay, but could also use ADD CONSTRAINT.
