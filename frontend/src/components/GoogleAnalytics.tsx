import Script from "next/script";

/**
 * Optional Google Analytics. Renders nothing unless NEXT_PUBLIC_GA_ID is set at
 * build time, so the repository ships with no third-party tracking by default —
 * a deployment opts in via the env var.
 */
export default function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  if (!id) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>
    </>
  );
}
