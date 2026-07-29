import { spawn } from "node:child_process";

const marketingOrigin = process.env.APOTH_LOCAL_MARKETING_ORIGIN ??
  "http://127.0.0.1:3000";
const accountOrigin = process.env.APOTH_LOCAL_ACCOUNT_ORIGIN ??
  "http://127.0.0.1:5173";
const marketingUrl = new URL(marketingOrigin);
const accountUrl = new URL(accountOrigin);

assertLoopbackHttp(marketingUrl, "APOTH_LOCAL_MARKETING_ORIGIN");
assertLoopbackHttp(accountUrl, "APOTH_LOCAL_ACCOUNT_ORIGIN");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(
    npmCommand,
    [
      "run",
      "dev:marketing",
      "--",
      "--hostname",
      marketingUrl.hostname,
      "--port",
      port(marketingUrl),
    ],
    {
      env: {
        ...process.env,
        APOTH_ACCOUNT_ORIGIN: accountUrl.origin,
        APOTH_MARKETING_ORIGIN: marketingUrl.origin,
        NEXT_PUBLIC_ACCOUNT_ORIGIN: accountUrl.origin,
        NEXT_PUBLIC_SITE_URL: marketingUrl.origin,
      },
      stdio: "inherit",
    },
  ),
  spawn(
    npmCommand,
    [
      "run",
      "patient:dev",
      "--",
      "--host",
      accountUrl.hostname,
      "--port",
      port(accountUrl),
    ],
    {
      env: {
        ...process.env,
        NEXT_PUBLIC_ACCOUNT_ORIGIN: accountUrl.origin,
        VITE_MARKETING_ORIGIN: marketingUrl.origin,
        VITE_PATIENT_API_PROXY_TARGET: marketingUrl.origin,
      },
      stdio: "inherit",
    },
  ),
];

console.log(`Marketing site: ${marketingUrl.origin}`);
console.log(`Checkout/account app: ${accountUrl.origin}`);

let stopping = false;
for (const child of children) {
  child.on("exit", (code, signal) => {
    if (stopping) return;
    stopping = true;
    for (const sibling of children) {
      if (sibling !== child && sibling.exitCode === null) sibling.kill("SIGTERM");
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (child.exitCode === null) child.kill(signal);
    }
  });
}

function assertLoopbackHttp(url, variableName) {
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "http:" || !loopback || url.pathname !== "/" ||
      url.search || url.hash || url.username || url.password) {
    throw new Error(`${variableName} must be an http://localhost or http://127.0.0.1 origin`);
  }
}

function port(url) {
  return url.port || "80";
}
