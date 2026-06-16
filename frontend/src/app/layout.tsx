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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://notes.cardenas.pe";
const SITE_DESC = "A cozy little home for your charming notes — with AI voice notes.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Turbo Notes",
  description: SITE_DESC,
  openGraph: {
    title: "Turbo Notes",
    description: SITE_DESC,
    url: SITE_URL,
    siteName: "Turbo Notes",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Turbo Notes" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Turbo Notes",
    description: SITE_DESC,
    images: ["/og.png"],
  },
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
