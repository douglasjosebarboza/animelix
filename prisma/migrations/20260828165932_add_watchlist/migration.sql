-- CreateTable
CREATE TABLE "WatchEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "animeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'plan_to_watch',
    "lastEpisodeSeason" INTEGER,
    "lastEpisodeNumber" INTEGER,
    "lastWatchedAt" TIMESTAMP(3),
    "notes" TEXT,
    "autoPauseEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeWatch" (
    "id" TEXT NOT NULL,
    "watchEntryId" TEXT NOT NULL,
    "season" INTEGER NOT NULL DEFAULT 1,
    "episode" INTEGER NOT NULL,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchEntry_userId_animeId_key" ON "WatchEntry"("userId", "animeId");

-- CreateIndex
CREATE INDEX "EpisodeWatch_watchEntryId_season_episode_idx" ON "EpisodeWatch"("watchEntryId", "season", "episode");

-- AddForeignKey
ALTER TABLE "WatchEntry" ADD CONSTRAINT "WatchEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchEntry" ADD CONSTRAINT "WatchEntry_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeWatch" ADD CONSTRAINT "EpisodeWatch_watchEntryId_fkey" FOREIGN KEY ("watchEntryId") REFERENCES "WatchEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
