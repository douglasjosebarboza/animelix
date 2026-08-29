# Progresso Animelix — continuidade de sessão

> Arquivo de apoio para retomar o trabalho. Pode ser apagado quando não for mais
> útil. Não está commitado (untracked).

## Onde paramos (28/08/2026, fim de sessão)

Tickets GitHub (`douglasjosebarboza/animelix`):
- **#1** — Spec MVP (fechado, base).
- **#2** — Bootstrap Next.js + Prisma + Auth.js no Neon. **FECHADO** (commits `f8ecb0e`, `36eec52`).
- **#3** — AniList client + cache local TTL 24h. **FECHADO** (commits `bd5ac41`, `1aa4bcf`).
- **#4** — WatchEntry + EpisodeWatch + add-to-watchlist + undo + status padrão `plan_to_watch`. **FECHADO** (commit `bca9118`).
- **#5** — Engine WatchStatus (auto completed / auto paused 30d) + StatusTransition audit trail. **FECHADO** (commit `30504b3`).
- **#6** — Activity feed + auto-pause job + opt-out por entry. **FECHADO** (commit `65f0c8d`).
- **#7** — Hardening: dedup + privacidade (404 cross-user) + account deletion + logs. **FECHADO** (commit `96c04aa`).

**MVP completo: tickets #1–#7 fechados.** Próximo passo seria release/preparação (deploy, env de prod, README) — não há ticket aberto.

## Mudança de modelo (28/08/2026) — EpisodeWatch = conjunto de assistidos
- `EpisodeWatch` deixou de ser log de visualização (re-watch permitido) e virou
  membership no conjunto de episódios assistidos: `UNIQUE(watchEntryId, season, episode)`
  + migration `20260828200000_add_episode_unique` (colapsa duplicatas antes do constraint).
- `markEpisodeWatched` rejeita ep já assistido (`WatchlistError: "Episódio já assistido"`).
- `undoLastEpisodeWatch` substituído por `removeEpisodeWatch(watchEntryId, season, episode)`;
  botão "Undo last" removido da UI; cada ep assistido tem botão "remover" próprio.
- Nova action de engine `removeEpisode` em `lib/watchstatus.ts`: `completed` → `watching`
  (reason `user_status_change`) quando fica incompleto; demais status inalterados.
- Remover o último ep **apaga a WatchEntry** (idêntico ao comportamento anterior do undo).
- ADR `docs/adr/0004-episodewatch-watched-set.md`. `CONTEXT.md` atualizado (EpisodeWatch).
- `distinctCount` == rowCount agora (sem re-watch). Testes: +5 unit (60; o caso "re-watch" era redundante com "not all watched" e foi removido), build verde, e2e 12.

## Code review (#8) — correções aplicadas (29/08/2026)
- `prisma/schema.prisma`: removido `@@index([watchEntryId, season, episode])` redundante
  (o unique já cria índice único); migration `20260829035910_drop_episodewatch_redundant_index`.
- `lib/watchlist.ts`: extraído `findEpisodeWatch(watches, season, episode)` (usado no guard de
  mark e no find de remove); `removeEpisodeWatch` calcula o estado pós-remoção em memória
  (sem refetch do `after`).
- `lib/watchlist-actions.ts`: `markEpisodeAction` captura `WatchlistError` e redireciona para
  `/watchlist/{id}?error=...` (Story 5: erro amigável "Episódio já assistido" em vez de erro
  não tratado de server action).
- `app/watchlist/[animeId]/page.tsx`: lê `searchParams.error` e mostra banner de erro.
- Validação final: unit 60 (removido teste redundante de re-watch), build verde, e2e 12. Committed.

Dependências nativas de issue NÃO funcionam no Free plan do GitHub (422) — blockers estão como texto no body.

