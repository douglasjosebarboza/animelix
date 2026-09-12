import { PrismaClient } from "@prisma/client";
import { resolveToAnilistId } from "./lib/identity";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function cleanup() {
  console.log("Iniciando limpeza de duplicatas na watchlist...");
  
  const allAnime = await prisma.anime.findMany();
  const idMap = new Map<number, string>(); // anilistId -> animeId (internal)

  for (const anime of allAnime) {
    const aid = anime.anilistId;
    if (idMap.has(aid)) {
      const originalId = idMap.get(aid)!;
      const duplicateId = anime.id;

      if (originalId === duplicateId) continue;

      console.log(`Unificando duplicata: ${anime.title} (${duplicateId}) -> (${originalId})`);

      // 1. Move episode watches from duplicate to original
      const watches = await prisma.episodeWatch.findMany({
        where: { watchEntry: { animeId: duplicateId } }
      });

      for (const watch of watches) {
        const entry = await prisma.watchEntry.findFirst({
          where: { userId: watch.watchEntry.userId, animeId: originalId }
        });

        if (entry) {
          try {
            await prisma.episodeWatch.create({
              data: { 
                watchEntryId: entry.id, 
                episode: watch.episode 
              }
            });
          } catch {
            // Ignore if episode already marked as watched
          }
        }
      }

      // 2. Delete the duplicate anime entry
      await prisma.anime.delete({ where: { id: duplicateId } });
      console.log(`Removido duplicado: ${duplicateId}`);
    } else {
      idMap.set(aid, anime.id);
    }
  }
  
  console.log("Limpeza concluída.");
}

cleanup().catch(console.error).finally(() => prisma.$disconnect());
