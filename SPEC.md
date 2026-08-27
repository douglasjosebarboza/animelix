# Animelix — MVP Spec

## Problem Statement

Anime fans who watch series across many seasons lose track of where they are in each series, which episodes they have already watched, and when they last watched them. Existing trackers (MyAnimeList, AniList, Kitsu) force the user into a public, score-driven social network whether they want it or not. There is no lightweight, privacy-first tracker that treats the watchlist as a personal log first and a social artefact second.

## Solution

Animelix is a public web app where a registered User keeps a private watchlist of Anime with per-episode EpisodeWatch history. Anime metadata is fetched from the AniList GraphQL API and cached locally, so the app is responsive and resilient to upstream outages. WatchStatus transitions follow the User's actual watching activity: marking all cached episodes watched auto-completes the entry; thirty days of inactivity auto-pauses it. Transitions are silent in the moment but written to an audit trail visible in an activity feed, so the User is never surprised by their own state. No ratings, no public profiles, no social features.

## User Stories

### Registration and Authentication

1. As a visitor, I want to register with my email and a password, so that I can keep a private watchlist across devices.
2. As a registered User, I want to log in with my email and password, so that I can access my watchlist.
3. As a registered User, I want to log out, so that my watchlist is not visible on a shared device.
4. As a visitor, I want clear feedback when my registration fails because the email is already in use, so that I can recover.
5. As a visitor, I want clear feedback when my login fails because the credentials are wrong, so that I can retry.
6. As a registered User, I want my session to persist across browser restarts, so that I do not have to log in every day.
7. As a visitor, I want to be redirected to the login page when I try to access a protected page while logged out, so that my data stays private.

### Discovering and Adding Anime

8. As a logged-in User, I want to search the AniList catalogue by title, so that I can find Anime I want to track.
9. As a logged-in User, I want to see search results with the Anime's title and cover image, so that I can confirm I am picking the right series.
10. As a logged-in User, I want to add an Anime from search results to my watchlist, so that I can start tracking it.
11. As a logged-in User, when I add an Anime I want its status to default to `plan_to_watch`, so that the intent is recorded before I watch anything.
12. As a logged-in User, I want to see my watchlist grouped by WatchStatus, so that I can see at a glance what I am watching, what I have finished, what I plan to watch, what I have paused, and what I have dropped.
13. As a logged-in User, I want to remove an Anime from my watchlist, so that my list reflects only what I am actually tracking.
14. As a logged-in User, I want adding the same Anime twice to be impossible, so that I do not have duplicate WatchEntries.

### Marking Episodes

15. As a logged-in User, I want to see an Anime's episode list with season and episode numbers, so that I can mark the right one.
16. As a logged-in User, I want to mark an episode as watched, so that the WatchEntry advances.
17. As a logged-in User, I want to choose the date on which I marked an episode watched, so that backfilling history matches reality.
18. As a logged-in User, I want the date to default to today, so that marking forward is one click.
19. As a logged-in User, when I mark the first episode of a `plan_to_watch` entry, I want the status to transition to `watching`, so that the list reflects my activity.
20. As a logged-in User, when I mark an episode I have already watched before (a re-watch), I want both records preserved, so that I can see how many times I have revisited it.
21. As a logged-in User, I want to undo a recent EpisodeWatch, so that mistakes are fixable.
22. As a logged-in User, I want to see on each Anime page how many episodes I have watched and what the cached total is, so that I know how close I am to finishing.

### WatchStatus

23. As a logged-in User, I want a WatchEntry to auto-transition to `completed` when I have watched every episode in the local cached total, so that the list reflects reality.
24. As a logged-in User, I want a WatchEntry to auto-transition to `paused` after 30 days with no new EpisodeWatch, so that stale `watching` entries do not pile up.
25. As a logged-in User, I want to manually set a WatchEntry to `dropped`, so that I can record that I gave up on a series.
26. As a logged-in User, I want to manually move a WatchEntry between any statuses, so that I can correct an automatic transition I disagree with.
27. As a logged-in User, I want the system to never auto-set `dropped`, so that dropping remains a deliberate choice.
28. As a logged-in User, I want automatic transitions to happen silently when I take the action that triggers them (marking an episode, time passing), so that the flow is not interrupted.
29. As a logged-in User, I want every transition to be visible in an activity feed with the reason (`auto_completed`, `auto_paused`, `user_dropped`, `user_status_change`) and the timestamp, so that I can audit what happened.
30. As a logged-in User, I want to disable the auto-paused rule per WatchEntry (opt out of auto-transition for a specific entry), so that long-running series I am slowly watching are not marked paused against my will.

