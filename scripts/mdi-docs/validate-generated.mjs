#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const OUT_DIR = path.join(ROOT, "docs/external/mdi");
const GENERATOR = path.join(ROOT, "scripts/mdi-docs/extract-postman.mjs");

const requiredFiles = [
  "README.md",
  "endpoint-index.jsonl",
  "endpoint-index.md",
  "ticket-packs/T-055.md",
  "ticket-packs/T-056.md",
  "ticket-packs/T-057.md",
];

const findings = [];

await assertRequiredFiles();
const indexRows = await parseIndex();
await assertSurfaceCoverage(indexRows);
await assertRouteClassification(indexRows);
await assertOperationFiles(indexRows);
await assertTicketPacks(indexRows);
await assertNoSensitiveGeneratedContent();
await assertDeterministicGeneration();

if (findings.length > 0) {
  console.error(findings.map((finding) => `- ${finding}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${indexRows.length} generated MDI operation docs.`);

async function assertRequiredFiles() {
  for (const file of requiredFiles) {
    await assertExists(path.join(OUT_DIR, file), `Missing generated file: ${file}`);
  }
}

async function parseIndex() {
  const text = await readFile(path.join(OUT_DIR, "endpoint-index.jsonl"), "utf8");
  const rows = text
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        findings.push(`endpoint-index.jsonl line ${index + 1} is invalid JSON: ${error.message}`);
        return null;
      }
    })
    .filter(Boolean);

  if (rows.length < 100) {
    findings.push(`Expected a substantial endpoint index; found only ${rows.length} rows.`);
  }

  const slugs = new Set();
  for (const row of rows) {
    for (const key of [
      "slug",
      "method",
      "path",
      "surface",
      "folderPath",
      "requestName",
      "operationFile",
      "sourceCollection",
      "sourceFolders",
      "sourceRequest",
    ]) {
      if (!(key in row)) findings.push(`Index row ${row.slug ?? "(unknown)"} missing key ${key}.`);
    }
    if (slugs.has(row.slug)) findings.push(`Duplicate operation slug: ${row.slug}`);
    slugs.add(row.slug);
  }

  return rows;
}

async function assertSurfaceCoverage(rows) {
  const surfaces = new Set(rows.map((row) => row.surface));
  for (const surface of ["partner", "webhook", "internal"]) {
    if (!surfaces.has(surface)) findings.push(`Missing expected surface classification: ${surface}`);
  }
}

async function assertRouteClassification(rows) {
  for (const row of rows) {
    if (row.path.startsWith("/partner/tests/") || row.path.startsWith("/v1/partner/tests/")) {
      if (row.surface !== "test") {
        findings.push(`Partner test route must be classified test: ${row.slug}`);
      }
    }
    if (row.surface === "status") {
      const isApiStatus =
        row.folderPath === "API Status" ||
        row.path === "/status" ||
        row.path.startsWith("/v1/status/");
      if (!isApiStatus) {
        findings.push(`Only API Status diagnostic routes may be classified status: ${row.slug}`);
      }
    }
    if (row.surface === "partner") {
      const isPartnerRoute =
        row.path.startsWith("/partner/") || row.path.startsWith("/v1/partner/");
      if (!isPartnerRoute) {
        findings.push(`Route is classified partner but path is not a partner API route: ${row.slug}`);
      }
      if (row.path.startsWith("/partner/tests/") || row.path.startsWith("/v1/partner/tests/")) {
        findings.push(`Test route must not be classified partner: ${row.slug}`);
      }
    }
    if (
      row.path.startsWith("/clinician/") ||
      row.path.startsWith("/v1/clinician/") ||
      row.path.startsWith("/patient/") ||
      row.path.startsWith("/v1/patient/") ||
      row.path.startsWith("/web/") ||
      row.path.startsWith("/app/")
    ) {
      if (row.surface !== "internal") {
        findings.push(`App/internal route must be classified internal: ${row.slug}`);
      }
    }
  }
}

async function assertOperationFiles(rows) {
  for (const row of rows) {
    const operationPath = path.join(OUT_DIR, row.operationFile);
    await assertExists(operationPath, `Missing operation doc for ${row.slug}`);
    const text = await readFile(operationPath, "utf8");
    if (!text.includes("The raw Postman collection remains authoritative")) {
      findings.push(`Operation doc lacks source-of-truth note: ${row.operationFile}`);
    }
    if (!text.includes("Source folders:") || !text.includes("Source request:")) {
      findings.push(`Operation doc lacks source provenance: ${row.operationFile}`);
    }
  }
}

