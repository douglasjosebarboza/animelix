"use server";

import { revalidatePath, revalidateTag } from "next/cache";

export async function refreshAnimeAction(formData: FormData): Promise<void> {
  const anilistId = Number(formData.get("anilistId"));
  if (!Number.isFinite(anilistId)) {
    throw new Error("anilistId inválido");
  }
  revalidateTag(`anime:${anilistId}`, { expire: 0 });
  revalidateTag("anime-seasonal", { expire: 0 });
  revalidatePath(`/anime/${anilistId}`);
}
