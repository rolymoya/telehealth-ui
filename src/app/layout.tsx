import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { assertPublicServerStartupConfig } from "@/lib/secrets/startup";
import "./globals.css";

assertPublicServerStartupConfig({ env: process.env });

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["300", "400", "500"],
  style: ["normal"],
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Apoth Health",
    template: "%s",
  },
  description:
    "Apoth Health is a telehealth technology platform for account, intake, billing, and MDI-backed care workflow access.",
  // TODO: replace with the real production domain before launch
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
      "Telehealth technology for patient intake, account, billing, and care-workflow access.",
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
      "Telehealth technology for patient intake, account, billing, and care-workflow access.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "oklch(97% 0.008 75)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-clay focus:px-4 focus:py-2 focus:text-cream"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
