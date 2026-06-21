#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_SOURCE = path.join(
  ROOT,
  "docs/external/MD Integrations API.postman_collection.json",
);
const DEFAULT_OUT = path.join(ROOT, "docs/external/mdi");

const args = parseArgs(process.argv.slice(2));
const sourcePath = path.resolve(ROOT, args.source ?? DEFAULT_SOURCE);
const outDir = path.resolve(ROOT, args.out ?? DEFAULT_OUT);

const collection = JSON.parse(await readFile(sourcePath, "utf8"));
const operations = collectOperations(collection);

await rm(outDir, { recursive: true, force: true });
await mkdir(path.join(outDir, "operations"), { recursive: true });
await mkdir(path.join(outDir, "ticket-packs"), { recursive: true });

await writeFile(
  path.join(outDir, "endpoint-index.jsonl"),
  operations.map((operation) => JSON.stringify(indexRecord(operation))).join("\n") + "\n",
);
await writeFile(path.join(outDir, "endpoint-index.md"), renderEndpointIndex(operations));
await writeFile(path.join(outDir, "README.md"), renderReadme(operations));

for (const operation of operations) {
  await writeFile(
    path.join(outDir, "operations", `${operation.slug}.md`),
    renderOperation(operation),
  );
}

for (const pack of ticketPacks(operations)) {
  await writeFile(path.join(outDir, "ticket-packs", `${pack.ticket}.md`), renderPack(pack));
}

console.log(`Generated ${operations.length} MDI operation docs in ${path.relative(ROOT, outDir)}`);

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--source") {
      parsed.source = rawArgs[index + 1];
      index += 1;
    } else if (arg === "--out") {
      parsed.out = rawArgs[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function collectOperations(postmanCollection) {
  const rows = [];

  walkItems(postmanCollection.item ?? [], [], rows);

  const seenSlugs = new Map();
  return rows.map((row, index) => {
    const baseSlug = slugify(
      [
        row.surface,
        row.method.toLowerCase(),
        normalizePathForSlug(row.normalizedPath),
        row.name,
      ].join("-"),
    );
    const count = seenSlugs.get(baseSlug) ?? 0;
    seenSlugs.set(baseSlug, count + 1);
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;

    return {
      ...row,
      index,
      slug,
      operationFile: `operations/${slug}.md`,
    };
  });
}

function walkItems(items, folderPath, rows) {
  for (const item of items) {
    const nextPath = [...folderPath, item.name ?? "Untitled"];
    if (item.request) {
      rows.push(normalizeRequest(item, folderPath));
    }
    if (Array.isArray(item.item)) {
      walkItems(item.item, nextPath, rows);
    }
  }
}

function normalizeRequest(item, folderPath) {
  const request = item.request;
  const rawUrl = rawUrlFromRequest(request);
  const rawUrlTemplate = sanitizeUrlTemplate(rawUrl);
  const normalizedPath = normalizeUrlPath(rawUrl);
  const surface = classifySurface(folderPath, normalizedPath);
  const queryParams = extractQueryParams(request.url, rawUrl);
  const pathParams = extractPathParams(normalizedPath);
  const headerNames = extractHeaderNames(request.header);

  return {
    name: item.name ?? "Untitled request",
    method: (request.method ?? "GET").toUpperCase(),
    rawUrlTemplate,
    normalizedPath,
    surface,
    folderPath,
    provenance: {
      collection: collection.info?.name ?? "MD Integrations API",
      folders: folderPath,
      request: item.name ?? "Untitled request",
    },
    queryParams,
    pathParams,
    headerNames,
    authType: request.auth?.type ?? null,
    requestBody: describeBody(request.body),
    responses: describeResponses(item.response ?? []),
    implementationGuidance: guidanceForSurface(surface),
  };
}

function rawUrlFromRequest(request) {
  if (typeof request.url === "string") return request.url;
  return request.url?.raw ?? "";
}

function normalizeUrlPath(rawUrl) {
  if (!rawUrl) return "(no URL in source)";
  const withoutHost = rawUrl
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^{{[^}]+}}/, "")
    .replace(/^\/?$/, "/");
  const [pathPart] = withoutHost.split("?");
  return pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
}

