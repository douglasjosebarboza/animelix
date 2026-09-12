# Pure AniList Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove a tabela `Anime` e fazer a watchlist guardar só `anilistId` + progresso, buscando título/capa/episódios ao vivo na AniList com cache Next.

**Architecture:** `WatchEntry { userId, anilistId }` sem relation; `lib/watchlist.ts` vira 100% local (zero chamada API em writes); novo `lib/anime-cache.ts` envolve o catálogo com `unstable_cache`; páginas fazem merge `entry` local + `seed` remoto via `Promise.allSettled`.

**Tech Stack:** Next.js 16.3.3 (`unstable_cache`, `revalidateTag` de `next/cache`), Prisma 6.19.3, Vitest 4, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-09-12-pure-anilist-design.md`

## Global Constraints

- Package manager é `pnpm`; unit tests rodam com `pnpm exec vitest run <arquivo>`.
- `DATABASE_URL` do Postgres precisa estar configurado para `prisma migrate dev` e `prisma generate`.
- Migration é destrutiva por aprovação explícita do usuário (dropa `Anime`, zera `WatchEntry`/`EpisodeWatch`); sem port de dados.
- Cache Next (`unstable_cache`) não conta como "banco" e é permitido; nada de metadado de anime no Postgres.
- Copy da UI em português deve ser preservada; chaves de erro atuais (`already_in_watchlist`) mantidas.
- Cada task termina em commit próprio; não misturar arquivos de tasks diferentes no mesmo commit.

---

## File Structure

- Modify: `prisma/schema.prisma` — remove `model Anime`; `WatchEntry` ganha `anilistId Int` + `@@unique([userId, anilistId])`, perde `animeId` e a relation.
- Generated: `prisma/migrations/<timestamp>_pure_anilist_watchentry/` — gerada por `prisma migrate dev`.
- Modify: `lib/watchlist.ts` — remove `resolveAnimeId`, import de `catalog` e todo `prisma.anime`; `mark/removeEpisodeWatched` ganham param `total?: number | null`.
- Modify: `tests/unit/watchlist.test.ts` — reescrita sem mock de `prisma.anime`, cobre transição com/sem `total`.
- Modify: `tests/unit/account.test.ts` — expectativas passam a `userId_anilistId` com `anilistId` direto.
- Modify: `tests/unit/watchlist.pagination.test.ts` — asserta novo shape sem `include: { anime }`.
- Modify: `tests/unit/schema.test.ts` — asserta que `Anime` não existe e `WatchEntry` tem `anilistId`.
- Create: `lib/anime-cache.ts` — `getCachedAnimeById`, `searchCachedAnime`, `getCachedSeasonal` via `unstable_cache`.
- Create: `tests/unit/anime-cache.test.ts` — mock de `next/cache` (passthrough) + mock de `catalog`.
- Modify: `lib/watchlist-actions.ts` — lê `total` do form (helper puro `parseTotal`) e repassa; resto inalterado.
- Modify: `lib/anime-actions.ts` — remove `ensureAnime`/`addAnimeAction`; `refreshAnimeAction` só revalida.
- Modify: `app/anime/[anilistId]/page.tsx` — seed cached + entry local.
- Modify: `app/watchlist/page.tsx` — entries + `allSettled` de seeds, placeholder por card falho, hidden `anilistId` vindos de `entry.anilistId`.
- Modify: `app/watchlist/[animeId]/page.tsx` — entry + seed em paralelo, hidden `total` nos forms de episódio.
- Delete: `cleanup_watchlist.ts` — referencia `prisma.anime`, perde o sentido.
- Modify: `lib/catalog.ts` — troca `import("./datasource")` (arquivo inexistente) por tipo inline.

---

### Task 1: Schema Prisma sem `Anime`

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `tests/unit/schema.test.ts`
- Generated: `prisma/migrations/<timestamp>_pure_anilist_watchentry/migration.sql`
- Test: `tests/unit/schema.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `WatchEntry { id, userId, anilistId: number, status, createdAt, updatedAt }` com `@@unique([userId, anilistId])`; `EpisodeWatch` inalterado referenciando `WatchEntry.id`.

