import { auth, signOut } from "@/auth";

export default async function SiteNav() {
  const session = await auth();
  const loggedIn = !!session?.user?.id;

  return (
    <nav className="border-b border-neutral-800 bg-neutral-950 px-6 py-3 text-sm text-neutral-100">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <a href="/" className="font-semibold">
          Animelix
        </a>
        <div className="flex items-center gap-3">
          <a href="/" className="text-neutral-300 hover:text-white">
            Home
          </a>
          <a href="/search" className="text-neutral-300 hover:text-white">
            Buscar
          </a>
          {loggedIn ? (
            <>
              <a href="/watchlist" className="text-neutral-300 hover:text-white">
                Perfil
              </a>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="text-neutral-300 hover:text-white">
                  Sair
                </button>
              </form>
            </>
          ) : (
            <>
              <a href="/login" className="text-neutral-300 hover:text-white">
                Entrar
              </a>
              <a
                href="/register"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-500"
              >
                Registrar
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
