# Design: Watchlist puramente AniList (sem tabela Anime)

Data: 2026-09-12 | Abordagem aprovada: B (IDs puros + `unstable_cache`) | Path: architectural

## 1. Objetivo

Voltar a implementação para modo puramente AniList: nenhum metadado de anime
(título, capa, episodeCount) é persistido no Postgres. O banco guarda só IDs e
progresso local; toda informação de catálogo vem ao vivo da API AniList
(`lib/anilist.ts` via `lib/catalog.ts`), com cache Next de 1h para aliviar 429.
Isso elimina por construção o 500 em `POST /anime/210031` (writes deixam de
chamar a API).

Decisões do usuário: erro de API vira aviso amigável parcial (não 500);
migration descarta `Anime` e zera `WatchEntry`/`EpisodeWatch` antigos;
writes só gravam `anilistId`, sem validar na API.

## 2. Arquitetura

- Postgres guarda identidade e progresso: `User`, `WatchEntry { userId,
  anilistId }`, `EpisodeWatch { watchEntryId, episode }`. Nenhum título/capa/total.
- Camada catálogo (`lib/anilist.ts` + `lib/catalog.ts`) é a única fonte de
  metadados. Novo `lib/anime-cache.ts` envolve `getById` (TTL 1h, tag
  `anime:{id}`), `search`/`getSeasonal` (TTL 10min) com `unstable_cache`.
  Cache vive no Next/KV, não no Postgres.
- Páginas fazem merge: buscam `entry` local + `seed` remoto em paralelo com
  `Promise.allSettled` e renderizam a união. Falha remota degrada só o card.

## 3. Schema Prisma

```prisma
model WatchEntry {
  id        String   @id @default(cuid())
  userId    String
  anilistId Int
  status    String   @default("watching")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user           User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  episodeWatches EpisodeWatch[]
  @@unique([userId, anilistId])
}
```

- Remover `model Anime` e a relation `WatchEntry.anime`.
- Migration destrutiva: `DROP TABLE "Anime"`, recria `WatchEntry` com
  `anilistId Int`, descarta linhas antigas de `WatchEntry`/`EpisodeWatch`
  (sem port de dados, conforme aprovado).

## 4. Componentes e mudanças

- `lib/watchlist.ts`: remove `resolveAnimeId`, import de `catalog` e todo
  `prisma.anime`. Assinaturas passam a usar `anilistId` direto:
  `addToWatchlist(userId, anilistId)` → `create`; `removeFromWatchlist` →
  `deleteMany({ userId, anilistId })`; `getWatchEntry` → `findUnique({ where:
  { userId_anilistId: { userId, anilistId } }, include: { episodeWatches } })`;
  `listWatchEntries` → `findMany` sem `include anime`.
- `markEpisodeWatched` / `removeEpisodeWatch`: recebem `total?: number | null`
  (episodeCount ao vivo). Transição `computeNextStatus` só roda quando `total`
  é número; com `null`/ausente, grava/remove o episódio e pula a transição.
- `lib/watchlist-actions.ts`: lê `total` de campo hidden (`Number(...)`, `NaN`
  → `null`) e repassa. Mantém redirect `already_in_watchlist`.
- `lib/anime-cache.ts` (novo): `getCachedAnimeById(id)`,
  `searchCachedAnime(q)`, `getCachedSeasonal(season, year)` via
  `unstable_cache` + `revalidateTag`.
- `lib/anime-actions.ts`: apaga `ensureAnime`/`addAnimeAction`; mantém
  `refreshAnimeAction` como `revalidateTag('anime')` + `revalidatePath`.
- Páginas: `app/anime/[anilistId]/page.tsx` (seed cached + entry local);
  `app/watchlist/page.tsx` (entries + `allSettled` de seeds, placeholder por
  card falho); `app/watchlist/[animeId]/page.tsx` (entry + seed em paralelo,
  fallback título `Anime {id}` quando API cai).
- Limpeza: apagar `cleanup_watchlist.ts`; corrigir `lib/catalog.ts:19` (tipo
  `./datasource` inexistente → inline `AnimeDataSource` ou recriar mínimo).

## 5. Fluxo de dados

- Add: form `anilistId` → `addToWatchlist` (só Postgres) → redirect.
  Nenhum fetch AniList no POST.
- Mark/unmark: detail page renderiza `total` cached em hidden → action grava
  episódio → transição condicional → `revalidatePath`.
- List: `listWatchEntries(userId)` → `Set(anilistId)` → `allSettled(
  getCachedAnimeById )` → cards OK + placeholders + banner se tudo falhar.
- Refresh: `revalidateTag` invalida o detalhe; próxima leitura refaz 1 chamada.

## 6. Erros

- `AnilistError` 429/5xx em leitura: capturado por página/cartão, banner âmbar
  no padrão de `app/page.tsx:33`. Nunca vira 500.
- Writes: só `WatchlistError` (`already in watchlist`, `não está na watchlist`,
  `episódio já assistido`); sem `AnilistError` possível.
- `getWatchEntry` retorna `null` → `notFound()` como hoje.

## 7. Testes

- Reescrever `tests/unit/watchlist.test.ts`: sem mock `prisma.anime`; cobre
  add com `anilistId`, P2002 → `WatchlistError`, mark com `total=12` transiciona
  e com `total=null` pula transição.
- Atualizar `watchlist.pagination.test.ts` (sem `include anime`) e
  `schema.test.ts` (assert `Anime` não existe; `WatchEntry` tem `anilistId` e
  unique `[userId, anilistId]`).
- Novo `tests/unit/anime-cache.test.ts`: mesma entrada em 2 chamadas gera 1
  fetch (mock), tag `anime:{id}` presente.
- Verificação: `pnpm exec vitest run`, `prisma validate`, `tsc --noEmit`.

## 8. Fora de escopo

Restaurar fallback Jikan/Kitsu; retry/backoff 429 no `request()`; paginação da
lista além do cursor atual; qualquer snapshot de título/capa no Postgres.
