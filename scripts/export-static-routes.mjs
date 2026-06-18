import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const nextDir = path.join(projectRoot, ".next");
const serverAppDir = path.join(nextDir, "server", "app");
const outputDir = path.join(projectRoot, "out");

const requiredRoutes = [
  "/",
  "/about",
  "/account",
  "/billing",
  "/dashboard",
  "/get-started",
  "/intake",
  "/onboarding/consent",
  "/onboarding/mdi",
  "/privacy",
  "/reset-password",
  "/sign-in",
  "/sign-up",
  "/terms",
  "/verify-email",
];

rmSync(outputDir, { force: true, recursive: true });
mkdirSync(outputDir, { recursive: true });

copyStaticAssets();

for (const route of requiredRoutes) {
  const source = htmlSourceForRoute(route);
  if (!existsSync(source)) {
    throw new Error(`Missing prerendered HTML for ${route}: ${source}`);
  }
  const destination = htmlDestinationForRoute(route);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

copyNotFoundArtifact();

for (const route of requiredRoutes) {
  const destination = htmlDestinationForRoute(route);
  if (!existsSync(destination)) {
    throw new Error(`Static export did not create ${destination}`);
  }
}

function copyStaticAssets() {
  const nextStatic = path.join(nextDir, "static");
  if (!existsSync(nextStatic)) {
    throw new Error("Missing .next/static assets. Run next build first.");
  }
  cpSync(nextStatic, path.join(outputDir, "_next", "static"), {
    recursive: true,
  });
}

function copyNotFoundArtifact() {
  const source = path.join(serverAppDir, "_not-found.html");
  if (!existsSync(source)) {
    throw new Error(`Missing prerendered not-found HTML: ${source}`);
  }
  copyFileSync(source, path.join(outputDir, "404.html"));
}

function htmlSourceForRoute(route) {
  if (route === "/") {
    return path.join(serverAppDir, "index.html");
  }
  return path.join(serverAppDir, `${route.slice(1)}.html`);
}

function htmlDestinationForRoute(route) {
  if (route === "/") {
    return path.join(outputDir, "index.html");
  }
  return path.join(outputDir, route.slice(1), "index.html");
}