function sanitizeUrlTemplate(rawUrl) {
  if (!rawUrl || !rawUrl.includes("?")) return rawUrl;
  const [base, query] = rawUrl.split("?");
  const sanitizedQuery = query
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const [key] = pair.split("=");
      return `${key}=REDACTED_SCALAR`;
    })
    .join("&");
  return `${base}?${sanitizedQuery}`;
}

function classifySurface(folderPath, normalizedPath) {
  const top = folderPath[0] ?? "";
  const route = normalizedPath.toLowerCase();
  if (top === "Webhooks" || route.includes("webhook.site")) return "webhook";
  if (route.startsWith("/admin/") || route.includes("/admin/")) return "admin";
  if (route.startsWith("/partner/tests/") || route.startsWith("/v1/partner/tests/")) return "test";
  if (route.startsWith("/partner/") || route.startsWith("/v1/partner/")) return "partner";
  if (
    top === "Internal" ||
    route.startsWith("/web/") ||
    route.startsWith("/app/") ||
    route.startsWith("/patient/") ||
    route.startsWith("/v1/patient/") ||
    route.startsWith("/clinician/") ||
    route.startsWith("/v1/clinician/") ||
    route.startsWith("/shopify/") ||
    route.startsWith("/woocommerce/") ||
    route.startsWith("/hubspot/")
  ) {
    return "internal";
  }
  if (top === "API Status" || route === "/status" || route.startsWith("/v1/status/")) {
    return "status";
  }
  if (top === "Partners") return "unknown";
  return "unknown";
}

function guidanceForSurface(surface) {
  if (surface === "partner") {
    return "Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.";
  }
  if (surface === "webhook") {
    return "Default implementation candidate for inbound MDI events. Verify authenticity, process idempotently, and persist only opaque IDs/status.";
  }
  if (surface === "status") {
    return "Diagnostic route only. Do not use for patient/case workflow implementation.";
  }
  return "Default-deny for Apoth implementation. Use only with an explicit future architecture/product decision.";
}

function extractQueryParams(url, rawUrl) {
  const fromPostman = Array.isArray(url?.query)
    ? url.query.map((param) => param?.key).filter(Boolean)
    : [];
  const queryText = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
  const fromRaw = queryText
    .split("&")
    .map((pair) => pair.split("=")[0])
    .filter(Boolean);
  return uniqueSorted([...fromPostman, ...fromRaw]);
}

function extractPathParams(normalizedPath) {
  const matches = normalizedPath.match(/[:{][A-Za-z0-9_]+}?/g) ?? [];
  return uniqueSorted(
    matches.map((match) => match.replace(/^[:{]/, "").replace(/}$/, "")),
  );
}

function extractHeaderNames(headers) {
  if (!Array.isArray(headers)) return [];
  return uniqueSorted(headers.map((header) => header?.key).filter(Boolean));
}

function describeBody(body) {
  if (!body) {
    return { mode: "none", fields: [], note: "No request body in source." };
  }

  if (body.mode === "raw" && typeof body.raw === "string" && body.raw.trim()) {
    const parsed = tryParseJson(body.raw);
    if (parsed.ok) {
      return {
        mode: "raw-json",
        fields: shapeLines(parsed.value),
        note: "Shape summary only. Source scalar examples are intentionally omitted.",
      };
    }
    return {
      mode: "raw",
      fields: [],
      note: "Raw body example omitted because it is not parseable as strict JSON or may contain PHI-like examples.",
    };
  }

  if (body.mode === "formdata" && Array.isArray(body.formdata)) {
    return {
      mode: "formdata",
      fields: body.formdata.map((field) => `${field.key}: ${field.type ?? "unknown"}`),
      note: "Form-data field names only. Values are intentionally omitted.",
    };
  }

  if (body.mode === "urlencoded" && Array.isArray(body.urlencoded)) {
    return {
      mode: "urlencoded",
      fields: body.urlencoded.map((field) => `${field.key}: REDACTED_SCALAR`),
      note: "URL-encoded field names only. Values are intentionally omitted.",
    };
  }

  return {
    mode: body.mode ?? "unknown",
    fields: [],
    note: "Body shape unavailable from Postman metadata; raw payload omitted.",
  };
}

