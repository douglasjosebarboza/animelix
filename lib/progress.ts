export type EpisodeWatchLike = {
  episode: number;
  season?: number;
  watchedAt?: Date;
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
    const key = ew.season !== undefined ? `${ew.season}:${ew.episode}` : `${ew.episode}`;
    distinct.add(key);
    if (!last) {
      last = ew;
    } else if (ew.watchedAt && last.watchedAt) {
      if (ew.watchedAt.getTime() > last.watchedAt.getTime()) last = ew;
    } else if (ew.watchedAt && !last.watchedAt) {
      last = ew;
    } else if (!ew.watchedAt && !last.watchedAt) {
      // fallback: highest episode number
      if (ew.episode > last.episode) last = ew;
    } else {
      // last has watchedAt, ew doesn't -> keep last
    }
  }

  // For watches without watchedAt, synthesize a Date for last
  let outLast: Progress["last"] = null;
  if (last) {
    outLast = {
      season: last.season ?? 1,
      episode: last.episode,
      watchedAt: last.watchedAt ?? new Date(),
    };
  }

  return {
    watchedCount: distinct.size,
    total: total ?? 0,
    last: outLast,
  };
}
