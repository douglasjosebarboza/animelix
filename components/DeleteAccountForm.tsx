"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction, type AccountActionResult } from "@/lib/watchlist-actions";

/**
 * Exclusão de conta com confirmação de senha.
 *
 * A exclusão é irreversível, então exigimos a senha atual antes de apagar
 * qualquer coisa. Sem isso, basta sequestrar a sessão (ou explorar um XSS)
 * para apagar a conta da vítima.
 */
export function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    AccountActionResult,
    FormData
  >(deleteAccountAction, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-md border border-red-800 px-3 py-2 text-base text-red-300 hover:bg-red-950"
      >
        Excluir Conta
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        type="password"
        name="password"
        placeholder="Sua senha"
        autoComplete="current-password"
        required
        className="rounded-md border border-border bg-surface-2 px-3 py-2 text-base outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-md border border-red-800 px-3 py-2 text-base text-red-300 hover:bg-red-950 disabled:opacity-50"
      >
        {pending ? "Excluindo..." : "Confirmar exclusão"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="cursor-pointer rounded-md border border-border px-3 py-2 text-base text-muted hover:bg-muted"
      >
        Cancelar
      </button>
      {state.error ? (
        <p className="w-full text-sm text-red-300">{state.error}</p>
      ) : null}
    </form>
  );
}
