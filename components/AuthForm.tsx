"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthResult } from "@/lib/credentials";

type Props = {
  mode: "login" | "register";
  action: (prev: AuthResult, formData: FormData) => Promise<AuthResult>;
};

export function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const isLogin = mode === "login";

  return (
    <main className="flex flex-1 items-center justify-center bg-background p-8 text-foreground">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-8 shadow-xl shadow-accent/10"
      >
        <h1 className="text-2xl font-semibold">
          {isLogin ? "Entrar no Animelix" : "Criar conta no Animelix"}
        </h1>

        <label className="cursor-pointer block space-y-1">
          <span className="text-base text-muted">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base outline-none focus:border-accent"
          />
        </label>

        <label className="cursor-pointer block space-y-1">
          <span className="text-base text-muted">Senha</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base outline-none focus:border-accent"
          />
        </label>

        {state.error ? (
          <p className="rounded-md bg-red-950 px-3 py-2 text-base text-red-300">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="btn-anime w-full cursor-pointer rounded-md px-3 py-2 text-base font-medium disabled:opacity-50"
        >
          {pending ? "Aguarde..." : isLogin ? "Entrar" : "Cadastrar"}
        </button>

        <p className="text-center text-base text-muted">
          {isLogin ? (
            <>
              Não tem conta?{" "}
              <Link
                href="/register"
                className="cursor-pointer text-accent hover:underline"
              >
                Cadastre-se
              </Link>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <Link
                href="/login"
                className="cursor-pointer text-accent hover:underline"
              >
                Entrar
              </Link>
            </>
          )}
        </p>
      </form>
    </main>
  );
}