### Anime Metadata and AniList Sync

31. As a logged-in User, when I add an Anime, I want its metadata (title, cover image, episode count, season count) to come from AniList, so that I do not have to type it.
32. As a logged-in User, I want the cached Anime metadata to refresh automatically after 24 hours, so that episode counts and covers stay current.
33. As a logged-in User, I want a manual "refresh from AniList" action on an Anime page, so that I can pull fresh metadata without waiting for the TTL.
34. As a logged-in User, when AniList is unreachable, I want to keep using the cached snapshot, so that the app stays usable during AniList outages.
35. As a logged-in User, I want the title and cover image shown in my watchlist to match what AniList currently says (within the TTL), so that I do not see stale data.

### Notes

36. As a logged-in User, I want to write free-text notes on a WatchEntry, so that I can record impressions, episode references, or reminders to myself.
37. As a logged-in User, I want my notes to be private, so that they are not shared with anyone.

### Privacy and Boundaries

38. As a logged-in User, I want my watchlist to be private by default, so that no other User can see it.
39. As a logged-in User, I want my EpisodeWatch history to be private, so that no other User can see it.
40. As a logged-in User, I want my activity feed to be private, so that no other User can see it.
41. As a logged-in User, I want my account to be deletable, so that I can leave the service with my data removed.

## Implementation Decisions

### Tech Stack

- **Framework**: Next.js (App Router), Server Components, Server Actions.
- **Database**: PostgreSQL hosted on Neon.
- **ORM**: Prisma with `prisma migrate` for schema changes.
- **Auth**: Auth.js (NextAuth) Credentials provider, email + password, JWT session strategy. Decision recorded in `docs/adr/0002-authjs-email-password-jwt.md`.
- **External API**: AniList GraphQL at `https://graphql.anilist.co`.
- **Database/Hosting decision**: recorded in `docs/adr/0001-postgres-neon-prisma.md`.

### Domain Glossary

Canonical vocabulary in `CONTEXT.md`. The spec uses the same terms: User, Anime, Episode, WatchEntry, WatchStatus, EpisodeWatch, StatusTransition.

### Auto-Transition Semantics

The `WatchStatus` transition engine is the heart of the system. Decision recorded in `docs/adr/0003-auto-status-transitions-silent.md`.

Rules:
- `plan_to_watch` → `watching`: triggered when the WatchEntry has its first EpisodeWatch.
- `watching` → `completed`: triggered when the distinct count of EpisodeWatch rows for the WatchEntry equals the locally cached total episode count for the Anime.
- `watching` → `paused`: triggered when the WatchEntry has had no new EpisodeWatch for 30 days. Configurable. Per-WatchEntry opt-out supported.
- `dropped`: never set automatically. User action only.
- Manual transitions to any status are always allowed and always override the auto rules.

Every transition, automatic or manual, writes a `StatusTransition` row with the reason and the timestamp.

### AniList Cache Strategy

- The `Anime` row is a projection of AniList data, not the source of truth.
- Each `Anime` carries a `snapshotAt` timestamp.
- Reads trigger a refresh if `snapshotAt` is older than 24 hours. The read returns the cached value regardless of whether the refresh succeeds.
- A manual refresh action forces an immediate AniList fetch and overwrites the snapshot.
- AniList rate limit is 90 req/min; concurrent refresh requests for the same Anime must be deduplicated.

### Schema (Prisma sketch)

The schema is the contract between modules. Encodes the domain decisions above.

