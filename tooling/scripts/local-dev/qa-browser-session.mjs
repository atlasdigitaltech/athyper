import { validateSession } from "./qa-session.mjs";
/** Refresh an existing login through the normal BFF; never elevate assurance. */
export async function readQaBrowserSession(page, plane, actor) {
  const session = await page.evaluate(async () => {
    let response = await fetch("/api/auth/session");
    if (!response.ok)
      throw Error(`Session check failed: HTTP ${response.status}`);
    let current = await response.json();
    if (
      current.state === "authenticated" &&
      Date.parse(current.accessExpiresAt) < Date.now() + 60000
    ) {
      const raw = document.cookie
        .split("; ")
        .find((c) => c.startsWith("__Host-athyper-csrf="));
      if (!raw) throw Error("Session refresh requires a CSRF cookie");
      response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: {
          "x-csrf-token": decodeURIComponent(raw.slice(raw.indexOf("=") + 1)),
        },
      });
      if (!response.ok)
        throw Error(`Normal session refresh failed: HTTP ${response.status}`);
      response = await fetch("/api/auth/session");
      current = await response.json();
    }
    return current;
  });
  validateSession(session, plane, actor);
  return session;
}
