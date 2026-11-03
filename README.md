# Animelix

**Animelix** é um tracker de watchlist de anime: descubra os animes da
temporada, salve títulos na sua lista e marque episódios assistidos no seu
ritmo.

![Home do Animelix no tema escuro. No topo, o logo Animelix em gradiente roxo, o campo de busca "Buscar anime…" com o botão Buscar em rosa, os botões Entrar e Registrar e o botão de alternar tema claro/escuro. Abaixo, um grid de oito cards de animes da temporada, cada um com o pôster da obra, o título e o número de episódios em roxo — como "The Apothecary Diaries Season 3" com 12 eps.](image.png)

## O que você pode fazer

- **Descobrir o que assistir** — a home já abre com os animes da temporada atual, sem precisar buscar nada
- **Buscar qualquer título** — pesquisa no catálogo da [AniList](https://anilist.co) com resultados instantâneos
- **Montar sua watchlist** — salve animes para acompanhar, marcados como "assistindo" ou "concluído"
- **Marcar episódios** — registre cada episódio visto individualmente; ao completar a série, o anime passa para "concluído" sozinho
- **Sua conta** — login próprio, sua watchlist é privada e você pode excluir a conta (e todos os seus dados) quando quiser
- **Conforto visual** — tema claro/escuro, interface em português e proteções silenciosas contra uso abusivo

## Stack

| Camada             | Tecnologia                           |
| ------------------ | ------------------------------------ |
| Framework          | Next.js 16 (App Router) + React 19   |
| Estilo             | Tailwind CSS 4                       |
| Banco              | PostgreSQL (Neon) via Prisma 6       |
| Auth               | NextAuth v5 (credentials) + bcryptjs |
| Rate limit / cache | Upstash Redis (REST)                 |
| Catálogo           | AniList GraphQL (fallback: Jikan)    |
| Validação          | Zod 4                                |
| Testes             | Vitest (unit) + Playwright (e2e)     |

## Como rodar localmente

Requisitos: **Node 22** (ver `.nvmrc`) e **pnpm**.

```bash
pnpm install
cp .env.example .env.local   # preencha as variáveis (ver abaixo)
pnpm db:migrate              # aplica as migrations do Prisma
pnpm dev                     # abre em http://localhost:3000
```

Variáveis principais (detalhes e contexto no `.env.example`):

| Variável                            | Para quê                                                      |
| ----------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`                      | Postgres do app (endpoint **com pooler** no Neon)             |
| `DATABASE_URL_UNPOOLED`             | Conexão direta usada pelas migrations (`directUrl` do schema) |
| `AUTH_SECRET` / `AUTH_URL`          | Sessão do Auth.js                                             |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Rate limiting distribuído + cache de fallback                 |
| `ANILIST_GRAPHQL_URL`               | Opcional; default é a API pública da AniList                  |

## Scripts

| Comando            | O que faz                          |
| ------------------ | ---------------------------------- |
| `pnpm dev`         | Servidor de desenvolvimento        |
| `pnpm build`       | `prisma generate && next build`    |
| `pnpm lint`        | ESLint                             |
| `pnpm test`        | Unit + e2e                         |
| `pnpm test:unit`   | Vitest (`tests/unit/`)             |
| `pnpm test:e2e`    | Playwright (`tests/e2e/`)          |
| `pnpm test:e2e:ui` | Playwright no modo UI              |
| `pnpm db:migrate`  | `prisma migrate dev`               |
| `pnpm db:deploy`   | `prisma migrate deploy` (produção) |
| `pnpm db:studio`   | Prisma Studio                      |

## Arquitetura em uma passada

1. **Request** entra por Server Components (`app/`) — a home busca a query (`?q=`)
   ou traz os animes da temporada.
2. **Rate limit** por IP (`lib/ip.ts` → `lib/rateLimit.ts`, Redis distribuído) antes
   de qualquer chamada externa; limites configuráveis em `lib/limits.ts`.
3. **Cache** (`lib/anime-cache.ts`) resolve do Redis antes de bater na AniList.
4. **Persistência** de watchlist e progresso via Server Actions sobre Prisma
   (`lib/watchlist-actions.ts`, `lib/actions.ts`).
5. **Segurança**: brute force de login limitado por e-mail/IP
   (`lib/verify-credentials.ts`), erros externos nunca aparecem na tela
   (`lib/logger.ts`).