function describeResponses(responses) {
  return responses.slice(0, 3).map((response) => {
    const parsed = typeof response.body === "string" ? tryParseJson(response.body) : { ok: false };
    return {
      name: response.name ?? null,
      code: response.code ?? null,
      status: response.status ?? null,
      fields: parsed.ok ? shapeLines(parsed.value) : [],
      note: parsed.ok
        ? "Shape summary only. Source scalar examples are intentionally omitted."
        : "Response body omitted because it is absent, non-JSON, or unsuitable for generated docs.",
    };
  });
}

function tryParseJson(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function shapeLines(value, prefix = "") {
  const lines = [];
  collectShape(value, prefix, lines, new Set());
  return lines.slice(0, 120);
}

function collectShape(value, prefix, lines, seenObjects) {
  if (value === null) {
    if (prefix) lines.push(`${prefix}: null`);
    return;
  }
  if (Array.isArray(value)) {
    if (prefix) lines.push(`${prefix}: array`);
    if (value.length > 0) {
      collectShape(value[0], `${prefix}[]`, lines, seenObjects);
    }
    return;
  }
  if (typeof value === "object") {
    if (seenObjects.has(value)) return;
    seenObjects.add(value);
    if (prefix) lines.push(`${prefix}: object`);
    for (const key of Object.keys(value).sort()) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      collectShape(value[key], nextPrefix, lines, seenObjects);
    }
    return;
  }
  if (prefix) {
    lines.push(`${prefix}: ${typeof value}`);
  }
}

function indexRecord(operation) {
  return orderedObject({
    slug: operation.slug,
    method: operation.method,
    path: operation.normalizedPath,
    surface: operation.surface,
    folderPath: operation.folderPath.join(" / "),
    requestName: operation.name,
    operationFile: operation.operationFile,
    sourceCollection: operation.provenance.collection,
    sourceFolders: operation.provenance.folders,
    sourceRequest: operation.provenance.request,
  });
}

function orderedObject(value) {
  return Object.fromEntries(Object.entries(value));
}

function renderEndpointIndex(ops) {
  const rows = [
    "# MDI Endpoint Index",
    "",
    "Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains the source of truth.",
    "",
    "Default Apoth implementation guidance prefers `partner` and `webhook` surfaces. `internal`, `admin`, `test`, and `unknown` routes are default-deny unless a future ticket explicitly justifies them.",
    "",
    `Total operations: ${ops.length}`,
    "",
    "| Method | Path | Surface | Operation | Source |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const op of ops) {
    rows.push(
      `| ${escapeTable(op.method)} | ${escapeTable(op.normalizedPath)} | ${escapeTable(op.surface)} | [${escapeTable(op.slug)}](${escapeTable(op.operationFile)}) | ${escapeTable(`${op.folderPath.join(" / ")} / ${op.name}`)} |`,
    );
  }

  return rows.join("\n") + "\n";
}

function renderReadme(ops) {
  const bySurface = surfaceCounts(ops);
  return [
    "# MDI Generated Retrieval Docs",
    "",
    "These files are generated from `docs/external/MD Integrations API.postman_collection.json`. The Postman collection remains the source of truth; rerun the generator when the collection changes.",
    "",
    "The generated docs intentionally omit source scalar examples, full payload fixtures, questionnaire answers, clinical note text, message text, prescription directions, tokens, and secrets. They keep endpoint metadata, source provenance, and schema shape summaries only.",
    "",
    "## Workflow",
    "",
    "```sh",
    "npm run mdi:docs",
    "npm run mdi:docs:validate",
    "```",
    "",
    "Search generated docs instead of loading the full collection:",
    "",
    "```sh",
    "rg \"Create patient|partner/patients|T-055\" docs/external/mdi",
    "rg \"case_question|questionnaire|T-056\" docs/external/mdi",
    "rg \"event_type|webhook|T-057\" docs/external/mdi",
    "```",
    "",
    "## Surface Counts",
    "",
    ...Object.entries(bySurface).map(([surface, count]) => `- ${surface}: ${count}`),
    "",
    "## Implementation Posture",
    "",
    "- Prefer `partner` endpoints for Apoth server-side MDI calls.",
    "- Prefer `webhook` examples for inbound MDI receiver contracts.",
    "- Treat `internal`, `admin`, `test`, and `unknown` routes as default-deny unless a future ticket explicitly justifies them.",
    "- Persist only minimal Apoth linkage/status records. Do not store questionnaire answers, clinical content, or PHI-heavy MDI payloads locally.",
  ].join("\n") + "\n";
}

