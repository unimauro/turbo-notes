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
const SITE_TITLE = "Turbo Notes — take notes by voice, with AI";
const SITE_DESC =
  "Take notes by voice: dictate with AI (Whisper), read them aloud, and auto-title hands-free by saying “close my note.” A cozy, fast notes app.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · Turbo Notes" },
  description: SITE_DESC,
  applicationName: "Turbo Notes",
  authors: [{ name: "Carlos Cárdenas", url: "https://github.com/unimauro" }],
  creator: "Carlos Cárdenas",
  category: "productivity",
  keywords: [
    "voice notes",
    "notes by voice",
    "AI notes app",
    "voice dictation",
    "speech to text",
    "Whisper",
    "read notes aloud",
    "text to speech",
    "hands-free notes",
    "note taking app",
  ],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESC,
    url: SITE_URL,
    siteName: "Turbo Notes",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og.png?v=3",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Turbo Notes — take notes by voice, with AI dictation, read-aloud and auto-title",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
    images: ["/og.png?v=3"],
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
        {/* Structured data — helps search engines render a rich result. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Turbo Notes",
              url: SITE_URL,
              applicationCategory: "ProductivityApplication",
              operatingSystem: "Web",
              description: SITE_DESC,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              featureList: [
                "Voice dictation (AI)",
                "Read notes aloud (text-to-speech)",
                "Auto-title and summarize with AI",
                "Hands-free “close my note” command",
                "Color-coded categories",
                "Autosaving editor",
              ],
              author: {
                "@type": "Person",
                name: "Carlos Cárdenas",
                url: "https://github.com/unimauro",
              },
            }),
          }}
        />
        <GoogleAnalytics />
      </head>
      <body className="flex min-h-full flex-col bg-cream font-sans text-ink-soft dark:bg-bark dark:text-linen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
