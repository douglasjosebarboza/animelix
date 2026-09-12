# Jikan Fallback + Catalogue Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buscar animes via AniList com fallback automático para Jikan/MAL quando 403/5xx, remover `lib/catalogue.ts` cacheado e enxugar Prisma como aprovado.

**Architecture:** Strategy `AnimeDataSource` com `AnilistAdapter` (existente) + `JikanAdapter` novo, orquestrados por `lib/catalog.ts` fachada sem cache que consulta `CircuitBreaker` in-memory (3 falhas/60s → abre 10s). DB `Anime` mantido mínimo para watchlist offline; `WatchEntry`/`EpisodeWatch` droparam colunas mortas.

**Tech Stack:** Next.js 16.3.3, Prisma 6.19.3, Neon Postgres, TypeScript 5, Vitest 4.1.11, Playwright 1.62.1, Jikan API v4 (`https://api.jikan.moe/v4/anime`)

**Spec:** `docs/superpowers/specs/2026-09-12-jikan-fallback-design.md`

## Global Constraints

- Node >=20, pnpm@11.24.0, Prisma 6.19.3 travado (não v7), Next.js 16.3.3 App Router
- Auth.js 5 beta jwt, html {font-size:18px} em app/globals.css:77, body flex min-h-screen flex-col main flex-1
- Status apenas watching|completed (prisma default watching, lib/watchstatus.ts:1)
- Images remotePatterns s4.anilist.co, cdn.anilist.co, *.anilist.co + cdn.myanimelist.net (Jikan) + compress true
- pnpm test:unit 46 pass, pnpm build 9/9 static ok, pnpm audit 0 high
- Jikan rate limit 3 req/s (respeitar Retry-After), AniList 30/min via inflight dedup

---

## File Structure

- **Create:** `lib/datasource.ts` — interface `AnimeDataSource` + `Seed` type
- **Create:** `lib/circuitBreaker.ts` — `isOpen/recordSuccess/recordFailure`
- **Create:** `lib/jikan.ts` — `JikanAdapter implements AnimeDataSource`
- **Modify:** `lib/anilist.ts` — extrai `AnilistAdapter implements AnimeDataSource` (mantém request/inflight)
- **Create:** `lib/catalog.ts` — fachada `search/getById/getSeasonal` com fallback + breaker
- **Delete:** `lib/catalogue.ts`
- **Modify:** `prisma/schema.prisma` — enxuga Anime/WatchEntry/EpisodeWatch
- **Modify:** `lib/watchlist.ts` — usa `lib/catalog.ts` em `resolveAnimeId`, remove watchedAt/season
- **Modify:** `app/page.tsx` — importa de `lib/catalog` não `catalogue`
- **Modify:** `next.config.ts` — adiciona `cdn.myanimelist.net`
- **Test:** `tests/unit/jikan.test.ts`, `tests/unit/catalog.test.ts`, `tests/unit/datasource.test.ts`

---

### Task 1: DataSource Interface + CircuitBreaker

**Files:**
- Create: `lib/datasource.ts`
- Create: `lib/circuitBreaker.ts`
- Test: `tests/unit/circuitBreaker.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `export interface AnimeDataSource { search(q:string):Promise<Seed[]>, getById(id:number):Promise<Seed>, getSeasonal(season:Season,year:number):Promise<Seed[]> }` com `export type Seed = {anilistId:number,title:string,coverImageUrl:string|null,episodeCount:number|null}` e `export function isOpen(key:string):boolean`, `recordSuccess(key)`, `recordFailure(key)`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/circuitBreaker.test.ts
import { describe, expect, it } from "vitest";
import { isOpen, recordFailure, recordSuccess } from "@/lib/circuitBreaker";
describe("circuitBreaker", () => {
  it("opens after 3 failures in 60s", () => {
    const key="anilist:test";
    recordFailure(key); recordFailure(key); recordFailure(key);
    expect(isOpen(key)).toBe(true);
  });
  it("closes on success", () => {
    const key="anilist:test2";
    recordFailure(key); recordFailure(key); recordFailure(key);
    recordSuccess(key);
    expect(isOpen(key)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/circuitBreaker.test.ts -v`
Expected: FAIL `Cannot find module '@/lib/circuitBreaker'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/datasource.ts
export type Season = "WINTER"|"SPRING"|"SUMMER"|"FALL";
export type Seed = { anilistId:number, title:string, coverImageUrl:string|null, episodeCount:number|null };
export interface AnimeDataSource {
  search(q:string): Promise<Seed[]>;
  getById(id:number): Promise<Seed>;
  getSeasonal(season:Season, year:number): Promise<Seed[]>;
}
```

