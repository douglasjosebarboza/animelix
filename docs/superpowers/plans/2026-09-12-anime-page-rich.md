# Anime Page Rica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/anime/[id]` com sinopse, nomes de episódios, paginação de 12 e ações em massa (até-aqui, marcar-tudo, desmarcar-tudo).

**Architecture:** `BY_ID_QUERY` passa a pedir `description` + `streamingEpisodes{title}` (probe real confirmou ambos); `AnimeSeed` ganha `description` sanitizada e `episodeTitles` posicionais; 3 operações bulk em `lib/watchlist.ts` (transação, `skipDuplicates`); página pagina via `?epPage=` e nunca redireciona para fora.

**Tech Stack:** Next.js 16.3.3 (`unstable_cache` já envolve o catálogo — TTLs inalterados), Prisma 6.19.3 (`createMany skipDuplicates` no PostgreSQL), Vitest 4, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-09-12-anime-page-rich-design.md`

## Global Constraints

- Package manager é `pnpm`; unit tests rodam com `pnpm exec vitest run <arquivo>`.
- Sem migration: nenhuma mudança de schema (operações usam `WatchEntry`/`EpisodeWatch` existentes).
- Copy da UI em português preservada; erro via `?error=` com banner âmbar existente.
- Nenhum redirect para `/watchlist` ao esvaziar (decisão do usuário); `removeFromWatchlistAction` mantém o seu.
- Cada task termina em commit próprio, só com seus arquivos.
- `SEARCH`/`SEASONAL` não mudam; listas recebem `description: null`, `episodeTitles: []`.

---

## File Structure

- Modify: `lib/anilist.ts` — `BY_ID_QUERY` (+2 campos), `RawMedia` (+2 campos), `AnimeSeed` (+2 campos), novos helpers puros `sanitizeDescription` + `mapEpisodeTitles`, `mapMedia` preenche tudo.
- Modify: `tests/unit/anilist.test.ts` — estende o stub `ById` (id 99 com description + streamingEpisodes) + testes dos helpers e do mapeamento.
- Modify: `lib/watchlist.ts` — `markEpisodesUpTo`, `markAllWatched`, `clearAllWatched` (padrão `markEpisodeWatched`: transação, auto-add, transição via `computeNextStatus`).
- Modify: `tests/unit/watchlist.test.ts` — cobre as 3 ops (mock `$transaction` existente, estendido com `createMany`/`deleteMany`/`delete` no tx).
- Modify: `lib/watchlist-actions.ts` — `markUpToAction`, `markAllAction`, `clearAllAction`; `mark/removeEpisodeAction` passam a preservar `epPage` nos redirects de erro; `removeEpisodeAction` perde o branch `entryRemoved → redirect("/watchlist")`.
- Modify: `app/anime/[anilistId]/page.tsx` — header novo, sinopse, nomes, paginação `?epPage=`, toggles + "até aqui" + marcar/desmarcar-todos (mantém `computeProgress` para `watchedCount`).
- Modify: `tests/e2e/watchlist.spec.ts`, `tests/e2e/account.spec.ts` — fluxos até-aqui/marcar-tudo/paginação (e2e é verificação manual, fora do gate: exige dev server + AniList ao vivo).

---

### Task 1: AniList — sinopse + títulos de episódios

**Files:**
- Modify: `lib/anilist.ts:7-13` (`AnimeSeed`), `lib/anilist.ts:25-32` (`RawMedia`), `lib/anilist.ts:38-50` (`mapMedia`), `lib/anilist.ts:121-130` (`BY_ID_QUERY`)
- Modify: `tests/unit/anilist.test.ts` (stub `ById` + novos testes)
- Test: `tests/unit/anilist.test.ts`

**Interfaces:**
- Consumes: `request`, `RawMedia`, `pickTitle` existentes (inalterados).
- Produces:
  - `export function sanitizeDescription(html: string | null | undefined): string | null`
  - `export function mapEpisodeTitles(list: { title?: string | null }[] | null | undefined): (string | null)[]`
  - `AnimeSeed` com `description: string | null` e `episodeTitles: (string | null)[]`
  - `getAnimeById` inalterado na assinatura, retornando os campos novos.

- [ ] **Step 1: Escrever os testes (failing first)**

Acrescentar ao `describe("AniList client")` em `tests/unit/anilist.test.ts`:

```ts
import {
  searchAnime,
  getAnimeById,
  getSeasonalAnime,
  currentSeason,
  AnilistError,
  sanitizeDescription,
  mapEpisodeTitles,
  type SeasonRef,
} from "@/lib/anilist";

