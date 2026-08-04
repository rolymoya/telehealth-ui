import type { Metadata, Viewport } from "next";
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
    <html lang="en">
      <body className="app-v2">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-ink focus:shadow-soft"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
