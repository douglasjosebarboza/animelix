# Design: Página do anime rica (sinopse, nomes de eps, paginação, ações em massa)

Data: 2026-09-12 | Abordagem: A (tudo via AniList) | Path: architectural

## 1. Objetivo

A página `/anime/[id]` deixa de mostrar "X de Y assistidos" + "Status" e
passa a exibir `Episódios: vistos/totais` no header, sinopse, nomes de
episódios, paginação de 12 e três ações em massa ("até aqui", marcar todos,
desmarcar todos). Desmarcar tudo apaga o entry mas permanece na página.

Decisões do usuário: desmarcar-tudo apaga o entry sem redirect (regra nova
vale também para esvaziar via toggles: fim do redirect a `/watchlist`).

## 2. Dados / AniList (verificado com probe real em 2026-09-12)

- `BY_ID_QUERY` ganha `description(asHtml: false)` e
  `streamingEpisodes { title }`. Probe no id 1 retornou sinopse e 26 títulos
  ("Episode N - Nome").
- `AnimeSeed` ganha `description: string | null` (sanitizada: remove tags
  `<br>` e demais, colapsa whitespace; `null` quando ausente) e
  `episodeTitles: (string | null)[]` (índice = episódio − 1; prefixo
  "Episode N - " removido quando o número casa; `null` por posição sem
  cobertura; array vazio quando a API não retorna nada).
- `SEARCH`/`SEASONAL` não mudam: listas recebem `description: null` e
  `episodeTitles: []` (YAGNI — só o detalhe usa).
- Degradação: sem títulos, linhas mostram "Episódio N"; sem sinopse, o
  parágrafo some (sem placeholder).

## 3. Lib (`lib/watchlist.ts`, tudo em transação, auto-add mantido)

- `markEpisodesUpTo(userId, anilistId, ep, total?)`: cria o entry
  (`watching`) se ausente; insere 1..ep pulando existentes
  (`createMany({ skipDuplicates: true })`); transição `watching→completed`
  com a mesma regra do mark simples.
- `markAllWatched(userId, anilistId, total?)`: `markEpisodesUpTo(total)`;
  com `total` null/não-finito lança `WatchlistError("total indisponível")`
  sem escrever nada.
- `clearAllWatched(userId, anilistId)`: apaga todos `episodeWatches` e
  deleta o entry; entry ausente é no-op (sem erro).
- `markEpisodeWatched` / `removeEpisodeWatch` unitários inalterados.

## 4. Página `/anime/[id]`

- Header: remove "X de Y assistidos" e "Status"; `Episódios:` vira
  `vistos/totais` (`0/26` sem entry). Sinopse em parágrafo sob o header.
- Linha de ep: `N. <nome>` (fallback "Episódio N") + toggle individual +
  botão ghost "até aqui".
- Header da lista: toggle "Marcar todos" / "Desmarcar todos" (label pelo
  estado: todos vistos ou não); escondido quando `total` é null.
- Paginação por `?epPage=` (12 por página, default 1, clamp no range;
  links Anterior/Próxima + "Página x de y"); forms carregam `epPage` hidden
  e redirects de erro o preservam (`?epPage=&error=`); `revalidatePath`
  segue só com o path (invalida todas as variações de query).
- Remover (entry) continua; sem entry não há botão Remover.

## 5. Actions e navegação

- Novas em `lib/watchlist-actions.ts`, padrão existente (`parsePositiveInt`,
  `WatchlistError → redirect ?error=`, `revalidatePath`): `markUpToAction`
  (`anilistId, season, episode, total?, epPage?`), `markAllAction`
  (`anilistId, total?, epPage?`), `clearAllAction` (`anilistId, epPage?`).
- `removeEpisodeAction` perde o branch `entryRemoved → redirect("/watchlist")`
  (sempre revalida e fica); `removeFromWatchlistAction` mantém redirect a
  `/watchlist` (sair da página continua fazendo sentido ao remover o anime).
- `lib/parse.ts` inalterado (`epPage` reusa `parsePositiveInt`).
- Banner de `?error=` existente cobre os novos casos.

## 6. Arquivos e testes

- Mexem: `lib/anilist.ts`, `lib/watchlist.ts`, `lib/watchlist-actions.ts`,
  `app/anime/[anilistId]/page.tsx`, e2e (até-aqui, marcar-tudo,
  desmarcar-tudo, paginação).
- Testes (TDD): sanitize da description; mapeamento posicional com cobertura
  parcial/ausente; `markEpisodesUpTo` pula existentes; `markAll` com total
  null falha sem escrever; `clearAll` apaga entry e é no-op sem entry.
- Verificação: suite + tsc + smoke no dev server.

## 7. Fora de escopo

Links/thumbnails externos dos streamingEpisodes; filtro por gênero;
`season` real (segue fixo 1); mudar TTL do cache; e2e do fluxo antigo
`/watchlist/[id]` (rota apagada).