- [ ] **Step 1: Reescrever o teste de schema (failing first)**

```ts
import { expect, it } from "vitest";
import { Prisma } from "@prisma/client";

it("Anime model foi removido", () => {
  const names = Prisma.dmmf.datamodel.models.map((m) => m.name);
  expect(names).not.toContain("Anime");
});

it("WatchEntry guarda anilistId com unique [userId, anilistId]", () => {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "WatchEntry")!;
  const fields = model.fields.map((f) => f.name);
  expect(fields).toContain("anilistId");
  expect(fields).not.toContain("animeId");
  const uniques = model.uniqueFields as unknown as string[][];
  expect(uniques).toContainEqual(expect.arrayContaining(["userId", "anilistId"]));
});
```

Substitui o conteúdo atual de `tests/unit/schema.test.ts` (que asserta campos do model `Anime`).

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `pnpm exec vitest run tests/unit/schema.test.ts`
Expected: FAIL — `Anime model foi removido` falha porque o model ainda existe no client gerado.

- [ ] **Step 3: Editar `prisma/schema.prisma`**

Apagar o bloco inteiro:

```prisma
model Anime {
  id            String   @id @default(cuid())
  anilistId     Int      @unique
  title         String
  coverImageUrl String?
  episodeCount  Int?

  watchEntries WatchEntry[]
}
```

E trocar o model `WatchEntry` para:

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

Nada mais no schema muda (`User` e `EpisodeWatch` ficam como estão).

- [ ] **Step 4: Gerar migration + client e rodar o teste**

Run: `pnpm exec prisma migrate dev --name pure_anilist_watchentry`
Expected: migration criada aplicando DROP de `Anime` e recriação de `WatchEntry` (aceitar o aviso de perda de dados — aprovado pelo usuário).

Run: `pnpm exec prisma generate && pnpm exec vitest run tests/unit/schema.test.ts`
Expected: PASS nos 2 testes.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/unit/schema.test.ts
git commit -m "feat: schema watchlist sem tabela Anime, WatchEntry por anilistId"
```

---

### Task 2: `lib/watchlist.ts` 100% local

**Files:**
- Modify: `lib/watchlist.ts`
- Modify: `tests/unit/watchlist.test.ts`
- Modify: `tests/unit/account.test.ts`
- Modify: `tests/unit/watchlist.pagination.test.ts`
- Test: `tests/unit/watchlist.test.ts`, `tests/unit/account.test.ts`, `tests/unit/watchlist.pagination.test.ts`

**Interfaces:**
- Consumes: schema da Task 1 (`WatchEntry` com `anilistId`, unique `userId_anilistId`).
- Produces:
  - `addToWatchlist(userId: string, anilistId: number): Promise<void>`
  - `removeFromWatchlist(userId: string, anilistId: number): Promise<void>`
  - `getWatchEntry(userId: string, anilistId: number): Promise<(WatchEntry & { episodeWatches: EpisodeWatch[] }) | null>`
  - `markEpisodeWatched(userId, anilistId, seasonOrEpisode: number, episodeMaybe?: number, total?: number | null): Promise<void>`
  - `removeEpisodeWatch(userId, anilistId, seasonOrEpisode: number, episodeMaybe?: number, total?: number | null): Promise<boolean>`
  - `setWatchStatus(userId, anilistId, to: WatchStatus): Promise<void>`
  - `listWatchEntries(userId, opts?: { take?: number; cursor?: string })` — retorna entries sem `include` de anime
  - `WatchlistError` inalterado. Nenhuma função deste módulo importa `catalog` ou toca em `prisma.anime`.

- [ ] **Step 1: Reescrever `tests/unit/watchlist.test.ts` (failing first)**

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { addToWatchlist, markEpisodeWatched, WatchlistError } from "@/lib/watchlist";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    anime: undefined,
    watchEntry: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    episodeWatch: { create: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
      fn({
        watchEntry: {
          findUnique: vi.mocked(prisma.watchEntry.findUnique),
          update: vi.mocked(prisma.watchEntry.update),
        },
        episodeWatch: { create: vi.mocked(prisma.episodeWatch.create) },
      }),
    ),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe("watchlist pura (sem Anime)", () => {
  it("cria o entry direto com anilistId sem tocar na API", async () => {
    vi.mocked(prisma.watchEntry.create).mockResolvedValue({} as never);
    await addToWatchlist("user-1", 123);
    expect(prisma.watchEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: "user-1", anilistId: 123, status: "watching" } }),
    );
    expect((prisma as unknown as Record<string, unknown>).anime).toBeUndefined();
  });

  it("mapeia P2002 para WatchlistError", async () => {
    const err = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    vi.mocked(prisma.watchEntry.create).mockRejectedValue(err);
    await expect(addToWatchlist("user-1", 123)).rejects.toThrow(WatchlistError);
  });

  it("markEpisode completa quando atinge o total vindo da API", async () => {
    const before = { id: "e1", status: "watching", episodeWatches: [] };
    // Transição usa distinct-count: precisa de 12 watches distintos para total 12.
    const after = { id: "e1", status: "watching", episodeWatches: Array.from({ length: 12 }, (_, i) => ({ id: `w${i + 1}`, episode: i + 1 })) };
    vi.mocked(prisma.watchEntry.findUnique)
      .mockResolvedValueOnce(before as never)
      .mockResolvedValueOnce(after as never);
    await markEpisodeWatched("user-1", 123, 1, 12, 12);
    expect(prisma.watchEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "completed" } }),
    );
  });

  it("markEpisode pula transição quando total é null", async () => {
    const before = { id: "e1", status: "watching", episodeWatches: [] };
    const after = { id: "e1", status: "watching", episodeWatches: [{ id: "w1", episode: 5 }] };
    vi.mocked(prisma.watchEntry.findUnique)
      .mockResolvedValueOnce(before as never)
      .mockResolvedValueOnce(after as never);
    await markEpisodeWatched("user-1", 123, 1, 5, null);
    expect(prisma.watchEntry.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm exec vitest run tests/unit/watchlist.test.ts`
