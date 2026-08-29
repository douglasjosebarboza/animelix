# ADR 0004 — EpisodeWatch is a watched set, not a viewing log

## Status

Accepted (2026-08-28)

## Context

`EpisodeWatch` was originally modeled as an append-only viewing log: a User could
watch the same Episode many times, and each watch inserted a new row. The
`distinctCount` helper collapsed the duplicates to report progress, and the
"undo last" control deleted the most recent row.

The product behaviour requested by the user treats watching as a binary,
per-episode state:

- The same Episode must not be marked watched more than once.
- There is no "undo last" button; instead the user removes a *selected*
  Episode from the watched set (watched → unwatched).
- Removing the last watched Episode drops the WatchEntry from the watchlist.

Keeping the log model would mean fighting the spec at every layer (guarding
against duplicate inserts, faking removal by deleting "the" row while rows
still multiply). It also created ambiguous status semantics: with re-watches,
"watched count" is the size of a multiset, not the number of Episodes seen.

## Decision

Change `EpisodeWatch` from a viewing log to a watched-set membership:

- Add `UNIQUE(watchEntryId, season, episode)` to the schema. The database is
  the single source of truth for "has this Episode been watched".
- `markEpisodeWatched` rejects marking an already-watched Episode
  (`WatchlistError: "Episódio já assistido"`) instead of inserting a duplicate.
- Replace `undoLastEpisodeWatch` with `removeEpisodeWatch(watchEntryId, season,
  episode)`. The per-entry "Undo last" control is removed from the UI; each
  watched Episode row exposes its own "remover" button.
- Add a `removeEpisode` engine action in `lib/watchstatus.ts`: removing an
  Episode can only take a `completed` entry back to `watching` (when the watched
  set is no longer complete); all other statuses are unaffected. Status changes
  driven by removal are logged with reason `user_status_change`.
- Removing the last watched Episode deletes the WatchEntry entirely, matching
  the prior "undo last" behaviour.

Existing duplicate rows were collapsed in the migration
(`20260828200000_add_episode_unique`) before the unique constraint was added.

## Consequences

- `EpisodeWatch` row count equals the number of distinct Episodes watched, so
  `distinctCount` and the raw count are now the same value.
- Re-watch history is no longer retained. This is accepted: the product never
  exposed re-watch data.
- The `auto_completed` rule keeps using `distinctWatched >= total`; with the set
  model the `>=` is now effectively `==` and the semantics are unchanged.
- Status reversibility from `completed` to `watching` on removal is now a
  first-class, logged transition rather than an implicit side effect of undoing
  the "last" row.
