/** Read the double-submit CSRF token from the __csrf cookie. */
export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : "";
}

/**
 * fetch() wrapper that automatically attaches X-CSRF-Token for mutating requests
 * and prepends the /api/relay prefix for backend relay calls.
 */
export async function relayMutate(
  path: string,
  options: RequestInit & { method: "POST" | "PATCH" | "PUT" | "DELETE" },
): Promise<Response> {
  const headers = new Headers(options.headers as HeadersInit | undefined);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-CSRF-Token", getCsrfToken());
  return fetch(`/api/relay${path}`, { ...options, headers });
}
