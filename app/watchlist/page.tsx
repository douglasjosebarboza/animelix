import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

export default async function WatchlistPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-8 text-neutral-100">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Minha Watchlist</h1>
          <p className="text-sm text-neutral-400">
            Logado como {session.user.email}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
          >
            Sair
          </button>
        </form>
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-sm text-neutral-500">
        Nenhum anime na sua lista ainda. (Catálogo chega no próximo ticket.)
      </p>
    </main>
  );
}
