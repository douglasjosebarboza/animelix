"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthResult } from "@/lib/actions";

type Props = {
  mode: "login" | "register";
  action: (prev: AuthResult, formData: FormData) => Promise<AuthResult>;
};

export function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const isLogin = mode === "login";

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-100">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-800 bg-neutral-900 p-8"
      >
        <h1 className="text-xl font-semibold">
          {isLogin ? "Entrar no Animelix" : "Criar conta no Animelix"}
        </h1>

        <label className="block space-y-1">
          <span className="text-sm text-neutral-400">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-neutral-400">Senha</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </label>

        {state.error ? (
          <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "Aguarde..." : isLogin ? "Entrar" : "Cadastrar"}
        </button>

        <p className="text-center text-sm text-neutral-400">
          {isLogin ? (
            <>
              Não tem conta?{" "}
              <Link href="/register" className="text-indigo-400 hover:underline">
                Cadastre-se
              </Link>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <Link href="/login" className="text-indigo-400 hover:underline">
                Entrar
              </Link>
            </>
          )}
        </p>
      </form>
    </main>
  );
}
