# Jikan Fallback + Catalogue Cleanup Design

**Date:** 2026-09-12
**Status:** Approved (5 seções ok em 2026-09-12)
**Goal:** Enquanto AniList 403 `disabled`, buscar via Jikan/MAL com pattern Strategy + Circuit Breaker; remover `lib/catalogue.ts` cache e enxugar Prisma.

## 1. Context
Hoje `lib/anilist.ts:68` é única fonte; `lib/catalogue.ts:57` cache 24h só para `getAnime`, `getSeasonal`/`search` direto sem fallback — home cai em `403` (`lib/anilist.ts:79`). Watchlist depende de `Anime` snapshot. Spike 2026-09-11 mostrou `403` global; usuário removeu fallback DB de 1h e pediu Jikan + limpeza de schemas.

## 2. Architecture

- `lib/datasource.ts` interface `AnimeDataSource { search(q:string):Promise<Seed[]>, getById(id:number):Promise<Seed>, getSeasonal(season:Season,year:number):Promise<Seed[]> }` com `Seed {anilistId,title,coverImageUrl,episodeCount}`.
- `lib/anilist.ts` → `AnilistAdapter implements AnimeDataSource` (mantém `inflight` dedup `lib/anilist.ts:58`, `AnilistError` `lib/anilist.ts:15`).
- `lib/jikan.ts` novo `JikanAdapter` — `GET https://api.jikan.moe/v4/anime?q=&sfw&order_by=popularity&perPage=20` e `season=...&year=...&sfw` mapeia `MAL Raw → Seed` (title `title_english||title`, cover `images.jpg.large_image_url`, episodes `episodes`).
- `lib/catalog.ts` (substituto fino de `lib/catalogue.ts` apagado) orquestra: `try Anilist` → `catch (AnilistError 403/429/5xx || network)` + `CircuitBreaker.isOpen("anilist")` → `Jikan`; `lib/catalogue.ts` apagado.
- `lib/circuitBreaker.ts` in-memory `Map<string,{fails,openUntil}>` — 3 falhas/60s abre 10s, half-open 1 tentativa.

## 3. Components & Boundaries

| Component | Responsibility | Interface |
|---|---|---|
| AnilistAdapter | GraphQL `https://graphql.anilist.co` | `implements AnimeDataSource` |
| JikanAdapter | REST Jikan | `implements AnimeDataSource` |
| Catalog (fachada) | Fallback + breaker | `search/getById/getSeasonal` → `Seed` |
| CircuitBreaker | Estado aberto/fechado | `isOpen(key), recordSuccess(key), recordFailure(key)` |
| Watchlist lib | Persiste `Anime` mínimo sem TTL | `addToWatchlist(userId, anilistId)` → `catalog.getById` → `prisma.anime.upsert` |

Cada unidade testável isolada; `app/page.tsx:20` e `lib/watchlist.ts:30` só dependem de `Catalog`.

## 4. Data Model (Prisma)

```prisma
model Anime { id String @id @default(cuid()); anilistId Int @unique; title String; coverImageUrl String?; episodeCount Int?; watchEntries WatchEntry[] }
model WatchEntry { id String @id @default(cuid()); userId String; animeId String; status String @default("watching"); createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; user User @relation(...); anime Anime @relation(...); episodeWatches EpisodeWatch[]; @@unique([userId, animeId]) }
model EpisodeWatch { id String @id @default(cuid()); watchEntryId String; episode Int; watchEntry WatchEntry @relation(...); @@unique([watchEntryId, episode]) }
```

Removidos vs `prisma/schema.prisma:19-77` atual: `Anime.seasonCount/snapshotAt/createdAt/updatedAt`, `WatchEntry.autoPauseEnabled/lastEpisodeSeason/Number/lastWatchedAt`, `EpisodeWatch.watchedAt/season/createdAt`, `StatusTransition` já removido. Migração `20260912_jikan_fallback_cleanup` com `ALTER TABLE DROP COLUMN` + `DROP TABLE` se existir.

## 5. Data Flow

- **Home:** `app/page.tsx` `catalog.search(q)` ou `catalog.getSeasonal(currentSeason())` → `AnilistAdapter` → se 403/5xx e breaker fechado, `JikanAdapter` → `Seed[]` → `ul.grid` (next/image `s4.anilist.co` ou Jikan `cdn.myanimelist.net` adicionado ao `remotePatterns`).
- **Add to watchlist:** `lib/watchlist.ts:35` `catalog.getById(anilistId)` (Anilist→Jikan) → `prisma.anime.upsert` mínimo → `watchEntry.create`.
- **List watchlist:** só DB `prisma.watchEntry.findMany include anime`, sem fetch remoto.
- **Mark episode:** `tx.episodeWatch.create({episode})` + `computeNextStatus` `watching↔completed` (`lib/watchstatus.ts:1` sem `firstWatch`).

## 6. Error Handling

- `AnilistError` 403/429/5xx/network incrementa breaker; `JikanError` 429 respeita `Retry-After` header; se ambos falham → `throw new Error("Ambas fontes indisponíveis")` → `app/page.tsx:25` banner já existente.
- Breaker half-open após 10s tenta 1 request AniList; sucesso fecha, falha reabre.
- `app/api/search/route.ts:9` já valida `z.string().max(100)` + `rateLimit 30/min` — mantém.

## 7. Testing

- Unit: `tests/unit/jikan.test.ts` (mock fetch Jikan 200/403/429), `tests/unit/catalog.test.ts` (Anilist 403 → Jikan ok, ambos 403 → throw), `tests/unit/watchstatus.test.ts` 13 testes `watching/completed` sem `firstWatch`.
- E2E: `tests/e2e/home.spec.ts` stub `ANILIST_GRAPHQL_URL` 403 + `JIKAN_URL` 200 → lista via Jikan.
- Build: `pnpm build` 9/9 static, `pnpm test:unit` 45→47, `pnpm audit` 0.

## 8. Risks & YAGNI

- Jikan `episodeCount` pode divergir de AniList → status `completed` baseado em Jikan no `add` pode ser off-by-1; aceito (watchlist corrige ao marcar).
- Sem `season` em `EpisodeWatch`, multi-temporada colapsa — YAGNI (hoje `season=1` sempre).
- `Anime` mínimo mantém JOIN para listar offline; alternativa desnormalizar em `WatchEntry` foi rejeitada (custo de migração maior).

## 9. Out of Scope

- `unstable_cache` removido permanentemente como pedido; não reintroduzir fallback DB 1h.
- `html 18px` e `watching|completed` preservados; `next/image` e headers/CSP já entregues.
