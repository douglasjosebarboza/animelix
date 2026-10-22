# Deploy no Vercel

Checklist para expor o Animelix na internet com segurança.

Plano de referência: **Vercel Hobby**, domínio `*.vercel.app`, migrations
aplicadas manualmente antes do *promote*.

---

## 1. Por que o repo precisa estar assim

Quatro coisas quebram o build na Vercel se não forem feitas (todas já aplicadas
neste repo):

| Item | Motivo |
|---|---|
| `.nvmrc` = `22` | A Vercel só oferece Node 24.x/22.x (Node 20 saiu da lista) e o `pnpm@11` exige Node ≥ 22.13 |
| `engines.node` = `22.x` | Garante a versão do Node independentemente do setting do dashboard |
| `build` = `prisma generate && next build` | A Vercel usa o script `build` do `package.json`; o client Prisma é gerado de forma determinística |
| `directUrl` no `schema.prisma` | O `DATABASE_URL` aponta para o **pooler** (PgBouncer) do Neon, que não suporta o advisory lock do `migrate deploy`. O `directUrl` faz as migrations usarem a conexão direta |
| `vercel.json` → `regions: ["sa-east-1"]` | Default da Vercel é `iad1` (Washington, ~160ms do Neon). O Neon deste projeto fica em São Paulo |

## 2. Dependências

```bash
pnpm install
pnpm audit --prod      # esperado: "No known vulnerabilities found"
pnpm build
pnpm test:unit
```

O `next` precisa estar em `>= 16.3.8` (corrige RCE em `next/og`, SSRF no Image
Optimization, cache poisoning em SSG/ISR e os advisories de `sharp` /
`source-map-js`). O `source-map-js` é fixado via `overrides` no
`pnpm-workspace.yaml`.

## 3. Variáveis de ambiente

Configure no Vercel (Settings → Environment Variables) e **nunca** no
repositório:

| Variável | Valor | Ambientes |
|---|---|---|
| `DATABASE_URL` | endpoint **com pooler** do Neon + `&pgbouncer=true&connection_limit=1` | Production + Preview |
| `DATABASE_URL_UNPOOLED` | endpoint **direto** do Neon | Production + Preview |
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | Production + Preview |
| `AUTH_URL` | `https://<projeto>.vercel.app` | **só Production** |
| `AUTH_TRUST_HOST` | `true` | Production + Preview |
| `UPSTASH_REDIS_REST_URL` | `https://….upstash.io` | Production + Preview |
| `UPSTASH_REDIS_REST_TOKEN` | token do Upstash | Production + Preview |
| `ANILIST_GRAPHQL_URL` | `https://graphql.anilist.co` | opcional |

Notas:

- `AUTH_SECRET` ausente → o Auth.js lança `MissingSecretError` **em runtime**
  (o build passa sem ele). `NEXTAUTH_SECRET`/`NEXTAUTH_URL` também funcionam,
  mas `AUTH_SECRET`/`AUTH_URL` são os nomes canônicos.
- `AUTH_URL` **só em Production**: a URL de preview muda a cada deploy. Com
  `AUTH_TRUST_HOST=true` o Auth.js infere o host do request.
- `DATABASE_URL_UNPOOLED` é **obrigatória no build**: com o `directUrl` no
  schema, o `prisma generate` falha se a variável não existir.
- `pgbouncer=true&connection_limit=1` faz cada instância de serverless abrir
  **1** conexão (o pool padrão do Prisma é `num_cpus*2+1` e esgotaria o pooler
  do Neon com várias lambdas).
- `UPSTASH_REDIS_*` é o que torna o rate limit **distribuído**. Sem elas o
  limite vale por instância de lambda (multiplicado pelo número de instâncias).

## 4. Banco de dados

```bash
pnpm db:deploy     # prisma migrate deploy — usa a URL direta (directUrl)
```

Rode **antes** do *promote* de um deploy com migrations novas. O
`prisma migrate dev` NÃO deve ser usado em produção.

