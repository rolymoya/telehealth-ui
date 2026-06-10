export const patientAccessCookieName = "__Host-apoth_access";

export const patientAccessCookieAttributes = {
  httpOnly: true,
  path: "/",
  sameSite: "Lax",
  secure: true,
} as const;

export function parseCookieHeader(header: string | undefined) {
  const cookies = new Map<string, string>();
  if (!header) {
    return cookies;
  }
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) {
      continue;
    }
    const value = decodeCookieValue(rawValue.join("="));
    if (value !== null) {
      cookies.set(rawName, value);
    }
  }
  return cookies;
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function authSessionSetCookieHeader(input: {
  maxAge: number;
  value: string;
}) {
  return [
    `${patientAccessCookieName}=${encodeURIComponent(input.value)}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(input.maxAge))}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}
