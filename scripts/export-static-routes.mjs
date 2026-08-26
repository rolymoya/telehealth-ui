import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const nextDir = path.join(projectRoot, ".next");
const serverAppDir = path.join(nextDir, "server", "app");
const outputDir = path.join(projectRoot, "out");

// Publish allowlist, not a mirror of what Next prerendered. Deliberately
// explicit: the build also prerenders account and checkout routes that belong
// to the patient app bundle and must not be published to the marketing CDN.
// A new public page 404s in production until it is added here.
const requiredRoutes = [
  "/",
  "/about",
  "/nad",
  "/privacy",
  "/terms",
  "/weight-loss",
];

rmSync(outputDir, { force: true, recursive: true });
mkdirSync(outputDir, { recursive: true });

copyStaticAssets();
copyPublicAssets();

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

function copyPublicAssets() {
  const publicDir = path.join(projectRoot, "public");
  if (!existsSync(publicDir)) {
    return;
  }
  for (const entry of readdirSync(publicDir)) {
    cpSync(
      path.join(publicDir, entry),
      path.join(outputDir, entry),
      { recursive: true },
    );
  }
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