function renderOperation(op) {
  const includeDetailedShape = ["partner", "webhook"].includes(op.surface);
  const bodyLines = includeDetailedShape && op.requestBody.fields.length
    ? op.requestBody.fields.map((line) => `- ${line}`)
    : [
        includeDetailedShape
          ? "- No generated body fields."
          : "- Detailed body shape omitted for this default-deny surface.",
      ];
  const responseSections = includeDetailedShape && op.responses.length
    ? op.responses.flatMap((response, index) => [
        `### Response ${index + 1}${response.code ? ` (${response.code})` : ""}`,
        "",
        response.note,
        "",
        ...(response.fields.length
          ? response.fields.map((line) => `- ${line}`)
          : ["- No generated response fields."]),
        "",
      ])
    : [
        includeDetailedShape
          ? "No response examples summarized from source."
          : "Detailed response shape omitted for this default-deny surface.",
        "",
      ];

  return [
    `# ${op.method} ${op.normalizedPath}`,
    "",
    "Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.",
    "",
    "## Index",
    "",
    `- Operation slug: \`${op.slug}\``,
    `- Surface: \`${op.surface}\``,
    `- Method: \`${op.method}\``,
    `- Path: \`${op.normalizedPath}\``,
    `- Raw URL template: \`${op.rawUrlTemplate || "(empty)"}\``,
    `- Source folders: ${op.folderPath.map((part) => `\`${part}\``).join(" / ") || "(root)"}`,
    `- Source request: \`${op.name}\``,
    "",
    "## Implementation Guidance",
    "",
    op.implementationGuidance,
    "",
    "## Request Shape",
    "",
    `- Auth type in source: \`${op.authType ?? "not specified"}\``,
    `- Path params: ${inlineList(op.pathParams)}`,
    `- Query params: ${inlineList(op.queryParams)}`,
    `- Header names: ${inlineList(op.headerNames)}`,
    `- Body mode: \`${op.requestBody.mode}\``,
    `- Body note: ${includeDetailedShape ? op.requestBody.note : "Omitted because this surface is default-deny for Apoth implementation."}`,
    "",
    ...bodyLines,
    "",
    "## Response Shape",
    "",
    ...responseSections,
    "## PHI Handling",
    "",
    "Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.",
  ].join("\n") + "\n";
}