Expected: FAIL — `addToWatchlist` atual chama `catalog.getById` (rede) e `prisma.anime.upsert` (mock inexistente).

- [ ] **Step 3: Reescrever `lib/watchlist.ts`**

Conteúdo completo novo (mantém `WatchlistError`, `distinctCount`, `findEpisodeWatch`, `setAutoPause`/`runAutoPauseJob` como estão; o que muda: sem import de `catalog`, sem `resolveAnimeId`, sem `prisma.anime`, lookups por `userId_anilistId`, `total` como parâmetro):

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeNextStatus, type WatchStatus } from "@/lib/watchstatus";

export class WatchlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchlistError";
  }
}

type EntryWithRelations = Prisma.WatchEntryGetPayload<{
  include: { episodeWatches: true };
}>;

function distinctCount(entry: EntryWithRelations): number {
  const set = new Set(entry.episodeWatches.map((e) => e.episode));
  return set.size;
}

function findEpisodeWatch(
  watches: { id: string; episode: number }[],
  episode: number,
) {
  return watches.find((e) => e.episode === episode);
}

export async function addToWatchlist(
  userId: string,
  anilistId: number,
): Promise<void> {
  try {
    await prisma.watchEntry.create({
      data: { userId, anilistId, status: "watching" },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new WatchlistError("already in watchlist");
    }
    throw err;
  }
}

export async function removeFromWatchlist(
  userId: string,
  anilistId: number,
): Promise<void> {
  await prisma.watchEntry.deleteMany({
    where: { userId, anilistId },
  });
}

export async function getWatchEntry(userId: string, anilistId: number) {
  return prisma.watchEntry.findUnique({
    where: { userId_anilistId: { userId, anilistId } },
    include: {
      episodeWatches: { orderBy: [{ episode: "asc" }] },
    },
  });
}

export async function markEpisodeWatched(
  userId: string,
  anilistId: number,
  seasonOrEpisode: number,
  episodeMaybe?: number,
  total?: number | null,
): Promise<void> {
  const episode = episodeMaybe !== undefined ? episodeMaybe : seasonOrEpisode;
  return prisma.$transaction(async (tx) => {
    const before = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
      include: { episodeWatches: true },
    });
    if (!before) {
      throw new WatchlistError("Anime não está na sua watchlist");
    }

    const alreadyWatched = findEpisodeWatch(before.episodeWatches, episode);
    if (alreadyWatched) {
      throw new WatchlistError("Episódio já assistido");
    }

    await tx.episodeWatch.create({
      data: { watchEntryId: before.id, episode },
    });

    const after = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
      include: { episodeWatches: true },
    });
    if (!after) return;

    const transition = computeNextStatus(before.status as WatchStatus, {
      type: "markEpisode",
      distinctWatched: distinctCount(after),
      total: total ?? null,
    });
    if (transition) {
      await tx.watchEntry.update({
        where: { id: after.id },
        data: { status: transition.to },
      });
    }
  });
}