```
User
  id, email (unique), passwordHash, createdAt

Anime
  id, anilistId (unique), title, coverImageUrl, episodeCount, seasonCount,
  snapshotAt, createdAt, updatedAt

WatchEntry
  id, userId, animeId, status, lastEpisodeSeason, lastEpisodeNumber,
  lastWatchedAt, notes, autoPauseEnabled (default true), createdAt, updatedAt
  unique(userId, animeId)

EpisodeWatch
  id, watchEntryId, season, episode, watchedAt, createdAt
  index(watchEntryId, season, episode)

StatusTransition
  id, watchEntryId, fromStatus, toStatus, reason, occurredAt
```

### Module Boundaries

- **Auth module**: handles registration, login, password hashing, session validation. Owns the `User` table.
- **Catalogue module**: owns the `Anime` table and the AniList client. Exposes `searchAnime(query)`, `getAnime(anilistId)`, `refreshAnime(anilistId)`.
- **Watchlist module**: owns `WatchEntry`, `EpisodeWatch`, `StatusTransition`. Exposes `addToWatchlist`, `markEpisodeWatched`, `undoEpisodeWatch`, `setWatchStatus`, `listWatchEntriesByStatus`, `getActivityFeed`. Owns the WatchStatus transition engine.
- **WatchStatus engine**: a pure function that, given the current state (EpisodeWatch count, last watch date, cached episode total) and an action (new EpisodeWatch, manual status change, time tick), returns the resulting status and any StatusTransition rows. Testable in isolation.

The transition engine is the only place where WatchStatus logic lives. Every other module calls into it rather than computing status locally.

### API Surface

- Server Actions for mutations from the authenticated UI (add to watchlist, mark episode, change status).
- Read paths as Server Components fetching directly through Prisma; no separate REST layer for MVP.

### Environment

- Local dev: `next dev` + Postgres via Docker Compose. The Neon connection string is read from `.env.local`.
- No staging deploy until the MVP tracer-bullet is green.

## Testing Decisions

### What Makes a Good Test

Tests assert external behaviour, not implementation details. A test should fail if a refactor changes internal module structure but behaviour is preserved, and a test should pass if behaviour is correct regardless of how the code is organised.

### One Integration Seam

There is one seam across the codebase: the running Next.js app. All MVP acceptance criteria are verified end-to-end against `next dev` (or `next start` in CI), exercising real Postgres (test container) and a stubbed AniList HTTP server.

### Test Layers

- **Domain unit tests** on the WatchStatus transition engine. Pure function in, transition rows out. Covers every rule including edge cases: re-watches not double-counting toward `completed`; manual status overriding an imminent auto-transition; opt-out suppressing the auto-pause.
- **Catalogue unit tests** on the AniList client wrapper with a stub HTTP server. Verifies rate-limit deduplication, snapshot overwrite, and failure fallback to cache.
- **Integration tests** that run the full Next.js app against a Postgres test container and a stub AniList. Cover the user stories: register, log in, search, add, mark episode, observe status transition, observe activity feed entry, manual status change, undo, opt-out.

### Prior Art

None — this is a greenfield repo. Test patterns follow the Next.js App Router conventions (Playwright for end-to-end, Vitest for unit) and are introduced by the tracer-bullet.

## Out of Scope

- Personal ratings or scores of any kind (1–10, stars, thumbs). Explicitly excluded by product decision.
- Public profile sharing, profile pages, shareable watchlist links.
- Social features: comments, friends, recommendations, comparison.
- Stats dashboards: time watched, completion rate, charts, streaks.
- Notifications: new episode aired, inactivity reminders, social notifications.
- Mobile apps.
- Internationalisation beyond what AniList already returns.
- Public profiles via `/u/[slug]` and opt-in sharing toggles.
- Admin tooling, moderation, user reporting.
- Password reset, email verification, two-factor auth. Registration creates a verified account; password recovery is a future spec.
- Migration tooling for changing the Prisma schema in production.

## Further Notes

- The first tracer-bullet cuts straight through the AniList integration: register, search via AniList, add to watchlist, mark an episode, see progress. No manual catalogue fallback.
- The activity feed is built early because it is the only place the user sees auto-transitions; without it, the silent-transition rule is invisible.
- The 30-day auto-pause threshold is a default and will become a User setting in a follow-up spec.
- AniList outage behaviour (return cached snapshot, never fail the read) is a hard requirement; the catalogue module must surface this contract to the watchlist module so the watchlist can mark Anime as "stale" if the user needs it.