function ticketPacks(ops) {
  return [
    {
      ticket: "T-055",
      title: "MDI patient creation + minimal DynamoDB linkage",
      summary:
        "Use partner patient endpoints to create or retrieve the MDI patient ID, then persist only the Cognito-to-MDI linkage/status record in DynamoDB.",
      selectors: [
        (op) => op.surface === "partner" && op.method === "POST" && op.normalizedPath === "/partner/patients",
        (op) => op.surface === "partner" && op.method === "GET" && op.normalizedPath.endsWith("/partner/patients/:patient_id"),
        (op) => op.surface === "partner" && op.method === "POST" && op.normalizedPath.endsWith("/partner/patients/search"),
        (op) => op.surface === "partner" && op.method === "PATCH" && op.normalizedPath === "/partner/patients/:patient_id",
      ],
      persistence:
        "Required local persistence: Cognito subject, MDI patient ID, onboarding/linkage status, timestamps, and non-PHI idempotency state if needed.",
      forbidden:
        "Forbidden local persistence: patient clinical profile payloads, source patient examples, SSN, questionnaire answers, clinical content, and PHI-heavy MDI response bodies.",
    },
    {
      ticket: "T-056",
      title: "MDI case creation + questionnaire submission without local answer retention",
      summary:
        "Use partner questionnaire and case endpoints to submit answers directly to MDI. Apoth may retain only MDI case/submission pointers and onboarding status.",
      selectors: [
        (op) => op.surface === "partner" && op.method === "POST" && op.normalizedPath === "/partner/cases",
        (op) => op.surface === "partner" && op.method === "GET" && op.normalizedPath === "/partner/cases/:case_id",
        (op) => op.surface === "partner" && op.normalizedPath === "/partner/cases/:case_id/questions",
        (op) => op.surface === "partner" && op.normalizedPath === "/partner/questionnaires",
        (op) => op.surface === "partner" && op.normalizedPath === "/partner/questionnaires/:questionnaire_id",
        (op) => op.surface === "partner" && op.normalizedPath === "/partner/questionnaires/:questionnaire_id/questions",
      ],
      persistence:
        "Required local persistence: MDI patient ID, MDI case ID, optional MDI submission/status pointer, idempotency key, onboarding status, and timestamps.",
      forbidden:
        "Forbidden local persistence: questionnaire answers, case question text/answers, clinical notes, medication directions, prescription/order details, or raw MDI case payloads.",
    },
    {
      ticket: "T-057",
      title: "MDI webhook receiver verification + idempotent serverless processing",
      summary:
        "Use webhook-surface examples to shape inbound event parsing. Receiver implementation must verify authenticity, redact logs, and process idempotently.",
      selectors: [(op) => op.surface === "webhook"],
      persistence:
        "Required local persistence: webhook event ID or deterministic idempotency key, event type, received/processed timestamps, processing status, and opaque patient/case IDs only when needed for routing.",
      forbidden:
        "Forbidden local persistence: raw webhook payloads, clinical note/message text, order details, prescription details, access links, metadata containing PHI, and payloads in Stripe metadata or logs.",
    },
  ].map((pack) => ({
    ...pack,
    operations: selectOperations(ops, pack.selectors),
  }));
}

function selectOperations(ops, selectors) {
  const selected = [];
  const seen = new Set();
  for (const selector of selectors) {
    for (const op of ops) {
      if (selector(op) && !seen.has(op.slug)) {
        seen.add(op.slug);
        selected.push(op);
      }
    }
  }
  return selected;
}

function renderPack(pack) {
  const rows = [
    `# ${pack.ticket}: ${pack.title}`,
    "",
    "Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative; use this pack as a retrieval guide, not as a replacement for source verification.",
    "",
    pack.summary,
    "",
    "## Endpoint Matrix",
    "",
    "| Operation | Method | Path | Surface | Ticket purpose | Required local persistence | Forbidden local persistence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const op of pack.operations) {
    rows.push(
      `| [${escapeTable(op.slug)}](../${escapeTable(op.operationFile)}) | ${escapeTable(op.method)} | ${escapeTable(op.normalizedPath)} | ${escapeTable(op.surface)} | ${escapeTable(pack.summary)} | ${escapeTable(pack.persistence)} | ${escapeTable(pack.forbidden)} |`,
    );
  }

  rows.push(
    "",
    "## Thin-PHI Notes",
    "",
    `- ${pack.persistence}`,
    `- ${pack.forbidden}`,
    "- Do not put PHI, clinical content, questionnaire answers, or MDI payload fragments in Stripe metadata or logs.",
    "- Prefer `partner` and `webhook` routes. Internal/admin/test/unknown routes are default-deny unless a future ticket explicitly justifies them.",
    "",
    "## Source Provenance",
    "",
  );

  for (const op of pack.operations) {
    rows.push(`- \`${op.slug}\`: ${op.folderPath.join(" / ")} / ${op.name}`);
  }

  return rows.join("\n") + "\n";
}

function surfaceCounts(ops) {
  return ops.reduce((counts, op) => {
    counts[op.surface] = (counts[op.surface] ?? 0) + 1;
    return counts;
  }, {});
}

function inlineList(values) {
  return values.length ? values.map((value) => `\`${value}\``).join(", ") : "`none`";
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function normalizePathForSlug(value) {
  return value.replace(/[{}:]/g, "").replace(/\//g, "-");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