describe("rich detail fields", () => {
  it("sanitizeDescription remove tags e colapsa whitespace", () => {
    expect(sanitizeDescription("A<br><br>\nB  C")).toBe("A B C");
    expect(sanitizeDescription(null)).toBeNull();
    expect(sanitizeDescription("  ")).toBeNull();
  });

  it("mapEpisodeTitles mapeia por posição e limpa prefixo", () => {
    expect(
      mapEpisodeTitles([{ title: "Episode 1 - Asteroid Blues" }, { title: null }, {}]),
    ).toEqual(["Asteroid Blues", null, null]);
    expect(mapEpisodeTitles(null)).toEqual([]);
    expect(mapEpisodeTitles(undefined)).toEqual([]);
  });

  it("getAnimeById retorna description e episodeTitles", async () => {
    const anime = await getAnimeById(99);
    expect(anime.description).toBe("Longa sinopse aqui");
    expect(anime.episodeTitles[0]).toBe("Asteroid Blues");
    expect(anime.episodeTitles[1]).toBeNull();
  });
});
```

Estender o stub do servidor nesse mesmo arquivo: no branch `parsed.query.includes("ById")`, antes do retorno genérico, inserir:

```ts
if (parsed.variables.id === 99) {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({
    data: {
      Media: {
        ...media(99, "Anime 99"),
        description: "Longa<br><br>\nsinopse aqui",
        streamingEpisodes: [{ title: "Episode 1 - Asteroid Blues" }, { title: null }],
      },
    },
  }));
  return;
}
```

Nota: o teste espera `"Longa sinopse aqui"` (sanitizado de `"Longa<br><br>\nsinopse aqui"`).

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm exec vitest run tests/unit/anilist.test.ts`
Expected: FAIL — `sanitizeDescription`/`mapEpisodeTitles` não exportados (TypeError/import error nos 2 primeiros testes; o terceiro falha junto).

- [ ] **Step 3: Implementar em `lib/anilist.ts`**

Tipo (trocar o bloco `AnimeSeed` atual):

```ts
export type AnimeSeed = {
  anilistId: number;
  title: string;
  coverImageUrl: string | null;
  episodeCount: number | null;
  seasonCount: number | null;
  description: string | null;
  episodeTitles: (string | null)[];
};
```

`RawMedia` (acrescentar 2 campos):

```ts
type RawMedia = {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { large?: string } | null;
  episodes?: number | null;
  averageScore?: number | null;
  genres?: string[] | null;
  description?: string | null;
  streamingEpisodes?: { title?: string | null }[] | null;
};
```

Helpers (novos, antes de `mapMedia`):

```ts
export function sanitizeDescription(html: string | null | undefined): string | null {
  if (html == null) return null;
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

export function mapEpisodeTitles(
  list: { title?: string | null }[] | null | undefined,
): (string | null)[] {
  if (!list) return [];
  return list.map((ep, i) => {
    const t = ep?.title?.trim();
    if (!t) return null;
    const prefix = new RegExp(`^episode\\s+${i + 1}\\s*[-–:]\\s*`, "i");
    const cleaned = t.replace(prefix, "").trim();
    return cleaned === "" ? null : cleaned;
  });
}
```

`mapMedia` (assinatura volta a `AnimeSeed`, corpo ganha 2 linhas):

```ts
function mapMedia(m: RawMedia): AnimeSeed {
  // AniList does not expose a season count on Media (only `season`/`seasonYear`),
  // so seasonCount is left null for now.
  return {
    anilistId: m.id,
    title: pickTitle(m.title),
    coverImageUrl: m.coverImage?.large ?? null,
    episodeCount: m.episodes ?? null,
    seasonCount: null,
    description: sanitizeDescription(m.description),
    episodeTitles: mapEpisodeTitles(m.streamingEpisodes),
  };
}
```

`BY_ID_QUERY` (acrescentar 2 linhas dentro de `Media`):

```graphql
      description(asHtml: false)
      streamingEpisodes { title }
```

