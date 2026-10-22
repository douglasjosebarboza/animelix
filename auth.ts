import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  RateLimitError,
  verifyCredentials,
} from "@/lib/verify-credentials";

/**
 * Erro de cota esgotada.
 *
 * `CredentialsSignin` com `code` próprio: o Auth.js redireciona para
 * `/login?error=CredentialsSignin&code=rate_limited`, e a action distingue
 * "senha errada" de "cota esgotada" sem revelar se o e-mail existe.
 */
export class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    session: ({ session, token }) => {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      /**
       * ÚNICO ponto onde a senha é comparada — e, portanto, o único ponto
       * onde o rate limit precisa estar.
       *
       * O rate limit NÃO pode viver na server action: o `authorize` também é
       * chamado direto pelo handler HTTP do Auth.js, via
       * `POST /api/auth/callback/credentials`. Um atacante que pegue o
       * `csrfToken` em `GET /api/auth/csrf` e poste direto nesse endpoint
       * contornaria qualquer verificação feita na action — e ficaria com
       * brute force ilimitado.
       */
      authorize: async (raw, request) => {
        try {
          return await verifyCredentials(raw, request);
        } catch (err) {
          if (err instanceof RateLimitError) {
            throw new RateLimitedSignin();
          }
          throw err;
        }
      },
    }),
  ],
});

// Guards a protected route. Because Auth.js uses a stateless JWT, a deleted
// account keeps a valid-looking token until sign-out — so we also verify the
// user row still exists and redirect to /login otherwise, effectively
// invalidating stale sessions.
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");
  return user;
}