## Commits recentes (branch `main`)
- `96c04aa` feat(#7): hardening — dedup, user scoping/404, account deletion, structured logs
- `65f0c8d` feat(#6): activity feed + daily auto-pause job + per-entry opt-out
- `3c63016` fix(#5): undo last episode removes entry; paused resumes to watching on mark
- `30504b3` feat(#5): WatchStatus engine + StatusTransition audit trail
- `bca9118` feat(#4): WatchEntry CRUD + EpisodeWatch marking + undo
- `1aa4bcf` fix(#3): remove invalid `seasons` field from AniList queries
- `bd5ac41` feat(#3): AniList client + local Anime cache with 24h TTL
- `36eec52` refactor(#2): extract shared credential parsing; scope .env.example
- `f8ecb0e` feat(#2): bootstrap Next.js + Prisma + Auth.js on Neon
- `96a055d` docs: spec, glossary, and ADRs for Animelix MVP

## Como retomar (28/08/2026, fim de #5)
1. `cd /home/silent/projects/animelix`
2. `export PATH="/home/silent/.local/npm-global/bin:$PATH"`  (pnpm mora fora do PATH padrão)
3. `set -a; source .env.local; set +a`  (DATABASE_URL + NEXTAUTH_SECRET já estão lá)
4. `pnpm test:unit` (55 verdes), `pnpm build` (verde) e `pnpm test:e2e` (11 verdes) pra confirmar baseline.
5. MVP (#1–#7) concluído. Próximo: deploy/preparação de release (ver seção "MVP — status").

## Fatos de ambiente (importantes)
- **pnpm**: `pnpm@11.24.0` em `/home/silent/.local/npm-global/bin`. Corepack não disponível; instalado via `npm i -g pnpm`. PATH precisou ser persistido no `~/.bashrc`.
- **Neon Postgres**: `ep-plain-king-ac97fhxn` (sa-east-1). `.env.local` tem `DATABASE_URL` (pooled) e `DATABASE_URL_UNPOOLED`. `prisma migrate` precisa usar a URL unpooled.
- **Versões fixadas de propósito**: Prisma **6.19.3** (v7 quebrou `url` no schema + força adapter), `@prisma/client` 6.19.3, `next-auth@5.0.0-beta.32` (v5 necessário p/ App Router; latest tag ainda é v4).
- **Arch WSL2**: `playwright install-deps` **não funciona** (só apt/brew/apk). Chromium precisa de `sudo pacman -S --needed nspr nss atk at-spi2-atk at-spi2-core libx11 libxcomposite libxdamage libxext libxfixes libxrandr mesa libxcb libxkbcommon alsa-lib libxshmfence gtk3 pango`. Depois `pnpm test:e2e` roda (o browser já está baixado em `~/.cache/ms-playwright`).
- O sandbox da sessão É a mesma máquina do usuário (WSL Arch, user `silent`). Após o `pacman` acima ter sido rodado, o `pnpm test:e2e` **roda daqui** (5 testes verdes em ~10s, confirmado em 28/08). Não precisa mais delegar o e2e ao usuário. Unit + build + e2e rodam neste ambiente.

## Decisões/caveats descobertos
- **AniList não tem campo `seasons`** no tipo Media (só `season`/`seasonYear`). Query com `seasons` dava 400. Removido; `Anime.seasonCount` fica **null** até decidirmos derivar número de temporadas.
- `lib/actions.ts` é `"use server"` → toda função exportada vira Server Action (precisa ser async). Por isso o helper `parseCredentials` foi para `lib/credentials.ts` (sem a diretiva).
- `params`/`searchParams` em Next 16 são **Promises** (await necessário nas pages).
- Cache do catálogo (`lib/catalogue.ts`): `getAnime` retorna cache imediato; se `snapshotAt` > 24h dispara refresh em background (fire-and-forget) e nunca falha a leitura. `refreshAnime` sobrescreve. Dedup in-flight no client (`lib/anilist.ts`) atende o rate limit 90/min.

## #7 — feito (28/08/2026)
- `lib/logger.ts`: `logEvent(event, data)` → `console.log(JSON.stringify({ts, event, ...}))`. Instrumentado em: `anilist_cache` (hit/stale), `anilist_refresh` (manual/stale), `anilist_error` (network/status/errors), `auto_pause` por entry, `auto_pause_job` (evaluated/paused), `account_deleted`.
- Dedup de refresh: `lib/anilist.ts` já tinha `inflight` map; teste sobe p/ 10 leituras concorrentes → exatamente 1 chamada à AniList (spy em `fetch` + contador no stub HTTP). Rate-limit 90/min não é estourado (o job de auto-pause não toca AniList).
- Privacidade por construção: todas as rotas de watchlist/EpisodeWatch/feed filtram por `userId`; a página de entry (`/watchlist/[animeId]`) retorna `notFound()` (404) quando o entry não pertence ao user (não 403, não vaza existência). `requireUser()` em `auth.ts` redireciona p/ /login se o user não existir mais — invalida JWT de conta deletada nas rotas protegidas.
- Deleção em cascata: `lib/account.ts` → `prisma.user.delete` (cascata WatchEntry → EpisodeWatch + StatusTransition via `onDelete: Cascade` no schema). Idempotente (P2025 swallow). Server Action `deleteAccountAction` + `DELETE /api/account`. Botão "Excluir conta" em `/watchlist`.
- Cobertura: `tests/unit/account.test.ts` (deleção idempotente + escopo por userId), `tests/unit/anilist.test.ts` (dedup 10→1), `tests/e2e/account.spec.ts` (cross-user 404 + deletar conta desloga).

## MVP — status
- Tickets #1–#7 **todos fechados**. Funcionalidades: auth (credenciais), catálogo AniList com TTL 24h, watchlist com episódios, engine de WatchStatus (auto completed / auto paused / manual), activity feed, auto-pause job + opt-out, hardening (dedup, privacidade, deleção de conta, logs).
- Testes: 61 unitários, 11 e2e (auth, watchlist, activity, account). Build verde.
- Próximo possível: deploy (Vercel/Neon prod), variáveis de ambiente de produção, README de operação, agendador do job de auto-pause (cron). Nenhum ticket aberto no repo.
- `/activity` page: feed privado de `StatusTransition` do User (newest first), com cover + from→to + reason humanizado (pt-BR) + tempo relativo (`Intl.RelativeTimeFormat`).
- `lib/autopause.ts`: `shouldAutoPause({status, lastWatchedAt, autoPauseEnabled, now, thresholdDays})` pura e clock-injetável; `runAutoPauseJob(now?)` varre `watching`/`plan_to_watch` com eps e `autoPauseEnabled=true` há > threshold dias e aplica `watching→paused` (reason `auto_paused`). Idempotente: após a transição o status vira `paused`, então rodadas seguintes não re-pausam.
- `POST /api/auto-pause`: dispara o job (exige sessão; 401 sem auth).
- Toggle `autoPauseEnabled` na página do anime (`setAutoPauseAction`), default true; opt-out suprime a auto-pause só daquela entry.
- `AUTOPAUSE_DAYS` (env, default 30) configura o limite.
- Read-time auto-pause em `getWatchEntry` reaproveita a mesma regra (`evaluateAutoPause`).
- Cobertura: `tests/unit/autopause.test.ts` (regra/opt-out/idempotência) + `tests/e2e/activity.spec.ts` (job popula feed + privacidade).

## #5 — feito (28/08/2026)
- Engine pura em `lib/watchstatus.ts` (`computeNextStatus(current, action)`; actions: `markEpisode`, `timeTick`, `setStatus`). Nenhuma dependência de Prisma — 100% testável.
- `StatusTransition` model criado + migração `20260828172257_add_status_transition` (fromStatus, toStatus, reason, occurredAt, índice por watchEntryId).
- Reasons emitidos: `user_status_change` (manual / 1º mark), `auto_completed` (distinct==cached total), `auto_paused` (timeTick >30d com opt-out off), `user_dropped` (manual drop). Engine **nunca** emite `dropped` por markEpisode/timeTick.
- `markEpisodeWatched` aplica a transição (transaction: update status + insert StatusTransition). `setWatchStatus`/`setWatchStatusAction` para override manual. Auto-pause avaliado em `getWatchEntry` (silently) respeitando `autoPauseEnabled`.
- UI em `/watchlist/[animeId]/page.tsx`: mostra `entry.status` e botões de status manual. Cobertura: `tests/unit/watchstatus.test.ts` (exaustiva) + `tests/e2e/watchlist.spec.ts` (transição auto + override dropped).
- Ajuste pós-#5: `undoLastEpisodeWatch` **apaga a WatchEntry** quando não resta nenhum episódio (anime sai da watchlist). Engine: `paused` + novo `markEpisode` → `watching` (ou `completed` se a série completar). Commit `3c63016`.
