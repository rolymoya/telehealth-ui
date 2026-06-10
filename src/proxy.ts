import { NextResponse, type NextRequest } from "next/server";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";
import { isProtectedRoute } from "@/lib/auth";
import { e2eAuthHeaderName } from "@/lib/e2e-auth";
import { signInRedirectFor } from "@/lib/onboarding-gates";

export function proxy(
  request: NextRequest,
  env?: Record<string, string | undefined>,
) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  if (request.cookies.has(patientAccessCookieName)) {
    return NextResponse.next();
  }

  const e2eAuthEnabled = env?.APOTH_E2E_AUTH_ENABLED ?? process.env.APOTH_E2E_AUTH_ENABLED;
  const e2eAuthNodeEnv = env?.NODE_ENV ?? process.env.NODE_ENV;
  const e2eAuthToken = (env?.APOTH_E2E_AUTH_TOKEN ?? process.env.APOTH_E2E_AUTH_TOKEN)?.trim();
  if (
    e2eAuthNodeEnv !== "production" &&
    e2eAuthEnabled === "1" &&
    Boolean(e2eAuthToken) &&
    request.headers.get(e2eAuthHeaderName) === e2eAuthToken
  ) {
    return NextResponse.next();
  }

  const redirectUrl = new URL(signInRedirectFor(`${pathname}${search}`), request.url);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: [
    "/account/:path*",
    "/billing/:path*",
    "/dashboard/:path*",
    "/intake/:path*",
    "/onboarding/:path*",
  ],
};