export async function setWatchStatus(
  userId: string,
  anilistId: number,
  to: WatchStatus,
): Promise<void> {
  const entry = await prisma.watchEntry.findUnique({
    where: { userId_anilistId: { userId, anilistId } },
    include: { episodeWatches: true },
  });
  if (!entry) {
    throw new WatchlistError("Anime não está na sua watchlist");
  }
  const transition = computeNextStatus(entry.status as WatchStatus, {
    type: "setStatus",
    to,
  });
  if (transition) {
    await prisma.watchEntry.update({
      where: { id: entry.id },
      data: { status: transition.to },
    });
  }
}

// Deprecated: auto-pause removed with paused status — kept as no-op for compatibility.
export async function setAutoPause(
  _userId: string,
  _anilistId: number,
  _enabled: boolean,
): Promise<void> {
  return;
}

export async function runAutoPauseJob(_now: Date = new Date()): Promise<number> {
  return 0;
}

export async function removeEpisodeWatch(
  userId: string,
  anilistId: number,
  seasonOrEpisode: number,
  episodeMaybe?: number,
  total?: number | null,
): Promise<boolean> {
  const episode = episodeMaybe !== undefined ? episodeMaybe : seasonOrEpisode;
  return prisma.$transaction(async (tx) => {
    const entry = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
      include: { episodeWatches: true },
    });
    if (!entry) {
      throw new WatchlistError("Anime não está na sua watchlist");
    }
    const target = findEpisodeWatch(entry.episodeWatches, episode);
    if (!target) return false;

    await tx.episodeWatch.delete({ where: { id: target.id } });

    const remaining = await tx.episodeWatch.count({
      where: { watchEntryId: entry.id },
    });
    if (remaining === 0) {
      await tx.watchEntry.delete({ where: { id: entry.id } });
      return true;
    }

    const remainingWatches = entry.episodeWatches.filter((e) => e.id !== target.id);
    const transition = computeNextStatus(entry.status as WatchStatus, {
      type: "removeEpisode",
      distinctWatched: distinctCount({ ...entry, episodeWatches: remainingWatches } as EntryWithRelations),
      total: total ?? null,
    });
    if (transition) {
      await tx.watchEntry.update({
        where: { id: entry.id },
        data: { status: transition.to },
      });
    }
    return false;
  });
}

