// Replaced by the web bundler; this browser module needs no Node runtime types.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** Match the auth runtime's session-cookie namespace; never use another mode's token. */
export function readCsrfCookie(cookieHeader: string, production: boolean): string | undefined {
  const prefix = `${production ? "__Host-" : ""}athyper-csrf=`;
  const value = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(prefix))?.slice(prefix.length);
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return undefined; }
}

export function readBrowserCsrfToken(): string | undefined {
  return typeof document === "undefined" ? undefined
    : readCsrfCookie(document.cookie, process.env.NODE_ENV === "production");
}
