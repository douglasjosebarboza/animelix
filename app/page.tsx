import Image from "next/image";
import { headers } from "next/headers";
import { searchCachedAnime, getCachedSeasonalAnime } from "@/lib/anime-cache";
import { currentSeason } from "@/lib/anilist";
import { logEvent } from "@/lib/logger";
import { hitRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/ip";
import { getLimits } from "@/lib/limits";

/** Tamanho máximo da query — evita payloads absurdos enviados à AniList. */
const MAX_QUERY_LENGTH = 100;
const MIN_QUERY_LENGTH = 2;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const rawQuery = (q ?? "").trim();
  const queryTooLong = rawQuery.length > MAX_QUERY_LENGTH;
  const queryTooShort = rawQuery.length > 0 && rawQuery.length < MIN_QUERY_LENGTH;
  const query = queryTooLong || queryTooShort ? "" : rawQuery;

  let results: Awaited<ReturnType<typeof searchCachedAnime>> = [];
  let error: string | null = null;

  try {
    if (queryTooLong) {
      error = `Busca muito longa (máximo de ${MAX_QUERY_LENGTH} caracteres).`;
    } else if (queryTooShort) {
      error = `Digite ao menos ${MIN_QUERY_LENGTH} caracteres para buscar.`;
    } else if (query) {
      const limits = getLimits();
      const ip = getClientIp(await headers());
      const rl = await hitRateLimit(`search:${ip}`, limits.searchPerIp, limits.searchWindowMs);
      if (!rl.ok) {
        error = "Muitas buscas em sequência. Aguarde um instante e tente novamente.";
      } else {
        results = await searchCachedAnime(query);
      }
    } else {
      const { season, year } = currentSeason();
      results = await getCachedSeasonalAnime(season, year);
    }
  } catch (err) {
    // A mensagem do erro vai para o log, não para a tela: ela carrega
    // detalhes da AniList e da infraestrutura (ex.: "Falha de rede ao chamar
    // AniList: fetch failed") que não devem ser expostos.
    logEvent("catalog_error", {
      scope: query ? "search" : "seasonal",
      message: (err as Error).message,
    });
    error = query
      ? "Não foi possível buscar agora. Tente novamente em instantes."
      : "Não foi possível carregar a temporada agora. Tente novamente em instantes.";
  }

  return (
    <main className="flex-1 bg-background p-8 text-foreground">
      <div className="mx-auto max-w-6xl">
        {error && (
          <p className="mt-4 rounded-md border border-amber-700 bg-amber-950 p-3 text-base text-amber-300">
            {error}
          </p>
        )}

        <ul className="mt-4 grid min-h-4 grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {results.map((anime, idx) => (
            <li
              key={anime.anilistId ?? idx}
              className="group overflow-hidden rounded-2xl border border-border bg-surface transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-accent/20"
            >
              <a
                href={`/anime/${anime.anilistId}`}
                className="block cursor-pointer"
              >
              {anime.coverImageUrl && (
                <Image
                  src={anime.coverImageUrl}
                  alt={anime.title}
                  width={460}
                  height={690}
                  sizes="(max-width:640px) 50vw, 25vw"
                  className="aspect-2/3 w-full object-cover"
                  loading="eager"
                />
              )}
              <div className="p-3">
                <p className="line-clamp-2 text-base font-medium text-foreground">
                  {anime.title}
                </p>
                <p className="mt-1 text-sm text-accent">
                  {`${anime.episodeCount ?? "?"} eps`}
                </p>
              </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
