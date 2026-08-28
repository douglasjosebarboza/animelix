"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAnime, refreshAnime } from "@/lib/catalogue";

export async function addAnimeAction(formData: FormData): Promise<void> {
  const anilistId = Number(formData.get("anilistId"));
  if (!Number.isFinite(anilistId)) {
    throw new Error("anilistId inválido");
  }
  // Ensures the Anime snapshot exists locally (creates it if missing).
  await getAnime(anilistId);
  redirect(`/anime/${anilistId}`);
}

export async function refreshAnimeAction(formData: FormData): Promise<void> {
  const anilistId = Number(formData.get("anilistId"));
  if (!Number.isFinite(anilistId)) {
    throw new Error("anilistId inválido");
  }
  await refreshAnime(anilistId);
  revalidatePath(`/anime/${anilistId}`);
}
