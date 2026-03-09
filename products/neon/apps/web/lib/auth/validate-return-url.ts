// lib/auth/validate-return-url.ts
//
// Validates a post-login returnUrl against a strict allowlist of safe route families.
//
// Approved families:
//   /wb/{wb}/...   — workbench-scoped routes (entitlement check against allowedWorkbenches)
//   /workspace     — always safe (workspace chooser/switcher)
//
// Everything else is rejected. On rejection the caller falls through to /auth/resolving
// rather than returning an access-denied error to the user.

import { isWorkbench, type Workbench } from "./types";

export type ReturnUrlResult =
  | { valid: true; workbench: Workbench | null; url: string }
  | {
      valid: false;
      reason: "not_internal" | "unsafe_family" | "entitlement_denied";
    };

/**
 * Validates a returnUrl for post-login redirect.
 *
 * @param returnUrl          The candidate URL string (should be a relative path).
 * @param allowedWorkbenches The workbenches the authenticated user is entitled to.
 * @returns ReturnUrlResult  Valid result with parsed workbench, or invalid with reason.
 */
export function validateReturnUrl(
  returnUrl: string,
  allowedWorkbenches: Workbench[],
): ReturnUrlResult {
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

  // ── /workspace — always safe ──────────────────────────────────
  if (path === "/workspace" || path.startsWith("/workspace?")) {
    return { valid: true, workbench: null, url: returnUrl };
  }

  // ── /wb/{wb}/... — workbench-scoped route ────────────────────
  if (path.startsWith("/wb/")) {
    // Expected shape: /wb/{wb}/...
    const parts = path.split("/"); // ["", "wb", wbSlug, ...]
    const wbSlug = parts[2];

    if (!wbSlug || !isWorkbench(wbSlug)) {
      return { valid: false, reason: "unsafe_family" };
    }

    if (!allowedWorkbenches.includes(wbSlug)) {
      return { valid: false, reason: "entitlement_denied" };
    }

    return { valid: true, workbench: wbSlug, url: returnUrl };
  }

  // All other paths are not in the approved set.
  return { valid: false, reason: "unsafe_family" };
}
