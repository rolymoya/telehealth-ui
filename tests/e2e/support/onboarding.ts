import { expect, type Page, type Request, type Route } from "@playwright/test";

type ApiMockBody = Record<string, unknown> | unknown[] | string | null;

export type ApiMockResponse = {
  body?: ApiMockBody;
  headers?: Record<string, string>;
  status?: number;
};

export type ApiMockHandler = (
  request: Request,
) => ApiMockResponse | Promise<ApiMockResponse>;

export type ApiMockHandlers = Record<string, ApiMockHandler | ApiMockHandler[]>;

type ApiMockQueueEntry = {
  handler: ApiMockHandler;
  persistent: boolean;
};

const persistentApiMockHandler = Symbol("persistentApiMockHandler");

export type NetworkCapture = {
  method: string;
  path: string;
  requestBody: string;
  responseBody: string;
  status: number;
  url: string;
};

export type OnboardingNetworkGuard = {
  allowedExternalRequests: string[];
  captures: NetworkCapture[];
  consoleErrors: string[];
  expectNoForbiddenFragments: (fragments: readonly string[]) => Promise<void>;
  expectFragmentsConfined: (rules: readonly FragmentConfinementRule[]) => Promise<void>;
  expectNoNetworkViolations: () => void;
  requestUrls: string[];
  violations: string[];
};

export type FragmentConfinementRule = {
  allowedRequestBodies?: readonly string[];
  fragments: readonly string[];
  label: string;
};

export type OnboardingNetworkGuardOptions = {
  allowedMdiBootstrapResponseFragments?: readonly string[];
  allowedExternalOrigins?: readonly string[];
};

export function collectOnboardingConsoleErrors(page: Page) {
  const errors: string[] = [];

  function push(text: string) {
    if (
      text.includes("WebSocket connection to") &&
      text.includes("/_next/webpack-hmr") &&
      text.includes("failed")
    ) {
      return;
    }
    errors.push(text);
  }

  page.on("pageerror", (error) => push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      push(message.text());
    }
  });

  return errors;
}

