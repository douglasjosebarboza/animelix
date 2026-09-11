"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { catalog } from "@/lib/catalog";
import { prisma } from "@/lib/prisma";

async function ensureAnime(anilistId: number) {
  const seed = await catalog.getById(anilistId);
  return prisma.anime.upsert({
    where: { anilistId: seed.anilistId },
    create: { anilistId: seed.anilistId, title: seed.title, coverImageUrl: seed.coverImageUrl, episodeCount: seed.episodeCount },
    update: { title: seed.title, coverImageUrl: seed.coverImageUrl, episodeCount: seed.episodeCount },
  });
}

export async function addAnimeAction(formData: FormData): Promise<void> {
  const anilistId = Number(formData.get("anilistId"));
  if (!Number.isFinite(anilistId)) {
    throw new Error("anilistId inválido");
  }
  // Ensures the Anime snapshot exists locally (creates it if missing).
  await ensureAnime(anilistId);
  redirect(`/anime/${anilistId}`);
}

export async function refreshAnimeAction(formData: FormData): Promise<void> {
  const anilistId = Number(formData.get("anilistId"));
  if (!Number.isFinite(anilistId)) {
    throw new Error("anilistId inválido");
  }
  await ensureAnime(anilistId);
  revalidatePath(`/anime/${anilistId}`);
}
