"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { requireUser, signOut } from "@/auth";
import { deleteAccount } from "@/lib/account";
import {
  removeFromWatchlist,
  markEpisodeWatched,
  removeEpisodeWatch,
  markEpisodesUpTo,
  markAllWatched,
  clearAllWatched,
  WatchlistError,
} from "@/lib/watchlist";
import { parsePositiveInt } from "@/lib/parse";
import { hitRateLimit } from "@/lib/rateLimit";

export type AccountActionResult = { error?: string };

export async function removeFromWatchlistAction(formData: FormData): Promise<void> {
  const { id: userId } = await requireUser();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  await removeFromWatchlist(userId, anilistId);
  redirect("/watchlist");
}

export async function markEpisodeAction(formData: FormData): Promise<void> {
  const { id: userId } = await requireUser();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const episode = parsePositiveInt(formData.get("episode"));
  const epPage = parsePositiveInt(formData.get("epPage"));
  if (episode == null) redirect(`/anime/${anilistId}`);
  try {
    await markEpisodeWatched(userId, anilistId, episode);
  } catch (err) {
    if (err instanceof WatchlistError) {
      redirect(animeUrl(anilistId, epPage, (err as Error).message));
    }
    throw err;
  }
  revalidatePath(`/anime/${anilistId}`);
}

export async function removeEpisodeAction(formData: FormData): Promise<void> {
  const { id: userId } = await requireUser();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const episode = parsePositiveInt(formData.get("episode"));
  const epPage = parsePositiveInt(formData.get("epPage"));
  if (episode == null) redirect(`/anime/${anilistId}`);
  try {
    await removeEpisodeWatch(userId, anilistId, episode);
  } catch (err) {
    if (err instanceof WatchlistError) {
      redirect(animeUrl(anilistId, epPage, (err as Error).message));
    }
    throw err;
  }
  revalidatePath(`/anime/${anilistId}`);
}

function animeUrl(anilistId: number, epPage: number | null, error?: string): string {
  const params = new URLSearchParams();
  if (epPage != null && epPage > 1) params.set("epPage", String(epPage));
  if (error) params.set("error", error);
  const qs = params.toString();
  return qs ? `/anime/${anilistId}?${qs}` : `/anime/${anilistId}`;
}

export async function markUpToAction(formData: FormData): Promise<void> {
  const { id: userId } = await requireUser();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const episode = parsePositiveInt(formData.get("episode"));
  const epPage = parsePositiveInt(formData.get("epPage"));
  if (episode == null) redirect(animeUrl(anilistId, epPage));
  try {
    await markEpisodesUpTo(userId, anilistId, episode);
  } catch (err) {
    if (err instanceof WatchlistError) {
      redirect(animeUrl(anilistId, epPage, (err as Error).message));
    }
    throw err;
  }
  revalidatePath(`/anime/${anilistId}`);
}

export async function markAllAction(formData: FormData): Promise<void> {
  const { id: userId } = await requireUser();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const epPage = parsePositiveInt(formData.get("epPage"));
  try {
    await markAllWatched(userId, anilistId);
  } catch (err) {
    if (err instanceof WatchlistError) {
      redirect(animeUrl(anilistId, epPage, (err as Error).message));
    }
    throw err;
  }
  revalidatePath(`/anime/${anilistId}`);
}

export async function clearAllAction(formData: FormData): Promise<void> {
  const { id: userId } = await requireUser();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  await clearAllWatched(userId, anilistId);
  revalidatePath(`/anime/${anilistId}`);
}

/**
 * Exclusão de conta.
 *
 * Exige a senha atual: sem isso, uma sessão sequestrada (ou um XSS) apaga a
 * conta em definitivo, sem volta. A exclusão é irreversível — por isso o
 * custo de ter que provar quem você é.
 *
 * A cota de tentativas também é consumida aqui: um atacante que/testa senhas
 * contra a action não pode ficar testando indefinidamente.
 */
export async function deleteAccountAction(
  _prev: AccountActionResult,
  formData: FormData,
): Promise<AccountActionResult> {
  const user = await requireUser();

  const rawPassword = formData.get("password");
  const password = typeof rawPassword === "string" ? rawPassword : "";
  if (!password) {
    return { error: "Informe sua senha para confirmar a exclusão" };
  }
  if (password.length > 72) {
    return { error: "Senha incorreta" };
  }

  // Cota própria: um atacante que teste senhas contra esta action não pode
  // ficar testando indefinidamente (cada tentativa custa um bcrypt).
  const limit = await hitRateLimit(
    `delete-account:${user.id}`,
    5,
    15 * 60_000,
  );
  if (!limit.ok) {
    return { error: "Muitas tentativas, aguarde" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return { error: "Senha incorreta" };
  }

  await deleteAccount(user.id);
  await signOut({ redirectTo: "/login" });
  return {};
}