export async function installOnboardingNetworkGuard(
  page: Page,
  handlers: ApiMockHandlers,
  options: OnboardingNetworkGuardOptions = {},
): Promise<OnboardingNetworkGuard> {
  const captures: NetworkCapture[] = [];
  const allowedExternalRequests: string[] = [];
  const requestUrls: string[] = [];
  const violations: string[] = [];
  const consoleErrors = collectOnboardingConsoleErrors(page);
  const queues = new Map<string, ApiMockQueueEntry[]>();

  for (const [key, value] of Object.entries(handlers)) {
    queues.set(key, (Array.isArray(value) ? value : [value]).map((handler) => ({
      handler,
      persistent: isPersistentApiMockHandler(handler),
    })));
  }

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requestUrls.push(request.url());

    if (!isLocalAppHost(url)) {
      if (options.allowedExternalOrigins?.includes(url.origin)) {
        allowedExternalRequests.push(request.url());
        await route.abort("blockedbyclient");
        return;
      }
      violations.push(`Blocked external network request to ${url.origin}${url.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }

    if (!url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }

    const method = request.method().toUpperCase();
    const key = `${method} ${url.pathname}`;
    const queue = queues.get(key);
    const entry = queue?.[0];
    const handler = entry?.handler;
    const requestBody = request.postData() ?? "";

    if (!handler) {
      violations.push(`Unmocked API request: ${key}`);
      captures.push({
        method,
        path: url.pathname,
        requestBody,
        responseBody: "",
        status: 599,
        url: request.url(),
      });
      await route.abort("blockedbyclient");
      return;
    }

    if (!entry.persistent) {
      queue?.shift();
    }
    await fulfillApiMock(route, request, handler, captures);
  });

  return {
    allowedExternalRequests,
    captures,
    consoleErrors,
    expectNoForbiddenFragments: async (fragments) => {
      const storageText = await readBrowserStorageText(page);
      const scanned = [
        ...captures.flatMap((capture) => {
          const requestAllowed = capture.method === "POST" &&
            capture.path === "/api/onboarding/mdi/submit";
          const responseBody = capture.method === "GET" &&
              capture.path === "/api/onboarding/mdi/bootstrap"
            ? redactAllowedMdiBootstrapQuestionnaireOptions(
              capture.responseBody,
              options.allowedMdiBootstrapResponseFragments ?? [],
            )
            : capture.responseBody;
          return [
            `request url ${capture.method} ${capture.path}`,
            capture.url,
            ...(requestAllowed
              ? []
              : [`request ${capture.method} ${capture.path}`, capture.requestBody]),
            `response ${capture.method} ${capture.path}`,
            responseBody,
          ];
        }),
        ...requestUrls.flatMap((url) => ["request url", url]),
        "browser storage",
        storageText,
        ...consoleErrors.flatMap((error) => ["console error", error]),
      ];

      expect(findForbiddenFragments(scanned, fragments)).toEqual([]);
    },
    expectFragmentsConfined: async (rules) => {
      const storageText = await readBrowserStorageText(page);
      const findings: string[] = [];

      for (const rule of rules) {
        const allowedRequestBodies = new Set(rule.allowedRequestBodies ?? []);
        const scanned = [
          ...captures.flatMap((capture) => {
            const requestKey = `${capture.method} ${capture.path}`;
            const responseBody = capture.method === "GET" &&
                capture.path === "/api/onboarding/mdi/bootstrap"
              ? redactAllowedMdiBootstrapQuestionnaireOptions(
                capture.responseBody,
                options.allowedMdiBootstrapResponseFragments ?? [],
              )
              : capture.responseBody;
            return [
              `request url ${requestKey}`,
              capture.url,
              ...(allowedRequestBodies.has(requestKey)
                ? []
                : [`request ${requestKey}`, capture.requestBody]),
              `response ${requestKey}`,
              responseBody,
            ];
          }),
          ...requestUrls.flatMap((url) => ["request url", url]),
          "browser storage",
          storageText,
          ...consoleErrors.flatMap((error) => ["console error", error]),
        ];
        findings.push(
          ...findForbiddenFragments(scanned, rule.fragments)
            .map((finding) => `${rule.label}: ${finding}`),
        );
      }

      expect(findings).toEqual([]);
    },
    expectNoNetworkViolations: () => {
      expect(violations).toEqual([]);
    },
    requestUrls,
    violations,
  };
}

function redactAllowedMdiBootstrapQuestionnaireOptions(
  value: string,
  fragments: readonly string[],
) {
  const allowed = new Set(fragments);
  if (allowed.size === 0) {
    return value;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return value;
  }

  if (!isRecord(parsed) || !isRecord(parsed.questionnaire)) {
    return value;
  }

  const questions = parsed.questionnaire.questions;
  if (!Array.isArray(questions)) {
    return value;
  }

  for (const question of questions) {
    if (!isRecord(question) || !Array.isArray(question.options)) {
      continue;
    }
    for (const option of question.options) {
      if (!isRecord(option)) {
        continue;
      }
      if (typeof option.label === "string" && allowed.has(option.label)) {
        option.label = "[allowed-bootstrap-option-label]";
      }
      if (typeof option.optionId === "string" && allowed.has(option.optionId)) {
        option.optionId = "[allowed-bootstrap-option-id]";
      }
    }
  }

  return JSON.stringify(parsed);
}

export function jsonApi(body: ApiMockBody, status = 200): ApiMockResponse {
  return {
    body,
    status,
  };
}

export function persistentApiMock(handler: ApiMockHandler): ApiMockHandler {
  return Object.assign(handler, { [persistentApiMockHandler]: true });
}

export function expectNoBillingOrStripeActivity(captures: readonly NetworkCapture[]) {
  const activity = captures.filter((capture) => {
    const text = `${capture.method} ${capture.path} ${capture.requestBody} ${capture.responseBody}`
      .toLowerCase();
    return /stripe|checkout|metadata|billing/.test(text);
  });

  expect(activity).toEqual([]);
}

export async function expectNoFragmentsInBrowserStorage(
  page: Page,
  fragments: readonly string[],
) {
  const storageText = await readBrowserStorageText(page);

  expect(findForbiddenFragments(["browser storage", storageText], fragments))
    .toEqual([]);
}

async function fulfillApiMock(
  route: Route,
  request: Request,
  handler: ApiMockHandler,
  captures: NetworkCapture[],
) {
  const url = new URL(request.url());
  const method = request.method().toUpperCase();
  const requestBody = request.postData() ?? "";
  const response = await handler(request);
  const status = response.status ?? 200;
  const responseBody = response.body === undefined ? {} : response.body;
  const serialized = typeof responseBody === "string"
    ? responseBody
    : JSON.stringify(responseBody);

  captures.push({
    method,
    path: url.pathname,
    requestBody,
    responseBody: serialized,
    status,
    url: request.url(),
  });

  await route.fulfill({
    body: serialized,
    headers: {
      "content-type": "application/json",
      ...(response.headers ?? {}),
    },
    status,
  });
}

function findForbiddenFragments(
  values: readonly string[],
  fragments: readonly string[],
) {
  const findings: string[] = [];
  for (let index = 0; index < values.length; index += 2) {
    const label = values[index] ?? "value";
    const value = values[index + 1] ?? "";
    for (const fragment of fragments) {
      if (fragment && value.includes(fragment)) {
        findings.push(`${label} contained ${fragment}`);
      }
    }
  }
  return findings;
}

async function readBrowserStorageText(page: Page) {
  return page.evaluate(async () => {
    function storageEntries(storage: Storage) {
      return Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) ?? "";
        return [key, storage.getItem(key)];
      });
    }

    const indexedDBDatabases = "databases" in indexedDB
      ? await indexedDB.databases()
      : [];
    const indexedDBContents = await Promise.all(
      indexedDBDatabases.map(async (database) => {
        if (!database.name) {
          return { name: "", stores: [] };
        }
        return {
          name: database.name,
          stores: await readIndexedDBDatabase(database.name),
        };
      }),
    );

    return JSON.stringify({
      indexedDB: indexedDBContents,
      localStorage: storageEntries(localStorage),
      sessionStorage: storageEntries(sessionStorage),
    });

    async function readIndexedDBDatabase(name: string) {
      return new Promise((resolve) => {
        const request = indexedDB.open(name);
        request.onerror = () => resolve([{ error: "open_failed" }]);
        request.onsuccess = () => {
          const db = request.result;
          const storeNames = Array.from(db.objectStoreNames);
          if (storeNames.length === 0) {
            db.close();
            resolve([]);
            return;
          }

          const transaction = db.transaction(storeNames, "readonly");
          const reads = storeNames.map((storeName) => new Promise((storeResolve) => {
            const storeRequest = transaction.objectStore(storeName).getAll();
            storeRequest.onerror = () => storeResolve({
              error: "read_failed",
              name: storeName,
            });
            storeRequest.onsuccess = () => storeResolve({
              name: storeName,
              values: storeRequest.result,
            });
          }));

          Promise.all(reads).then((stores) => {
            db.close();
            resolve(stores);
          }).catch(() => {
            db.close();
            resolve([{ error: "read_failed" }]);
          });
        };
      });
    }
  });
}

function isLocalAppHost(url: URL) {
  return (
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPersistentApiMockHandler(
  handler: ApiMockHandler,
): handler is ApiMockHandler & { [persistentApiMockHandler]: true } {
  return persistentApiMockHandler in handler;
}
