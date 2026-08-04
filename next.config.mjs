import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const patientPrivacyHeaders = [
  { key: "Cache-Control", value: "no-store, private" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const patientRouteSources = [
  "/account/:path*",
  "/billing/:path*",
  "/checkout/:path*",
  "/dashboard/:path*",
  "/get-started/:path*",
  "/intake/:path*",
  "/onboarding/:path*",
  "/portal/:path*",
  "/reset-password/:path*",
  "/sign-in/:path*",
  "/sign-up/:path*",
  "/verify/:path*",
  "/verify-email/:path*",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return patientRouteSources.map((source) => ({
      headers: patientPrivacyHeaders,
      source,
    }));
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
