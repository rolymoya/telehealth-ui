import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getMdiAccessToken,
  refreshMdiAccessToken,
  resetMdiTokenCacheForTests,
  withMdiTokenRefreshRetry,
  type MdiAccessToken,
  type MdiTokenClientOptions,
} from "@/lib/mdi/token";
import { placeholderSecretPayload } from "@/lib/secrets/contracts";
import type { StartupSecretSource } from "@/lib/secrets/startup";

type FetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

function secretSource(payload = placeholderSecretPayload("staging", "mdiApi")): StartupSecretSource {
  return {
    async getSecretValue(kind) {
      return kind === "mdiApi" ? JSON.stringify(payload) : null;
    },
  };
}

function tokenResponse(accessToken: string, expiresIn = 3600): FetchResponse {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        access_token: accessToken,
        expires_in: expiresIn,
        token_type: "Bearer",
      };
    },
  };
}

function tokenOptions(fetchMock: ReturnType<typeof vi.fn>, nowMs = Date.parse("2026-06-10T12:00:00.000Z")) {
  return {
    allowFakeSecretValuesForTests: true,
    fetch: fetchMock as unknown as NonNullable<MdiTokenClientOptions["fetch"]>,
    now: () => new Date(nowMs),
    secretSource: secretSource(),
    stage: "staging" as const,
  };
}

describe("MDI token client", () => {
  beforeEach(() => {
    resetMdiTokenCacheForTests();
    vi.restoreAllMocks();
  });

  it("fetches once and reuses the token within one runtime", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse("mdi_access_token_001"));
    const getSecretValue = vi.fn(async (kind: "mdiApi") =>
      kind === "mdiApi" ? JSON.stringify(placeholderSecretPayload("staging", "mdiApi")) : null,
    );
    const options = {
      ...tokenOptions(fetchMock),
      secretSource: { getSecretValue },
    };

    const first = await getMdiAccessToken(options);
    const second = await getMdiAccessToken(options);

    expect(first).toEqual({
      ok: true,
      value: {
        accessToken: "mdi_access_token_001",
        apiBaseUrl: "https://example.invalid/mdi",
        expiresAtMs: Date.parse("2026-06-10T13:00:00.000Z"),
      },
    });
    expect(second).toEqual(first);
    expect(getSecretValue).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.invalid/mdi/partner/auth/token",
      expect.objectContaining({
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      }),
    );
  });

  it("deduplicates concurrent first token requests", async () => {
    let resolveResponse: (response: FetchResponse) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<FetchResponse>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const options = tokenOptions(fetchMock);

    const requests = [
      getMdiAccessToken(options),
      getMdiAccessToken(options),
      getMdiAccessToken(options),
    ];
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    resolveResponse(tokenResponse("mdi_access_token_concurrent"));

    await expect(Promise.all(requests)).resolves.toEqual([
      {
        ok: true,
        value: {
          accessToken: "mdi_access_token_concurrent",
          apiBaseUrl: "https://example.invalid/mdi",
          expiresAtMs: Date.parse("2026-06-10T13:00:00.000Z"),
        },
      },
      {
        ok: true,
        value: {
          accessToken: "mdi_access_token_concurrent",
          apiBaseUrl: "https://example.invalid/mdi",
          expiresAtMs: Date.parse("2026-06-10T13:00:00.000Z"),
        },
      },
      {
        ok: true,
        value: {
          accessToken: "mdi_access_token_concurrent",
          apiBaseUrl: "https://example.invalid/mdi",
          expiresAtMs: Date.parse("2026-06-10T13:00:00.000Z"),
        },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes near-expiry tokens before reuse", async () => {
    const startMs = Date.parse("2026-06-10T12:00:00.000Z");
    let nowMs = startMs;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("mdi_access_token_short", 120))
      .mockResolvedValueOnce(tokenResponse("mdi_access_token_refreshed", 3600));
    const options = {
      ...tokenOptions(fetchMock),
      now: () => new Date(nowMs),
    };

    await expect(getMdiAccessToken(options)).resolves.toMatchObject({
      ok: true,
      value: { accessToken: "mdi_access_token_short" },
    });

    nowMs = startMs + 61_000;

    await expect(getMdiAccessToken(options)).resolves.toMatchObject({
      ok: true,
      value: { accessToken: "mdi_access_token_refreshed" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("force refresh bypasses and replaces the cached token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("mdi_access_token_cached"))
      .mockResolvedValueOnce(tokenResponse("mdi_access_token_forced"));
    const options = tokenOptions(fetchMock);

    await getMdiAccessToken(options);
    const refreshed = await refreshMdiAccessToken(options);
    const reused = await getMdiAccessToken(options);

    expect(refreshed).toMatchObject({
      ok: true,
      value: { accessToken: "mdi_access_token_forced" },
    });
    expect(reused).toMatchObject({
      ok: true,
      value: { accessToken: "mdi_access_token_forced" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries exactly once with a forced refresh after a 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("mdi_access_token_initial"))
      .mockResolvedValueOnce(tokenResponse("mdi_access_token_retry"));
    const options = tokenOptions(fetchMock);
    const request = vi.fn(async (token: MdiAccessToken) => {
      if (token.accessToken === "mdi_access_token_initial") {
        return {
          ok: false as const,
          error: {
            code: "unauthorized",
            message: "Unauthorized",
            status: 401,
          },
        };
      }

      return { ok: true as const, value: "request-ok" };
    });

    await expect(withMdiTokenRefreshRetry(request, options)).resolves.toEqual({
      ok: true,
      value: "request-ok",
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails loudly and sanitized after a second 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("mdi_access_token_initial"))
      .mockResolvedValueOnce(tokenResponse("mdi_access_token_retry"));
    const options = tokenOptions(fetchMock);
    const request = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "unauthorized",
        message: "Unauthorized",
        status: 401,
      },
    }));

    const result = await withMdiTokenRefreshRetry(request, options);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "token_retry_failed",
        message: "MDI request remained unauthorized after token refresh",
        status: 401,
      },
    });
    expect(JSON.stringify(result)).not.toContain("mdi_access_token_initial");
    expect(JSON.stringify(result)).not.toContain("fake_mdi_client_secret");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("returns sanitized secret and provider errors", async () => {
    const missingSecret = await getMdiAccessToken({
      allowFakeSecretValuesForTests: true,
      fetch: vi.fn(),
      secretSource: { async getSecretValue() { return null; } },
      stage: "staging",
    });

    expect(missingSecret).toEqual({
      ok: false,
      error: {
        code: "missing_secret",
        message: "MDI API secret is missing",
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      async json() {
        return {
          access_token: "mdi_access_token_should_not_render",
          client_secret: "fake_mdi_client_secret",
        };
      },
    });
    const providerError = await getMdiAccessToken(tokenOptions(fetchMock));

    expect(providerError).toEqual({
      ok: false,
      error: {
        code: "token_request_failed",
        message: "MDI token request failed",
        status: 401,
      },
    });
    expect(JSON.stringify(providerError)).not.toContain("mdi_access_token_should_not_render");
    expect(JSON.stringify(providerError)).not.toContain("fake_mdi_client_secret");
  });

  it("uses explicit test stage instead of ambient environment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse("mdi_access_token_001"));
    const env = {
      APOTH_STAGE: "production",
    };

    const result = await getMdiAccessToken({
      ...tokenOptions(fetchMock),
      env,
      stage: "staging",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { accessToken: "mdi_access_token_001" },
    });
  });
});
