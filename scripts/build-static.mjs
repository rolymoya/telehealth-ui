import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  APOTH_STAGE: process.env.APOTH_STAGE ?? "staging",
};

for (const command of [
  ["node", ["scripts/assert-static-compatible.mjs"]],
  ["next", ["build"]],
  ["node", ["scripts/export-static-routes.mjs"]],
]) {
  const result = spawnSync(command[0], command[1], {
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
