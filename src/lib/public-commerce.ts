export type PublicCatalogCode = "weight" | "hair" | "sexual-health";

export function checkoutHref(catalogCode: PublicCatalogCode) {
  return accountHref(`/checkout?product=${encodeURIComponent(catalogCode)}`);
}

export function accountHref(pathname: string) {
  const origin = canonicalOrigin(process.env.NEXT_PUBLIC_ACCOUNT_ORIGIN) ??
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:5173" : null);
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
