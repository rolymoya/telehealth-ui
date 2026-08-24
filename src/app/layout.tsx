import type { Metadata, Viewport } from "next";
import { HashScroll } from "@/components/HashScroll";
import { assertPublicServerStartupConfig } from "@/lib/secrets/startup";
import "./globals.css";

assertPublicServerStartupConfig({ env: process.env });

export const metadata: Metadata = {
  title: {
    default: "Apoth Health",
    template: "%s",
  },
  description:
    "Online weight management and wellness intake with independent licensed providers, coordinated through the Apoth technology platform.",
  // The static publish injects the stage's canonical public origin.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  applicationName: "Apoth Health",
  icons: {
    icon: "/icon",
  },
  openGraph: {
    type: "website",
    siteName: "Apoth Health",
    title: "Apoth Health",
    description:
      "Online weight management and wellness intake with independent licensed providers.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Apoth Health",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Apoth Health",
    description:
      "Online weight management and wellness intake with independent licensed providers.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f9f9fa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="motion-ready">
      <head>
        {/* Without these the browser discovers the fonts only after CSS parses,
            paints the page in Helvetica Neue, then re-renders in Figtree at
            different metrics — text visibly changes size mid-load. Preloading
            gets them in before first paint. */}
        <link
          rel="preload"
          href="/fonts/figtree-latin-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/figtree-latin-ext-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* `.motion-ready` gates the reveal animations' hidden start state and
            is rendered on <html> below rather than added by script, so the
            markup React hydrates matches what the server sent. Without JS
            nothing would ever reveal those elements, so restore them here. */}
        <noscript>
          <style>{`.motion-ready .marketing-v2 [data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        {/* Runs before the body parses. Three things race to set scroll
            position on a `#section` load: the browser's native fragment jump,
            the App Router's reset to top during hydration, and HashScroll's
            animation. The first two are what made arriving on a section lurch
            twice. Stashing the hash and taking it off the URL leaves only the
            animation; HashScroll restores the hash once it has finished.
            Touches no rendered markup, so hydration still matches. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if(location.hash){window.__apothPendingHash=location.hash;" +
              "history.replaceState(null,'',location.pathname+location.search);}",
          }}
        />
      </head>
      <body className="app-v2">
        <span
          aria-hidden="true"
          dangerouslySetInnerHTML={{
            __html:
              "<!-- impeccable:apoth-story-mosaic | THESIS: Editorial outside, operational inside; refuses the generic telehealth card grid. | OWN-WORLD: Figtree grotesk, near-white canvas, pear product fields, warm photography, hairlines, black pill actions, and almost no elevation. | STORY: Understand the offer and responsible parties, begin weight care, then move through an increasingly quiet handoff. | FIRST VIEWPORT: Broad outcome headline and proof column over a 66/34 product-and-human story mosaic, followed by a hairline treatment strip; the primary action sits inside the pear field. | FORM: Approved story mosaic, option B with option C treatment strip, seed apoth-story-mosaic. | FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->",
          }}
          style={{ display: "none" }}
        />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-ink focus:shadow-soft"
        >
          Skip to content
        </a>
        <HashScroll />
        {children}
      </body>
    </html>
  );
}
