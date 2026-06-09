import { NextResponse, type NextRequest } from "next/server";
import {
  createAuthSessionCookie,
  createClearedAuthSessionCookie,
} from "@/lib/auth/session-cookie";
import { resolveCognitoAuthConfig } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const config = resolveCognitoAuthConfig(process.env);
  if (!config.ok) {
    return NextResponse.json({ error: config.error.code }, { status: 500 });
  }

  const body = await safeJson(request);
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
  const result = await createAuthSessionCookie({
    config: config.value,
    secure: process.env.NODE_ENV !== "development",
    token: accessToken,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error.code }, { status: 401 });
  }

  const response = NextResponse.json(result.value.response);
  response.cookies.set(result.value.cookie.name, result.value.cookie.value, {
    httpOnly: result.value.cookie.httpOnly,
    maxAge: result.value.cookie.maxAge,
    path: result.value.cookie.path,
    sameSite: result.value.cookie.sameSite,
    secure: result.value.cookie.secure,
  });
  return response;
}

export async function DELETE() {
  const cookie = createClearedAuthSessionCookie({
    secure: process.env.NODE_ENV !== "development",
  });
  const response = NextResponse.json({ status: "session_cleared" });
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    maxAge: cookie.maxAge,
    path: cookie.path,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
  });
  return response;
}

async function safeJson(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
