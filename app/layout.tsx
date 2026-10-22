import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { auth } from "@/auth";
import SiteNav from "@/app/components/SiteNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Animelix — sua watchlist de animes",
  description:
    "Acompanhe o progresso dos animes que você assiste: marque episódios, organize sua watchlist e retome de onde parou.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  // Nonce da CSP, gerado por requisição em `proxy.ts`. O Next aplica o nonce
  // automaticamente nos scripts que ELE gera, mas este script inline é
  // nosso — precisa do atributo `nonce` na mão.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();",
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col">
        <SiteNav loggedIn={!!session?.user?.id} />
        {children}
      </body>
    </html>
  );
}
