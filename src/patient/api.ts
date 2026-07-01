export type ApiResult<T> =
  | { ok: true; value: T; response: Response }
  | { ok: false; error: string; response?: Response };

export async function apiJson<T>(
  path: `/api/${string}`,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      accept: "application/json",
      ...init.headers,
    },
  }).catch(() => null);
  if (!response) {
    return { ok: false, error: "network_unavailable" };
  }
  if (!response.ok) {
    const body = await safeJson(response);
    return {
      ok: false,
      error: typeof body.error === "string"
        ? body.error
        : typeof body.code === "string"
          ? body.code
          : "request_failed",
      response,
    };
  }
  return {
    ok: true,
    response,
    value: await safeJson(response) as T,
  };
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await response.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