`SEARCH_QUERY` e `SEASONAL_QUERY` ficam intactos — search/seasonal passam a retornar `description: null`, `episodeTitles: []` via defaults dos helpers. Nada mais no arquivo muda.

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm exec vitest run tests/unit/anilist.test.ts`
Expected: PASS (inclui os 3 testes novos).

- [ ] **Step 5: Commit**

```bash
git add lib/anilist.ts tests/unit/anilist.test.ts
git commit -m "feat: AnimeSeed com sinopse e titulos de episodios (ById)"
```

---

### Task 2: Lib — operações em massa

**Files:**
- Modify: `lib/watchlist.ts` (acrescenta 3 funções após `markEpisodeWatched`)
- Modify: `tests/unit/watchlist.test.ts` (estende mock tx + 4 testes)
- Test: `tests/unit/watchlist.test.ts`

**Interfaces:**
- Consumes: `prisma`, `computeNextStatus`, `distinctCount`, `findEpisodeWatch`, `WatchlistError`, padrão auto-add+P2002 de `markEpisodeWatched` (inalterados).
- Produces:
  - `markEpisodesUpTo(userId: string, anilistId: number, episode: number, total?: number | null): Promise<void>`
  - `markAllWatched(userId: string, anilistId: number, total?: number | null): Promise<void>`
  - `clearAllWatched(userId: string, anilistId: number): Promise<void>`

- [ ] **Step 1: Escrever os testes (failing first)**

Estender o mock `$transaction` do arquivo para incluir no `tx`:
`createMany: vi.fn()`, `deleteMany: vi.fn()`, `delete: vi.fn()` em `watchEntry`/`episodeWatch` conforme o caminho (tx espelha `prisma.watchEntry`/`prisma.episodeWatch`; adicionar `createMany` e `deleteMany` em `episodeWatch`, `create`/`delete` em `watchEntry` — reaproveitar `vi.mocked(prisma...)` como os existentes). Novos testes no `describe`:

```ts
it("markEpisodesUpTo marca 1..N pulando existentes", async () => {
  const before = { id: "e1", status: "watching", episodeWatches: [{ id: "w2", episode: 2 }] };
  const after = {
    id: "e1", status: "watching",
    episodeWatches: [{ id: "w1", episode: 1 }, { id: "w2", episode: 2 }, { id: "w3", episode: 3 }],
  };
  vi.mocked(prisma.watchEntry.findUnique)
    .mockResolvedValueOnce(before as never)
    .mockResolvedValueOnce(after as never);
  await markEpisodesUpTo("user-1", 123, 3, 12);
  expect(prisma.episodeWatch.createMany).toHaveBeenCalledWith(
    expect.objectContaining({ data: [
      { watchEntryId: "e1", episode: 1 },
      { watchEntryId: "e1", episode: 3 },
    ] }),
  );
});

it("markEpisodesUpTo auto-adiciona sem entry", async () => {
  const after = { id: "e9", status: "watching", episodeWatches: [{ id: "w1", episode: 1 }] };
  vi.mocked(prisma.watchEntry.findUnique)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(after as never);
  vi.mocked(prisma.watchEntry.create).mockResolvedValue({ id: "e9", status: "watching" } as never);
  await markEpisodesUpTo("user-1", 123, 1, 12);
  expect(prisma.watchEntry.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: { userId: "user-1", anilistId: 123, status: "watching" } }),
  );
});

it("markAllWatched com total null falha sem escrever", async () => {
  await expect(markAllWatched("user-1", 123, null)).rejects.toThrow(WatchlistError);
  expect(prisma.episodeWatch.createMany).not.toHaveBeenCalled();
});

