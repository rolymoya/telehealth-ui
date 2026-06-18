import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const routeDir = join(process.cwd(), "src/app/intake");
const forbidden = [
  "server-only",
  "next/headers",
  "next/navigation",
  "requireProtectedPageAccess",
  "\"use server\"",
];

let failed = false;
for (const file of walk(routeDir)) {
  if (!/\.(ts|tsx)$/.test(file)) {
    continue;
  }
  const source = readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    if (source.includes(pattern)) {
      console.error(
        `${relative(process.cwd(), file)} imports or references ${pattern}`,
      );
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}
