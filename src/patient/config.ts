export type PublicPatientConfig = {
  cognitoRegion: string;
  marketingOrigin: string;
  userPoolClientId: string;
  userPoolId: string;
};

export function publicPatientConfig(): PublicPatientConfig {
  return {
    cognitoRegion: import.meta.env.VITE_COGNITO_REGION ?? "",
    marketingOrigin: canonicalOrigin(import.meta.env.VITE_MARKETING_ORIGIN) ??
      (import.meta.env.DEV ? "http://127.0.0.1:3000" : ""),
    userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID ?? "",
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "",
  };
}

export function marketingHref(pathname: string) {
  const origin = publicPatientConfig().marketingOrigin;
  return origin ? new URL(pathname, origin).toString() : pathname;
}

function canonicalOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return (url.protocol === "https:" || (local && url.protocol === "http:")) &&
      url.username === "" && url.password === ""
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