it("clearAllWatched apaga watches e entry; sem entry é no-op", async () => {
  vi.mocked(prisma.watchEntry.findUnique).mockResolvedValueOnce({ id: "e1", status: "watching" } as never);
  await clearAllWatched("user-1", 123);
  expect(prisma.episodeWatch.deleteMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { watchEntryId: "e1" } }),
  );
  vi.clearAllMocks();
  vi.mocked(prisma.watchEntry.findUnique).mockResolvedValueOnce(null);
  await expect(clearAllWatched("user-1", 123)).resolves.toBeUndefined();
});
```

Ajustar imports do teste: `import { addToWatchlist, markEpisodeWatched, markEpisodesUpTo, markAllWatched, clearAllWatched, WatchlistError } from "@/lib/watchlist";`

- [ ] **Step 2: Rodar para ver falhar**

Run: `pnpm exec vitest run tests/unit/watchlist.test.ts`
Expected: FAIL — `markEpisodesUpTo`/`markAllWatched`/`clearAllWatched` não exportados.

- [ ] **Step 3: Implementar em `lib/watchlist.ts`** (inserir após `markEpisodeWatched`)

```ts
export async function markEpisodesUpTo(
  userId: string,
  anilistId: number,
  episode: number,
  total?: number | null,
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
      include: { episodeWatches: true },
    });
    let before = found;
    if (!before) {
      try {
        const created = await tx.watchEntry.create({
          data: { userId, anilistId, status: "watching" },
        });
        before = { ...created, episodeWatches: [] };
      } catch (err) {
        if ((err as { code?: string }).code !== "P2002") throw err;
        const retry = await tx.watchEntry.findUnique({
          where: { userId_anilistId: { userId, anilistId } },
          include: { episodeWatches: true },
        });
        if (!retry) throw new WatchlistError("Anime não está na sua watchlist");
        before = retry;
      }
    }

    const seen = new Set(before.episodeWatches.map((e) => e.episode));
    const missing = Array.from({ length: episode }, (_, i) => i + 1).filter((ep) => !seen.has(ep));
    if (missing.length > 0) {
      await tx.episodeWatch.createMany({
        data: missing.map((ep) => ({ watchEntryId: before.id, episode: ep })),
        skipDuplicates: true,
      });
    }

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

export async function markAllWatched(
  userId: string,
  anilistId: number,
  total?: number | null,
): Promise<void> {
  if (total == null || !Number.isInteger(total) || total <= 0) {
    throw new WatchlistError("Total de episódios indisponível para este título");
  }
  return markEpisodesUpTo(userId, anilistId, total, total);
}

export async function clearAllWatched(
  userId: string,
  anilistId: number,
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.watchEntry.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
    });
    if (!entry) return;
    await tx.episodeWatch.deleteMany({ where: { watchEntryId: entry.id } });
    await tx.watchEntry.delete({ where: { id: entry.id } });
  });
}
```

Nota: `before.id` dentro do `createMany` — após o bloco auto-add, `before` é não-nulo (mesmo padrão de `markEpisodeWatched`; se o tsc reclamar, tipar `let before: EntryWithRelations | null` não é preciso — seguir o padrão existente que já compila).

- [ ] **Step 4: Rodar para ver passar**

Run: `pnpm exec vitest run tests/unit/watchlist.test.ts`
Expected: PASS (9 testes: 5 antigos + 4 novos).

- [ ] **Step 5: Commit**

```bash
git add lib/watchlist.ts tests/unit/watchlist.test.ts
git commit -m "feat: operacoes em massa da watchlist (ate-aqui, tudo, limpar)"
```

---

### Task 3: Actions — 3 novas + epPage + fim do redirect

**Files:**
- Modify: `lib/watchlist-actions.ts`
- Test: `pnpm exec tsc --noEmit` (actions server não têm teste unitário neste repo; verificação é tsc + smoke na Task 4)

**Interfaces:**
- Consumes: `markEpisodesUpTo`, `markAllWatched`, `clearAllWatched` (Task 2), `parsePositiveInt` (existente), `redirect`/`revalidatePath` (existentes).
- Produces:
  - `markUpToAction(formData): Promise<void>` (lê `anilistId, season, episode, total?, epPage?`)
  - `markAllAction(formData): Promise<void>` (lê `anilistId, total?, epPage?`)
  - `clearAllAction(formData): Promise<void>` (lê `anilistId, epPage?`)
  - Redirects de erro de `mark/removeEpisodeAction` passam a incluir `epPage`; `removeEpisodeAction` sem branch de redirect ao esvaziar.

- [ ] **Step 1: Adicionar as 3 actions** (após `removeEpisodeAction`, antes de `STATUSES`... nota: `STATUSES`/`setWatchStatusAction`/`setAutoPauseAction` foram removidos em `dc49859`; inserir após `removeEpisodeAction`)

```ts
function animeUrl(anilistId: number, epPage: number | null, error?: string): string {
  const params = new URLSearchParams();
  if (epPage != null && epPage > 1) params.set("epPage", String(epPage));
  if (error) params.set("error", error);
  const qs = params.toString();
  return qs ? `/anime/${anilistId}?${qs}` : `/anime/${anilistId}`;
}

