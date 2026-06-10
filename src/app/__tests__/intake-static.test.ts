import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("intake static compatibility", () => {
  it("does not import request-time Next APIs", () => {
    const sources = Array.from(walk(join(process.cwd(), "src/app/intake")))
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

  it("build:static is wired to emit S3 clean-route artifacts", () => {
    const packageJson = JSON.parse(readFileSync(
      join(process.cwd(), "package.json"),
      "utf8",
    )) as { scripts: Record<string, string> };
    const exportScript = readFileSync(
      join(process.cwd(), "scripts/export-static-routes.mjs"),
      "utf8",
    );

    expect(packageJson.scripts["build:static"]).toContain("next build");
    expect(packageJson.scripts["build:static"]).toContain("export-static-routes.mjs");
    expect(exportScript).toContain("\"/billing\"");
    expect(exportScript).toContain("\"/dashboard\"");
    expect(exportScript).toContain("\"/get-started\"");
    expect(exportScript).toContain("\"/intake\"");
    expect(exportScript).toContain("\"/reset-password\"");
    expect(exportScript).toContain("\"/sign-in\"");
    expect(exportScript).toContain("\"/sign-up\"");
    expect(exportScript).toContain("\"/onboarding/consent\"");
    expect(exportScript).toContain("\"/onboarding/mdi\"");
    expect(exportScript).toContain("\"/verify-email\"");
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