```ts
// lib/circuitBreaker.ts
const store = new Map<string,{fails:number[],openUntil:number}>();
export function isOpen(key:string){ const s=store.get(key); return !!s && Date.now()<s.openUntil; }
export function recordSuccess(key:string){ store.delete(key); }
export function recordFailure(key:string){
  const now=Date.now(); const s=store.get(key)??{fails:[],openUntil:0};
  s.fails=s.fails.filter(t=>now-t<60000); s.fails.push(now);
  if(s.fails.length>=3) s.openUntil=now+10000;
  store.set(key,s);
}
export function _reset(){ store.clear(); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/circuitBreaker.test.ts -v`
Expected: PASS 2/2

- [ ] **Step 5: Commit**

```bash
git add lib/datasource.ts lib/circuitBreaker.ts tests/unit/circuitBreaker.test.ts
git commit -m "feat: datasource interface + circuit breaker 3/60s open 10s"
```

---

### Task 2: JikanAdapter

**Files:**
- Create: `lib/jikan.ts`
- Test: `tests/unit/jikan.test.ts`

**Interfaces:**
- Consumes: `AnimeDataSource` de `lib/datasource.ts`
- Produces: `export class JikanAdapter implements AnimeDataSource`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/jikan.test.ts
import { describe, expect, it, vi } from "vitest";
import { JikanAdapter } from "@/lib/jikan";
global.fetch = vi.fn();
describe("JikanAdapter", () => {
  it("maps search", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok:true, json: async()=>({data:[{mal_id:1, title_english:"Frieren", images:{jpg:{large_image_url:"https://cdn.myanimelist.net/1.jpg"}}, episodes:28}]}) } as any);
    const a=new JikanAdapter(); const r=await a.search("frieren");
    expect(r[0]).toEqual({anilistId:1, title:"Frieren", coverImageUrl:"https://cdn.myanimelist.net/1.jpg", episodeCount:28});
  });
  it("throws on 429", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok:false, status:429, headers:{get:()=>"5"} } as any);
    await expect(new JikanAdapter().search("x")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/jikan.test.ts -v`
Expected: FAIL `Cannot find module '@/lib/jikan'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/jikan.ts
import type { AnimeDataSource, Seed, Season } from "@/lib/datasource";
export class JikanError extends Error { constructor(m:string, readonly status?:number){super(m); this.name="JikanError"} }
function mapJikan(m:any):Seed{ return {anilistId:m.mal_id, title:m.title_english||m.title||"Sem título", coverImageUrl:m.images?.jpg?.large_image_url||null, episodeCount:m.episodes??null} }
export class JikanAdapter implements AnimeDataSource {
  private ep="https://api.jikan.moe/v4/anime";
  async search(q:string):Promise<Seed[]>{ const r=await fetch(`${this.ep}/?q=${encodeURIComponent(q)}&sfw&order_by=popularity&limit=20`); if(!r.ok) throw new JikanError(`Jikan ${r.status}`,r.status); const j=await r.json(); return (j.data||[]).map(mapJikan); }
  async getById(id:number):Promise<Seed>{ const r=await fetch(`${this.ep}/${id}`); if(!r.ok) throw new JikanError(`Jikan ${r.status}`,r.status); const j=await r.json(); return mapJikan(j.data); }
  async getSeasonal(season:Season,year:number):Promise<Seed[]>{ const r=await fetch(`${this.ep}?season=${season.toLowerCase()}&year=${year}&sfw&order_by=score&sort=desc&limit=30`); if(!r.ok) throw new JikanError(`Jikan ${r.status}`,r.status); const j=await r.json(); return (j.data||[]).map(mapJikan); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/jikan.test.ts -v`
Expected: PASS 2/2

- [ ] **Step 5: Commit**

```bash
git add lib/jikan.ts tests/unit/jikan.test.ts
git commit -m "feat: jikan adapter for MAL fallback"
```

---

### Task 3: AnilistAdapter + Catalog Facade (fallback)

**Files:**
- Modify: `lib/anilist.ts` (extrai classe)
- Create: `lib/catalog.ts`
- Test: `tests/unit/catalog.test.ts`

**Interfaces:**
- Consumes: `AnilistAdapter`, `JikanAdapter`, `CircuitBreaker`
- Produces: `export const catalog: AnimeDataSource` em `lib/catalog.ts` com `search/getById/getSeasonal`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/catalog.test.ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/anilist", async (orig)=>{ const m=await orig(); return {...m, AnilistAdapter: class { search=vi.fn().mockRejectedValue(new Error("403")); getById=vi.fn().mockRejectedValue(new Error("403")); getSeasonal=vi.fn().mockRejectedValue(new Error("403")) }} });
vi.mock("@/lib/jikan", ()=>({ JikanAdapter: class { search=vi.fn().mockResolvedValue([{anilistId:1,title:"Jikan",coverImageUrl:null,episodeCount:12}]); getById=vi.fn().mockResolvedValue({anilistId:1,title:"Jikan",coverImageUrl:null,episodeCount:12}); getSeasonal=vi.fn().mockResolvedValue([{anilistId:1,title:"Jikan",coverImageUrl:null,episodeCount:12}]); }}));
import { catalog } from "@/lib/catalog";
it("fallback to jikan on 403", async ()=>{ const r=await catalog.search("frieren"); expect(r[0].title).toBe("Jikan"); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/catalog.test.ts -v`
Expected: FAIL `Cannot find module '@/lib/catalog'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/anilist.ts — adicionar no final
import type { AnimeDataSource, Seed } from "./datasource";
export class AnilistAdapter implements AnimeDataSource {
  async search(q:string){ const r=await searchAnime(q); return r.map(s=>({anilistId:s.anilistId,title:s.title,coverImageUrl:s.coverImageUrl,episodeCount:s.episodeCount})); }
  async getById(id:number){ const s=await getAnimeById(id); return {anilistId:s.anilistId,title:s.title,coverImageUrl:s.coverImageUrl,episodeCount:s.episodeCount}; }
  async getSeasonal(season:Season,year:number){ const r=await getSeasonalAnime({season, seasonYear:year}); return r.map(s=>({anilistId:s.anilistId,title:s.title,coverImageUrl:s.coverImageUrl,episodeCount:s.episodeCount})); }
}
// lib/catalog.ts
import { AnilistAdapter } from "./anilist"; import { JikanAdapter } from "./jikan"; import { isOpen, recordSuccess, recordFailure } from "./circuitBreaker";
const anilist=new AnilistAdapter(); const jikan=new JikanAdapter();
async function withFallback<T>(key:string, fn:()=>Promise<T>):Promise<T>{
  if(!isOpen(key)){ try{ const r=await fn(); recordSuccess(key); return r; } catch(e){ recordFailure(key); const shouldFallback=(e as any).message?.includes("403")||(e as any).status>=500; if(!shouldFallback) throw e; } }
  return (jikan as any)[key==="search"?"search":key==="getById"?"getById":"getSeasonal"].apply(jikan, arguments);
}
export const catalog = {
  search:(q:string)=>withFallback("search",()=>anilist.search(q)).catch(()=>jikan.search(q)),
  getById:(id:number)=>withFallback("getById",()=>anilist.getById(id)).catch(()=>jikan.getById(id)),
  getSeasonal:(season:any,year:number)=>withFallback("getSeasonal",()=>anilist.getSeasonal(season,year)).catch(()=>jikan.getSeasonal(season,year)),
};
```

Simplificado: implemente `catalog` com 3 métodos que tentam anilist, se `isOpen` ou `catch 403/5xx` chamam jikan.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/catalog.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/anilist.ts lib/catalog.ts tests/unit/catalog.test.ts
git commit -m "feat: catalog facade anilist->jikan fallback with breaker"
```

---

### Task 4: Prisma Cleanup (Anime mínimo, WatchEntry/EpisodeWatch enxutos)

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/watchlist.ts` (remove season/watchedAt)
- Test: `tests/unit/watchlist.pagination.test.ts` já existe, atualizar se quebrar

**Interfaces:**
- Consumes: `catalog` de `lib/catalog.ts`
- Produces: schema migrado

- [ ] **Step 1: Write the failing test (schema check)**

```ts
// tests/unit/schema.test.ts
import { Prisma } from "@prisma/client";
it("Anime has no snapshotAt", async ()=>{
  const fields = Prisma.dmmf.datamodel.models.find(m=>m.name==="Anime")!.fields.map(f=>f.name);
  expect(fields).not.toContain("snapshotAt");
  expect(fields).not.toContain("seasonCount");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/schema.test.ts -v`
Expected: FAIL `snapshotAt` ainda existe

- [ ] **Step 3: Write minimal implementation**

```prisma
// prisma/schema.prisma
model Anime { id String @id @default(cuid()); anilistId Int @unique; title String; coverImageUrl String?; episodeCount Int?; watchEntries WatchEntry[] }
model WatchEntry { id String @id @default(cuid()); userId String; animeId String; status String @default("watching"); createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; user User @relation(...); anime Anime @relation(...); episodeWatches EpisodeWatch[]; @@unique([userId, animeId]) }
model EpisodeWatch { id String @id @default(cuid()); watchEntryId String; episode Int; watchEntry WatchEntry @relation(...); @@unique([watchEntryId, episode]) }
```

E `lib/watchlist.ts` trocar `season, watchedAt` por só `episode`:

```ts
await tx.episodeWatch.create({data:{watchEntryId:before.id, episode}});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/schema.test.ts -v` + `pnpm exec prisma generate && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma lib/watchlist.ts tests/unit/schema.test.ts
git commit -m "refactor: prune prisma schema to minimal anime/watchEntry/episodeWatch"
```

- [ ] **Step 6: Migrate**

```bash
set -a; source .env.local; set +a
npx prisma migrate dev --name jikan_fallback_cleanup
```

---

### Task 5: Wire Pages to New Catalog + Delete Old Catalogue + Config

**Files:**
- Modify: `app/page.tsx` (import de lib/catalog, não catalogue)
- Modify: `lib/watchlist.ts:30` (resolveAnimeId via catalog.getById)
- Delete: `lib/catalogue.ts`
- Modify: `next.config.ts` (add cdn.myanimelist.net)
- Test: `tests/e2e/home.spec.ts` (stub jikan)

**Interfaces:**
- Consumes: `catalog` de `lib/catalog.ts`
- Produces: home e watchlist funcionam com AniList ou Jikan

- [ ] **Step 1: Write the failing test (e2e)**

```ts
// tests/e2e/home.jikan.spec.ts (ou update home.spec.ts)
test("home falls back to jikan when anilist 403", async ({page})=>{
  await page.route("https://graphql.anilist.co", r=>r.fulfill({status:403, body:'{"errors":[{"message":"disabled"}]}'}));
  await page.route("https://api.jikan.moe/**", r=>r.fulfill({status:200, body:JSON.stringify({data:[{mal_id:1,title_english:"Fallback",images:{jpg:{large_image_url:"https://cdn.myanimelist.net/1.jpg"}},episodes:12}]})}));
  await page.goto("/");
  await expect(page.locator("ul").first()).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec playwright test tests/e2e/home.jikan.spec.ts -v`
Expected: FAIL `catalog not found`

- [ ] **Step 3: Write minimal implementation**

```ts
// app/page.tsx
import { catalog } from "@/lib/catalog";
import { currentSeason } from "@/lib/anilist";
results = query ? await catalog.search(query) : await catalog.getSeasonal(currentSeason().season, currentSeason().year);
```

```ts
// lib/watchlist.ts
import { catalog } from "@/lib/catalog";
async function resolveAnimeId(anilistId:number){
  const seed=await catalog.getById(anilistId);
  const anime=await prisma.anime.upsert({where:{anilistId:seed.anilistId}, update:{title:seed.title, coverImageUrl:seed.coverImageUrl, episodeCount:seed.episodeCount}, create:{anilistId:seed.anilistId, title:seed.title, coverImageUrl:seed.coverImageUrl, episodeCount:seed.episodeCount}});
  return anime.id;
}
```

```ts
// next.config.ts
images:{ remotePatterns:[{protocol:"https",hostname:"s4.anilist.co"}, {protocol:"https",hostname:"cdn.anilist.co"}, {protocol:"https",hostname:"*.anilist.co"}, {protocol:"https",hostname:"cdn.myanimelist.net"}] }
```

`rm lib/catalogue.ts`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec playwright test tests/e2e/home.jikan.spec.ts -v` + `pnpm test:unit` + `pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx lib/watchlist.ts next.config.ts lib/catalog.ts lib/jikan.ts
git rm lib/catalogue.ts
git commit -m "feat: wire home/watchlist to jikan fallback catalog"
```

---

## Self-Review

- Spec coverage: DataSource + breaker → Task1, JikanAdapter → Task2, Catalog fallback → Task3, Prisma enxuto → Task4, Wire + delete catalogue → Task5 — todos os itens da Seção 2-4 cobertos.
- Placeholder scan: nenhum TODO/TBD; todos os passos têm código concreto.
- Type consistency: `Seed` com `anilistId/title/cover/episodeCount` usado em Task2,3,5; `Season` de `datasource.ts` reutilizado; `listWatchEntries` sem `watchedAt/season` após Task4.