Fluxo a partir de agora:

1. cria a migration local (`pnpm db:migrate`) → commit → push
2. `pnpm db:deploy` na sua máquina
3. promover o build na Vercel

## 5. Settings do projeto

- **Node.js Version**: `22.x`
- **Build Command**: padrão (usa o script `build` do `package.json`)
- **Install Command**: `pnpm install` (automático)
- **Regions**: `sa-east-1` (vem do `vercel.json`)
- Opcional: `ENABLE_EXPERIMENTAL_COREPACK=1` para travar o pnpm em `11.24.0`

## 6. Checklist pós-deploy

```bash
curl -I https://<projeto>.vercel.app/          # 200 + HSTS + CSP
curl -s "https://<projeto>.vercel.app/api/search?q=naruto" | head -c 200
```

- [ ] cadastrar → login → `/watchlist` (prova `AUTH_SECRET` + `AUTH_URL`)
- [ ] errar a senha 6× → "Muitas tentativas, aguarde" (prova que o Upstash
      está ativo; **sem** ele o limite é por instância e não bloqueia)
- [ ] `/api/search` → header `X-RateLimit-Remaining` decrementando
- [ ] Vercel Logs sem `anilist_error` em rajada

## 7. O que a aplicação já garante

- **Rate limit distribuído** (Upstash), em três dimensões no login: 20 falhas
  por **e-mail** (sem o IP — resiste a ataque distribuído), 5 por **(IP, e-mail)**,
  20 por **IP**, tudo a cada 15 min. O limite vive dentro do `authorize` do
  provider Credentials, então ele também protege o endpoint HTTP direto do
  Auth.js (`POST /api/auth/callback/credentials`), que contornaria um limite
  aplicado só na server action. Registro: 5/hora por IP. Busca: 20/min por IP.
- **IP confiável**: `x-vercel-forwarded-for` → `x-real-ip` → último elemento do
  `x-forwarded-for`. O valor injetado pelo cliente não é usado.
- **Enumeração de usuários**: o login compara a senha contra um hash dummy
  quando o e-mail não existe (mesmo tempo de resposta), a mensagem de erro é
  genérica e o e-mail é normalizado (`trim` + `toLowerCase`).
- **DoS de banco**: episódios são validados contra o total real da AniList
  (`lib/watchlist.ts`), nunca contra o valor enviado pelo cliente.
- **CPU DoS**: o registro tem rate limit e bcrypt custo 12.
- **Cota da AniList** (90 req/min): buscas passam pelo cache (`unstable_cache`),
  as respostas são cacheadas pelo CDN (`Cache-Control: public, max-age=60`) e há
  um teto global de 25 buscas/min + 40 detalhes/min.
- **CSP com nonce por requisição** (`proxy.ts`), `poweredByHeader: false`,
  `Referrer-Policy`, `Permissions-Policy`, COOP/CORP e HSTS.

## 8. Limitações do plano Hobby

- **1 região** → `sa-east-1` é a única (e é a ideal para este Neon).
- **100 deploys/dia** — cada commit em `main` vira deploy.
- **Neon free tier**: o banco hiberna após ~5 min sem uso → a primeira
  requisição depois leva 1-2s (cold start). Não é bug.
- **Deployment Protection**: se a Vercel habilitar "Vercel Authentication" nos
  previews, desligue em Settings → Deployment Protection se quiser previews
  públicos.

## 9. Pendente para a Fase 2 (endurecimento restante)

- `images.remotePatterns` sem wildcard (`*.anilist.co` → hosts exatos): com a
  CSP e o `next` ≥ 16.3.8 o risco caiu, mas o wildcard ainda amplia a
  superfície do Image Optimization.
- `parsePositiveInt` no `anilistId` (hoje aceita `-1`, `1.5`, `1e3`).
- Whitelist dos códigos no parâmetro `?error=` da página do anime.
- Migração do `next-auth` (beta) para a versão GA.
