import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("intake static compatibility", () => {
  it("does not import request-time Next APIs", () => {
    const sources = [
      ...Array.from(walk(join(process.cwd(), "src/app/intake"))),
      ...Array.from(walk(join(process.cwd(), "src/app/account"))),
    ]
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    for (const forbidden of [
      "server-only",
      "next/headers",
      "\"use server\"",
      "requireProtectedPageAccess",
    ]) {
      expect(sources).not.toContain(forbidden);
    }
  });

  it("build:static emits only the public marketing boundary", () => {
    const packageJson = JSON.parse(readFileSync(
      join(process.cwd(), "package.json"),
      "utf8",
    )) as { scripts: Record<string, string> };
    const exportScript = readFileSync(
      join(process.cwd(), "scripts/export-static-routes.mjs"),
      "utf8",
    );
    const buildStaticScript = readFileSync(
      join(process.cwd(), "scripts/build-static.mjs"),
      "utf8",
    );

    expect(packageJson.scripts["build:static"]).toBe("node scripts/build-static.mjs");
    expect(buildStaticScript).toContain("scripts/assert-static-compatible.mjs");
    expect(buildStaticScript).toContain("\"next\", [\"build\"]");
    expect(buildStaticScript).toContain("scripts/export-static-routes.mjs");
    expect(exportScript).toContain("\"/about\"");
    expect(exportScript).toContain("\"/privacy\"");
    expect(exportScript).toContain("\"/terms\"");
    expect(exportScript).toContain("\"/weight-loss\"");
    expect(exportScript).not.toContain("\"/account\"");
    expect(exportScript).not.toContain("\"/intake\"");
    expect(exportScript).not.toContain("\"/onboarding/mdi\"");
    expect(exportScript).not.toContain("\"/sign-up\"");
    expect(exportScript).toContain("copyPublicAssets");
    expect(exportScript).toContain("_not-found.html");
    expect(exportScript).toContain("404.html");
    expect(exportScript).toContain("htmlDestinationForRoute");
    expect(exportScript).toContain("index.html");
  });
});

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}
