export const e2eAuthHeaderName = "x-apoth-e2e-auth";

export type E2eProtectedRouteBypassInput = {
  env?: Record<string, string | undefined>;
  headerValue?: string | null;
};

export function hasE2eProtectedRouteBypassConfig(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    env.NODE_ENV !== "production" &&
    env.APOTH_E2E_AUTH_ENABLED === "1" &&
    Boolean(env.APOTH_E2E_AUTH_TOKEN?.trim())
  );
}

export function allowsE2eProtectedRouteBypass(
  input: E2eProtectedRouteBypassInput = {},
) {
  const env = input.env ?? process.env;
  if (!hasE2eProtectedRouteBypassConfig(env)) {
    return false;
  }

  return input.headerValue === env.APOTH_E2E_AUTH_TOKEN?.trim();
}