async function assertTicketPacks(rows) {
  const knownFiles = new Set(rows.map((row) => row.operationFile));

  for (const ticket of ["T-055", "T-056", "T-057"]) {
    const packPath = path.join(OUT_DIR, "ticket-packs", `${ticket}.md`);
    const text = await readFile(packPath, "utf8");
    if (!text.includes("The raw Postman collection remains authoritative")) {
      findings.push(`${ticket} pack lacks source-of-truth note.`);
    }
    for (const heading of [
      "Endpoint Matrix",
      "Required local persistence",
      "Forbidden local persistence",
      "Source Provenance",
    ]) {
      if (!text.includes(heading)) findings.push(`${ticket} pack missing ${heading}.`);
    }

    const links = [...text.matchAll(/\]\(\.\.\/(operations\/[^)]+\.md)\)/g)].map(
      (match) => match[1],
    );
    if (links.length === 0) findings.push(`${ticket} pack does not link any operation docs.`);
    for (const link of links) {
      if (!knownFiles.has(link)) findings.push(`${ticket} pack links unknown operation doc: ${link}`);
    }
  }
}

async function assertNoSensitiveGeneratedContent() {
  const files = await listFiles(OUT_DIR);
  const generatedText = (
    await Promise.all(files.map((file) => readFile(file, "utf8")))
  ).join("\n");

  const forbiddenPatterns = [
    [/\bJohn\b|\bDoe\b|\bOberyn\b|\bMartell\b/i, "copied example patient name"],
    [/\bjohn@doe\.com\b|\bemail@example\.com\b/i, "copied example email"],
    [/\b111-?22-?3333\b/, "copied example SSN"],
    [/9071 E\. Mississippi|10001, new test mall/i, "copied example address"],
    [/Are you pregnant\?|The prescription is urgent|Notes from the MD|One per day|Tracking Number: 101010/i, "copied clinical/message/prescription example text"],
    [/pre-auth link to patient app/i, "copied access-link example text"],
    [/examplepartner|signature=(?!REDACTED_SCALAR)|case_id=[0-9a-f]|9706428|999876278|000777|search=Denver|search=47106/i, "copied raw URL query example"],
    [/Bearer\s+[A-Za-z0-9._-]+/i, "bearer token-looking value"],
    [/client_secret["'`]?\s*[:=]\s*["'`][^"'`]+/i, "client secret-looking value"],
    [/```json[\s\S]*?```/i, "full fenced JSON fixture"],
  ];

  for (const [pattern, description] of forbiddenPatterns) {
    if (pattern.test(generatedText)) {
      findings.push(`Generated docs contain forbidden ${description}.`);
    }
  }
}

async function assertDeterministicGeneration() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mdi-docs-"));
  const tempOut = path.join(tempRoot, "mdi");
  try {
    await execFileAsync("node", [GENERATOR, "--out", tempOut], { cwd: ROOT });
    const diff = await compareDirs(OUT_DIR, tempOut);
    findings.push(...diff);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function compareDirs(left, right, relative = "") {
  const diff = [];
  const leftEntries = await safeReadDir(path.join(left, relative));
  const rightEntries = await safeReadDir(path.join(right, relative));
  const names = [...new Set([...leftEntries, ...rightEntries])].sort();

  for (const name of names) {
    const nextRelative = path.join(relative, name);
    const leftPath = path.join(left, nextRelative);
    const rightPath = path.join(right, nextRelative);
    const leftStat = await safeStat(leftPath);
    const rightStat = await safeStat(rightPath);

    if (!leftStat || !rightStat) {
      diff.push(`Determinism check mismatch: ${nextRelative} exists on only one side.`);
      continue;
    }
    if (leftStat.isDirectory() || rightStat.isDirectory()) {
      if (!leftStat.isDirectory() || !rightStat.isDirectory()) {
        diff.push(`Determinism check type mismatch: ${nextRelative}`);
        continue;
      }
      diff.push(...(await compareDirs(left, right, nextRelative)));
      continue;
    }

    const [leftText, rightText] = await Promise.all([
      readFile(leftPath, "utf8"),
      readFile(rightPath, "utf8"),
    ]);
    if (leftText !== rightText) {
      diff.push(`Determinism check content mismatch: ${nextRelative}`);
    }
  }

  return diff;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(fullPath)));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function assertExists(file, message) {
  const fileStat = await safeStat(file);
  if (!fileStat) findings.push(message);
}

async function safeReadDir(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function safeStat(file) {
  try {
    return await stat(file);
  } catch {
    return null;
  }
}
