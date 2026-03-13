// Client-side cookie utilities.
// These functions manage cookies in the browser only.
// Server actions handle cookie updates on the server side.

export function setClientCookie(key: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  // When running under *.athyper.local (via Traefik), set domain=.athyper.local so the cookie
  // is readable on iam.mesh.athyper.local (Keycloak) — this is required for palette theming
  // on Keycloak login pages since they are a different subdomain from the app.
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const domain = hostname.endsWith(".athyper.local") ? "; domain=.athyper.local" : "";
  document.cookie = `${key}=${value}; expires=${expires}; path=/${domain}`;
}

export function getClientCookie(key: string) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${key}=`))
    ?.split("=")[1];
}

export function deleteClientCookie(key: string) {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const domain = hostname.endsWith(".athyper.local") ? "; domain=.athyper.local" : "";
  document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/${domain}`;
}
