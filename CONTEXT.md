# Animelix

Tracks a user's anime watching progress: which series they are following, which episode they are on, and their watching history.

## Language

**User**:
A registered account that tracks its own anime watching progress. Other Users cannot see or modify this User's WatchEntries.
_Avoid_: viewer, member, account holder

**Anime**:
A series in the catalogue, identified by its AniList id. Title, episode count, season structure and cover image are fetched from AniList and cached locally; the local cache is a projection, not the source of truth.
_Avoid_: show, series, title

**Episode**:
One instalment of an Anime, addressed by season number and episode number. May or may not have aired yet.
_Avoid_: chapter, instalment

**WatchEntry**:
The link between a User and an Anime. Carries the User's current progress on that Anime: status, last episode watched, and notes.
_Avoid_: watch record, progress entry, log

**WatchStatus**:
The User's relationship to an Anime at the current moment: `watching`, `completed`, `plan_to_watch`, `dropped`, `paused`. Transitions between these values are driven by the User's EpisodeWatch history, with the exception of `dropped` which is always set explicitly by the User.
_Avoid_: state, mode, flag

**EpisodeWatch**:
A record that a User watched one specific Episode of an Anime on a specific date. Each (WatchEntry, season, episode) combination can have at most one EpisodeWatch — an Episode is a membership in the watched set, not a viewing log, so re-watches of the same Episode are not tracked.
_Avoid_: view, watch log, play, re-watch

**StatusTransition**:
A logged change to a WatchEntry's WatchStatus. Includes the reason (`auto_completed`, `auto_paused`, `user_dropped`, `user_status_change`) and the timestamp. Visible to the User as an activity feed entry; silent at the moment of change.
_Avoid_: status log, audit entry