export async function markUpToAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const season = parsePositiveInt(formData.get("season"));
  const episode = parsePositiveInt(formData.get("episode"));
  const epPage = parsePositiveInt(formData.get("epPage"));
  if (season == null || episode == null) redirect(animeUrl(anilistId, epPage));
  const total = parseTotal(formData.get("total"));
  try {
    await markEpisodesUpTo(userId, anilistId, episode, total);
  } catch (err) {
    if (err instanceof WatchlistError) {
      redirect(animeUrl(anilistId, epPage, (err as Error).message));
    }
    throw err;
  }
  revalidatePath(`/anime/${anilistId}`);
}

export async function markAllAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const epPage = parsePositiveInt(formData.get("epPage"));
  const total = parseTotal(formData.get("total"));
  try {
    await markAllWatched(userId, anilistId, total);
  } catch (err) {
    if (err instanceof WatchlistError) {
      redirect(animeUrl(anilistId, epPage, (err as Error).message));
    }
    throw err;
  }
  revalidatePath(`/anime/${anilistId}`);
}

export async function clearAllAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const epPage = parsePositiveInt(formData.get("epPage"));
  await clearAllWatched(userId, anilistId);
  revalidatePath(`/anime/${anilistId}`);
}
```

Estender imports de `@/lib/watchlist`: acrescentar `markEpisodesUpTo, markAllWatched, clearAllWatched`.

- [ ] **Step 2: Atualizar `mark/removeEpisodeAction`**

- Nos dois, ler `const epPage = parsePositiveInt(formData.get("epPage"));` e trocar redirects de erro `redirect(\`/anime/${anilistId}?error=...\`)` por `redirect(animeUrl(anilistId, epPage, ...))`.
- Em `removeEpisodeAction`: apagar o branch `if (entryRemoved) redirect("/watchlist");` e o comentário acima dele; trocar `const entryRemoved = await removeEpisodeWatch(...)` por `await removeEpisodeWatch(...)`; `revalidatePath` continua.

- [ ] **Step 3: Verificar tsc**

Run: `pnpm exec tsc --noEmit`
Expected: zero erros nos arquivos tocados (`lib/watchlist-actions.ts`). Erros pré-existentes fora do escopo (`test_apis.ts` foi apagado em `dc49859`; ignorar apenas `.next/` stale).

- [ ] **Step 4: Commit**

```bash
git add lib/watchlist-actions.ts
git commit -m "feat: actions em massa e epPage (fim do redirect ao esvaziar)"
```

---

### Task 4: Página `/anime/[id]` rica + e2e

**Files:**
- Modify: `app/anime/[anilistId]/page.tsx` (reescrita da seção de conteúdo)
- Modify: `tests/e2e/watchlist.spec.ts`, `tests/e2e/account.spec.ts` (fluxos novos; e2e é verificação manual fora do gate)
- Test: `pnpm exec tsc --noEmit` + smoke `curl` no dev server

**Interfaces:**
- Consumes: `anime.description`, `anime.episodeTitles` (Task 1), `getWatchEntry` (existente), `computeProgress` (existente, mantém `watchedCount`), `markUpToAction`, `markAllAction`, `clearAllAction` (Task 3), actions existentes.
- Produces: nenhuma exportação nova; mesma rota.

- [ ] **Step 1: Reescrever a página**

`searchParams` passa a `{ error?: string; epPage?: string }`. Buscar dados como hoje (`getCachedAnimeById` + `getWatchEntry`). Lógica nova no corpo:

```tsx
const total = anime.episodeCount ?? null;
const watches = entry?.episodeWatches ?? [];
const progress = computeProgress(watches, total);
const watchedSet = new Set<number>(watches.map((ew) => ew.episode));
const epTitle = (ep: number): string => {
  const t = anime.episodeTitles[ep - 1] ?? null;
  return t ? `${ep}. ${t}` : `Episódio ${ep}`;
};
const PER_PAGE = 12;
const pageCount = total == null ? 0 : Math.max(1, Math.ceil(total / PER_PAGE));
const epPageRaw = parsePositiveInt(searchParams.epPage ?? null) ... // ver nota
```

NOTA: `searchParams` chega como objeto já resolvido (`const { error, epPage } = await searchParams`); valores são `string | string[] | undefined`, então normalizar antes de `parsePositiveInt` (que aceita `FormDataEntryValue | null`):

```tsx
const epPageRaw = Array.isArray(epPage) ? epPage[0] : (epPage ?? null);
const epPageParsed = parsePositiveInt(epPageRaw) ?? 1;
```

`parsePositiveInt` mora em `lib/parse.ts` (sem `"use server"`, importável em server components — padrão usado pelas actions). Clamp: `const epPage = Math.min(Math.max(page, 1), pageCount)` quando `pageCount > 0`, senão 1. Fatiar: `const pageEps = Array.from({length: total}, (_, i) => i + 1).slice((epPage - 1) * PER_PAGE, epPage * PER_PAGE)` (só quando `total != null`).

Header: remover os `<p>` "X de Y assistidos" e "Status"; `Episódios:` vira `<dd>{entry ? watches.length : 0}/{total ?? "?"}</dd>` — usar `progress.watchedCount` no lugar de `watches.length` para manter `computeProgress` em uso. Sinopse: `{anime.description && (<p className="mt-4 text-base text-muted">{anime.description}</p>)}` após o `dl`.

Header da lista (acima do `<ul>`, só quando `total != null`): se `!entry || watchedSet.size < total` → form `markAllAction` (hiddens `anilistId`, `total`, `epPage`) botão "Marcar todos"; senão form `clearAllAction` (hiddens `anilistId`, `epPage`) botão "Desmarcar todos".

Linha de ep: título via `epTitle(ep)`; toggle individual existente + hidden `epPage`; botão ghost extra "até aqui" (form `markUpToAction`, hiddens `anilistId/season/episode/total/epPage`) SOMENTE em linhas não-assistidas.

Paginação (após o `<ul>`, quando `pageCount > 1`): links `<a href={\`/anime/${anilistId}?epPage=${epPage - 1}\`}>← Anterior</a>`, texto `Página ${epPage} de ${pageCount}`, link Próxima. Banner `?error=` existente mantido.

- [ ] **Step 2: Atualizar e2e** (verificação manual, fora do gate)

`tests/e2e/watchlist.spec.ts` — acrescentar ao fim do teste 1 (antes do fechamento) ou novo teste "bulk e paginação": com anime 1 (26 eps, cuidado: títulos reais vêm da AniList ao vivo — asserir estrutura, não nomes):
  - `?epPage=2` mostra "13." e não mostra "Episódio 12"/"12. " (primeira linha da página 2);
  - botão "até aqui" no ep 3 → 3 assistidos (`Episódios: 3/26`);
  - "Marcar todos" → `Episódios: 26/26`;
  - "Desmarcar todos" → entry some (sem Status, sem Remover), permanece em `/anime/1`.
`tests/e2e/account.spec.ts` — sem mudanças (isolamento inalterado).

- [ ] **Step 3: Verificar**

Run: `pnpm exec tsc --noEmit`
Expected: zero erros em `app/anime/[anilistId]/page.tsx` (ignorar `.next/` stale).

Run (dev server rodando): `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/anime/1`
Expected: `307` (redirect a `/login` sem sessão = página compila; 500 indicaria erro de build).

- [ ] **Step 4: Commit**

```bash
git add "app/anime/[anilistId]/page.tsx" tests/e2e/watchlist.spec.ts tests/e2e/account.spec.ts
git commit -m "feat: pagina do anime com sinopse, eps nomeados, paginacao e bulk"
```

---

## Self-Review

- **Spec coverage:** §2 (query+tipos+sanitize+posicional+degradação) → Task 1; `SEARCH`/`SEASONAL` intactos com defaults → Task 1 Step 3; §3 (3 ops, skipDuplicates, total-null, clear no-op) → Task 2; §4 (header, sinopse, nomes, paginação URL, toggles, epPage em forms/redirects, fim do redirect) → Tasks 3+4; §5 (3 actions, parse reuse, banner existente) → Task 3; §6 (arquivos, TDD listado, verificação) → Tasks 1/2/4; §7 respeitado (sem links externos, sem gênero, season fixo 1, TTL intacto).
- **Placeholder scan:** nenhum `TODO/TBD`; todos os comandos com args exatos; códigos completos por step; `animeUrl` definido antes do uso; `PER_PAGE = 12` literal da spec.
- **Type consistency:** `episodeTitles: (string | null)[]` Task 1 = `anime.episodeTitles[ep-1]` Task 4; `markEpisodesUpTo(userId, anilistId, episode, total?)` idêntica Tasks 2↔3; `markAllWatched`/`clearAllWatched` idem; `epPage: number | null` via `parsePositiveInt` nas 3 actions + 2 existentes; `animeUrl` centraliza query (epPage>1 omitido, igual em erro e sucesso).
