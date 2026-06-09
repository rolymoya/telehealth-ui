import { NextResponse, type NextRequest } from "next/server";
import { patientAccessCookieName } from "@/lib/auth/session-cookie";
import { isProtectedRoute } from "@/lib/auth";
import { signInRedirectFor } from "@/lib/onboarding-gates";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  if (request.cookies.has(patientAccessCookieName)) {
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
