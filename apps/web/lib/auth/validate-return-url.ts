// lib/auth/validate-return-url.ts
//
// Validates a post-login returnUrl against safe route criteria.
//
// Rules:
//   - Reject absolute URLs (http://, https://, //) — prevents open redirects
//   - Reject /api/* paths — prevents redirect to API endpoints
//   - Reject /auth/* paths — prevents redirect back into the auth flow
//   - Accept all other relative paths (v4 uses flat route structure: /home, /master, etc.)
//
// Usage: call in the login route when first receiving returnUrl from user input.

export type ReturnUrlResult =
  | { valid: true; url: string }
  | { valid: false; reason: "not_internal" | "unsafe_path" };

/**
 * Validates a returnUrl for post-login redirect.
 *
 * @param returnUrl The candidate URL string (should be a relative path).
 * @returns ReturnUrlResult with a safe url, or invalid with reason.
 */
export function validateReturnUrl(returnUrl: string): ReturnUrlResult {
  // Reject absolute URLs — only internal relative paths are safe.
  if (
    returnUrl.startsWith("http://") ||
    returnUrl.startsWith("https://") ||
    returnUrl.startsWith("//")
  ) {
    return { valid: false, reason: "not_internal" };
  }

  // Normalise: ensure it starts with /
  const path = returnUrl.startsWith("/") ? returnUrl : `/${returnUrl}`;

  // Reject API and auth flow paths
  if (path.startsWith("/api/") || path.startsWith("/auth/")) {
    return { valid: false, reason: "unsafe_path" };
  }

  return { valid: true, url: path };
}

/**
 * Sanitise a returnUrl from an untrusted source (e.g. query param).
 * Returns the url unchanged if valid, or a safe fallback otherwise.
 */
export function sanitizeReturnUrl(returnUrl: string | null | undefined, fallback = "/home"): string {
  if (!returnUrl) return fallback;
  const result = validateReturnUrl(returnUrl);
  return result.valid ? result.url : fallback;
}
