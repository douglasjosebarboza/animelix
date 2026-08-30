export type EpisodeWatchLike = {
  season: number;
  episode: number;
  watchedAt: Date;
};

export type Progress = {
  watchedCount: number;
  total: number;
  last: { season: number; episode: number; watchedAt: Date } | null;
};

export function computeProgress(
  episodeWatches: EpisodeWatchLike[],
  total: number | null,
): Progress {
  const distinct = new Set<string>();
  let last: EpisodeWatchLike | null = null;

  for (const ew of episodeWatches) {
    distinct.add(`${ew.season}:${ew.episode}`);
    if (!last || ew.watchedAt.getTime() > last.watchedAt.getTime()) {
      last = ew;
    }
  }

  return {
    watchedCount: distinct.size,
    total: total ?? 0,
    last: last
      ? { season: last.season, episode: last.episode, watchedAt: last.watchedAt }
      : null,
  };
}
