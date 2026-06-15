import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";

import GoogleAnalytics from "@/components/GoogleAnalytics";
import Providers from "@/lib/providers";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "Turbo Notes",
  description: "A cozy little home for your charming notes.",
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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <GoogleAnalytics />
      </head>
      <body className="flex min-h-full flex-col bg-cream font-sans text-ink-soft dark:bg-bark dark:text-linen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