export async function listWatchEntries(
  userId: string,
  opts: { take?: number; cursor?: string } = {},
) {
  const take = Math.min(opts.take || 50, 50);
  return prisma.watchEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
}
```

Notas obrigatórias: o mock de `$transaction` no teste injeta `tx` com `watchEntry.findUnique/update` e `episodeWatch.create` — por isso `tx.episodeWatch.delete` e `tx.episodeWatch.count` e `tx.watchEntry.delete` dentro de `removeEpisodeWatch` precisam existir no mock quando esse caminho for testado (hoje só `markEpisodeWatched` é testado; não adicionar teste de `removeEpisodeWatch` nesta task). O bloco P2002 foi simplificado para checagem direta de `code` (comportamento idêntico ao `if` atual).

- [ ] **Step 4: Atualizar `tests/unit/account.test.ts`**

Trocar o mock `anime: { findUnique: vi.fn() }` por nada (remover a linha), remover `animeFind`, e trocar as duas expectativas de `getWatchEntry` para:

```ts
expect(entryFind).toHaveBeenCalledWith(
  expect.objectContaining({
    where: { userId_anilistId: { userId: "userA", anilistId: 123 } },
  }),
);
```

(antes era `where: { userId_animeId: { userId, animeId: "anime-1" } }` precedido de `animeFind.mockResolvedValue` — apagar essas duas linhas de setup). Em `watchlist.pagination.test.ts`, estender para asserir ausência de include de anime:

```ts
expect(spy).toHaveBeenCalledWith(expect.objectContaining({take:20, cursor:{id:"abc"}}));
expect(spy).toHaveBeenCalledWith(expect.not.objectContaining({ include: expect.anything() }));
```

- [ ] **Step 5: Rodar os três suites**

Run: `pnpm exec vitest run tests/unit/watchlist.test.ts tests/unit/account.test.ts tests/unit/watchlist.pagination.test.ts`
Expected: PASS em todos.

- [ ] **Step 6: Commit**

```bash
git add lib/watchlist.ts tests/unit/watchlist.test.ts tests/unit/account.test.ts tests/unit/watchlist.pagination.test.ts
git commit -m "feat: watchlist 100% local por anilistId, sem tocar na AniList em writes"
```

---

### Task 3: `lib/anime-cache.ts` (cache Next sobre o catálogo)

**Files:**
- Create: `lib/anime-cache.ts`
- Create: `tests/unit/anime-cache.test.ts`
- Test: `tests/unit/anime-cache.test.ts`

**Interfaces:**
- Consumes: `catalog` de `lib/catalog.ts` (`search`, `getById`, `getSeasonal`) e tipos `Season`/`AnimeSeed` de `lib/anilist.ts`.
- Produces:
  - `getCachedAnimeById(anilistId: number): Promise<AnimeSeed>`
  - `searchCachedAnime(query: string): Promise<AnimeSeed[]>`
  - `getCachedSeasonalAnime(season: Season, year: number): Promise<AnimeSeed[]>`
  - Tags: `anime:{id}` no detalhe, `anime-search` e `anime-seasonal` nas listas. TTL: detalhe 3600s, listas 600s.

- [ ] **Step 1: Escrever o teste (failing first)**

`unstable_cache` real exige runtime Next, então o teste faz passthrough. `tests/unit/anime-cache.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/catalog", () => ({
  catalog: { getById: vi.fn(), search: vi.fn(), getSeasonal: vi.fn() },
}));

import { catalog } from "@/lib/catalog";
import { getCachedAnimeById, searchCachedAnime } from "@/lib/anime-cache";

beforeEach(() => vi.clearAllMocks());

