import type { Metadata } from "next";

import Providers from "@/lib/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Turbo Notes",
  description: "Fast, simple notes — Turbo AI challenge.",
};

/**
 * Applies the persisted (or OS-preferred) theme before first paint so the UI
 * never flashes the wrong mode. Must stay inline and dependency-free.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the inline script may add `.dark` before React hydrates.
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
