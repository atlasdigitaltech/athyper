import { readFileSync } from "node:fs";

export function storageStateHasAuthenticatedSession(
  path: string,
  expectedOrigin?: string,
): boolean {
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as {
      cookies?: Array<{
        name?: unknown;
        value?: unknown;
        domain?: unknown;
        expires?: unknown;
      }>;
    };
    const expectedHost = expectedOrigin
      ? new URL(expectedOrigin).hostname
      : undefined;
    const nowSeconds = Date.now() / 1_000;
    return Boolean(
      state.cookies?.some(({ name, value, domain, expires }) => {
        if (
          (name !== "athyper-session" && name !== "__Host-athyper-session") ||
          typeof value !== "string" ||
          !value
        )
          return false;
        if (
          typeof expires === "number" &&
          expires !== -1 &&
          expires <= nowSeconds
        )
          return false;
        if (!expectedHost) return true;
        if (typeof domain !== "string" || !domain) return false;
        const cookieHost = domain.replace(/^\./, "");
        return (
          expectedHost === cookieHost || expectedHost.endsWith(`.${cookieHost}`)
        );
      }),
    );
  } catch {
    return false;
  }
}