describe("anime-cache", () => {
  it("delega getById ao catalog e retorna o seed", async () => {
    vi.mocked(catalog.getById).mockResolvedValue({
      anilistId: 21, title: "One Piece", coverImageUrl: null, episodeCount: null, seasonCount: null,
    });
    const seed = await getCachedAnimeById(21);
    expect(seed.title).toBe("One Piece");
    expect(catalog.getById).toHaveBeenCalledWith(21);
  });

  it("delega search ao catalog", async () => {
    vi.mocked(catalog.search).mockResolvedValue([]);
    await searchCachedAnime("frieren");
    expect(catalog.search).toHaveBeenCalledWith("frieren");
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm exec vitest run tests/unit/anime-cache.test.ts`
Expected: FAIL com "Failed to resolve import @/lib/anime-cache" (arquivo ainda não existe).

- [ ] **Step 3: Criar `lib/anime-cache.ts`**

```ts
import { unstable_cache } from "next/cache";
import { catalog } from "@/lib/catalog";
import type { AnimeSeed, Season } from "@/lib/anilist";

const DETAIL_TTL_SECONDS = 3600;
const LIST_TTL_SECONDS = 600;

export function getCachedAnimeById(anilistId: number): Promise<AnimeSeed> {
  return unstable_cache(() => catalog.getById(anilistId), ["anime", String(anilistId)], {
    revalidate: DETAIL_TTL_SECONDS,
    tags: [`anime:${anilistId}`],
  })();
}

export function searchCachedAnime(query: string): Promise<AnimeSeed[]> {
  return unstable_cache(() => catalog.search(query), ["anime-search", query], {
    revalidate: LIST_TTL_SECONDS,
    tags: ["anime-search"],
  })();
}

export function getCachedSeasonalAnime(season: Season, year: number): Promise<AnimeSeed[]> {
  return unstable_cache(() => catalog.getSeasonal(season, year), ["anime-seasonal", season, String(year)], {
    revalidate: LIST_TTL_SECONDS,
    tags: ["anime-seasonal"],
  })();
}
```

Verificado no `node_modules` do repo: `unstable_cache` é exportado por `next/cache` na versão instalada (16.3.3). Não usar `cacheLife`/`cacheTag` novos — fora do escopo.

- [ ] **Step 4: Rodar o teste**

Run: `pnpm exec vitest run tests/unit/anime-cache.test.ts`
Expected: PASS nos 2 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/anime-cache.ts tests/unit/anime-cache.test.ts
git commit -m "feat: cache Next de 1h/10min sobre o catalogo AniList"
```

---

### Task 4: Actions sem persistência de anime

**Files:**
- Modify: `lib/watchlist-actions.ts`
- Modify: `lib/anime-actions.ts`
- Test: novo `tests/unit/watchlist-actions.test.ts` (só o helper puro `parseTotal`)

**Interfaces:**
- Consumes: assinaturas da Task 2 (`markEpisodeWatched`/`removeEpisodeWatch` com `total?`) e `revalidateTag` de `next/cache`.
- Produces: `parseTotal(value: FormDataEntryValue | null): number | null` exportado de `lib/watchlist-actions.ts`; actions com mesma assinatura e mesmos redirects de antes.

- [ ] **Step 1: Escrever o teste do helper (failing first)**

`tests/unit/watchlist-actions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

// watchlist-actions importa @/auth (next-auth → next/server quebra no vitest);
// mocks só para carregar o módulo — asserções inalteradas.
vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));

import { parseTotal } from "@/lib/watchlist-actions";

describe("parseTotal", () => {
  it("converte string numérica", () => {
    expect(parseTotal("24")).toBe(24);
  });
  it("retorna null para ausente, vazio ou inválido", () => {
    expect(parseTotal(null)).toBeNull();
    expect(parseTotal("")).toBeNull();
    expect(parseTotal("?")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm exec vitest run tests/unit/watchlist-actions.test.ts`
Expected: FAIL — `parseTotal` não é exportado.

- [ ] **Step 3: Editar `lib/watchlist-actions.ts`**

Adicionar no topo (após imports):

```ts
export function parseTotal(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
```

Em `markEpisodeAction`, ler o total e repassar:

```ts
const total = parseTotal(formData.get("total"));
await markEpisodeWatched(userId, anilistId, season, episode, total);
```

Em `removeEpisodeAction`, idem:

```ts
const total = parseTotal(formData.get("total"));
const entryRemoved = await removeEpisodeWatch(userId, anilistId, season, episode, total);
```

Nada mais muda no arquivo (redirects, `STATUSES`, `deleteAccountAction` intactos).

- [ ] **Step 4: Enxugar `lib/anime-actions.ts`**

Conteúdo novo completo:

```ts
"use server";

import { revalidatePath, revalidateTag } from "next/cache";

export async function refreshAnimeAction(formData: FormData): Promise<void> {
  const anilistId = Number(formData.get("anilistId"));
  if (!Number.isFinite(anilistId)) {
    throw new Error("anilistId inválido");
  }
  revalidateTag(`anime:${anilistId}`, { expire: 0 });
  revalidateTag("anime-seasonal", { expire: 0 });
  revalidatePath(`/anime/${anilistId}`);
}
```

`addAnimeAction` é apagada; conferir que nenhum import dela resta (buscar `addAnimeAction` no repo no Step 5 e remover o uso se existir — hoje só `refreshAnimeAction` é usada, em `app/anime/[anilistId]/page.tsx`).

- [ ] **Step 5: Rodar teste + typecheck + busca de usos órfãos**

Run: `pnpm exec vitest run tests/unit/watchlist-actions.test.ts`
Expected: PASS.

Run: `pnpm exec tsc --noEmit`
Expected: sem erros (ações server são checadas pelo tsc do projeto).

Buscar: `addAnimeAction|ensureAnime|prisma\.anime` em `lib app tests` — Expected: zero ocorrências (a checagem é manual via grep; se `cleanup_watchlist.ts` ainda existir, ignorar nesta task — ele cai na Task 6).

- [ ] **Step 6: Commit**

```bash
git add lib/watchlist-actions.ts lib/anime-actions.ts tests/unit/watchlist-actions.test.ts
git commit -m "feat: actions repassam total da API e refresh só revalida cache"
```

---

### Task 5: Páginas com merge local + API

**Files:**
- Modify: `app/anime/[anilistId]/page.tsx`
- Modify: `app/watchlist/page.tsx`
- Modify: `app/watchlist/[animeId]/page.tsx`
- Test: verificação via `tsc` + suite e2e existente (depende de rede AniList + DB; não é gate desta task, rodar se possível)

**Interfaces:**
- Consumes: `getCachedAnimeById` (Task 3), `getWatchEntry`/`listWatchEntries` (Task 2), `refreshAnimeAction` (Task 4).
- Produces: nenhuma exportação nova; mesmo HTML/rotas de antes, com `entry.anilistId` no lugar de `entry.anime.anilistId` e hidden `total` nos forms de episódio.

- [ ] **Step 1: `app/anime/[anilistId]/page.tsx` — trocar fonte do seed**

Trocar `import { catalog } from "@/lib/catalog"` por `import { getCachedAnimeById } from "@/lib/anime-cache"` e a chamada `catalog.getById(anilistId)` por `getCachedAnimeById(anilistId)`. Resto idêntico (o bloco try/catch de erro amigável já existe e continua tratando 429 com mensagem em vez de 500).

- [ ] **Step 2: `app/watchlist/page.tsx` — merge com `allSettled`**

Após `const entries = await listWatchEntries(...)`, inserir:

```tsx
import { getCachedAnimeById } from "@/lib/anime-cache";

const seeds = await Promise.allSettled(entries.map((e) => getCachedAnimeById(e.anilistId)));
const cards = entries.map((entry, i) => {
  const s = seeds[i];
  const anime = s.status === "fulfilled"
    ? s.value
    : { anilistId: entry.anilistId, title: `Anime ${entry.anilistId}`, coverImageUrl: null as string | null, episodeCount: null as number | null, seasonCount: null };
  return { entry, anime, unavailable: s.status === "rejected" };
});
```

Trocar o loop de `entries` por `cards` (desestruturar `{ entry, anime, unavailable }`), trocar `entry.anime.anilistId` → `anime.anilistId`, `entry.anime.coverImageUrl` → `anime.coverImageUrl`, `entry.anime.title` → `anime.title`, e renderizar sob o título, quando `unavailable`, o aviso `"Detalhes indisponíveis agora (AniList instável)."`. Adicionar no topo da lista, quando `cards.length > 0 && cards.every((c) => c.unavailable)`, o banner âmbar `"Não foi possível carregar os detalhes na AniList agora. Seu progresso está salvo."`.

- [ ] **Step 3: `app/watchlist/[animeId]/page.tsx` — paralelo + hidden `total`**

Trocar o fetch atual por:

```tsx
import { getCachedAnimeById } from "@/lib/anime-cache";

const [entry, seed] = await Promise.all([
  getWatchEntry(user.id, anilistId),
  getCachedAnimeById(anilistId).catch(() => null),
]);
if (!entry) notFound();
const anime = seed ?? { title: `Anime ${anilistId}` };
const total = seed?.episodeCount ?? null;
```

Trocar `entry.anime.title` → `anime.title` e `entry.anime.episodeCount` → `total`. Nos dois forms (`markEpisodeAction` e `removeEpisodeAction`) adicionar:

```tsx
<input type="hidden" name="total" value={total ?? ""} />
```

(usa o `parseTotal` da Task 4: `""` vira `null` e pula a transição.)

- [ ] **Step 4: Verificar**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

Run: `pnpm exec vitest run tests/unit`
Expected: PASS (nenhum teste unitário cobre páginas; garante que nada quebrou).

- [ ] **Step 5: Commit**

```bash
git add app/anime/\[anilistId\]/page.tsx app/watchlist/page.tsx app/watchlist/\[animeId\]/page.tsx
git commit -m "feat: paginas fazem merge entry local + seed AniList com fallback amigavel"
```

---

### Task 6: Limpeza final e verificação completa

**Files:**
- Delete: `cleanup_watchlist.ts`
- Modify: `lib/catalog.ts`
- Test: suite unitária completa + `tsc` + `prisma validate`

**Interfaces:**
- Consumes: tudo das Tasks 1–5.
- Produces: repo sem nenhuma referência a `prisma.anime`, `model Anime` ou `./datasource`; `catalog` com tipo `AnimeDataSource` inline.

- [ ] **Step 1: Apagar `cleanup_watchlist.ts`**

Run: `git rm cleanup_watchlist.ts`
Expected: arquivo removido do índice.

- [ ] **Step 2: Corrigir o tipo em `lib/catalog.ts`**

O arquivo atual termina com `export const catalog: import("./datasource").AnimeDataSource` e `./datasource` não existe. Trocar o import de tipo no topo por:

```ts
import { searchAnime, getAnimeById, getSeasonalAnime, type AnimeSeed } from "./anilist";
import { isOpen, recordSuccess, recordFailure } from "./circuitBreaker";
import type { Season } from "./anilist";

export type AnimeDataSource = {
  search: (q: string) => Promise<AnimeSeed[]>;
  getById: (id: number) => Promise<AnimeSeed>;
  getSeasonal: (season: Season, year: number) => Promise<AnimeSeed[]>;
};
```

e a exportação por `export const catalog: AnimeDataSource = { ... }` (corpo inalterado). `AnimeSeed` já é exportado por `lib/anilist.ts:7`.

- [ ] **Step 3: Grep final de referências mortas**

Buscar `prisma\.anime|model Anime|resolveAnimeId|ensureAnime|addAnimeAction|entry\.anime|datasource` em `lib app tests prisma` (excluindo `docs/` e `.next/`).
Expected: zero ocorrências. Se aparecer algo em teste e2e (ex.: comentário "seeded anime"), atualizar o comentário sem mudar o teste.

- [ ] **Step 4: Verificação completa**

Run: `pnpm exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀` (ou equivalente sem erro).

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

Run: `pnpm exec vitest run`
Expected: todas as suites PASS (e2e Playwright fica de fora — exige servidor + rede AniList + DB; rodar manualmente se possível: `pnpm test:e2e`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove referencias mortas a Anime e datasource"
```

---

## Self-Review

- **Spec coverage:** §3 schema → Task 1; writes locais + `total?` (§4, §5) → Tasks 2 e 4; `anime-cache.ts` TTLs/tags (§2, §4) → Task 3; merge + erro parcial + hidden `total` (§5, §6) → Task 5; `refreshAnimeAction` só revalida + limpeza `cleanup_watchlist.ts`/`datasource` (§4) → Tasks 4 e 6; testes (§7) → Tasks 1–4 e 6; fora de escopo (§8) respeitado — nenhum fallback Jikan/Kitsu nem retry 429 incluído.
- **Placeholder scan:** nenhum `TODO/TBD`; comandos com args exatos; SQL da migration delegado ao `prisma migrate dev` (artefato gerado, não placeholder); única checagem manual é o grep com resultado esperado explícito.
- **Type consistency:** `userId_anilistId` usado nas Tasks 2, 4 e 5; `total?: number | null` com `?? null` antes de `computeNextStatus` (que aceita `number | null`); `parseTotal` compartilhado entre actions e páginas; tags `anime:{id}` idênticas no cache (Task 3) e no `revalidateTag` (Task 4); `AnimeSeed` importado de `lib/anilist.ts` nas Tasks 3 e 6.
