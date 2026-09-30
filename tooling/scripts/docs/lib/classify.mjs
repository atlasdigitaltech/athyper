const CUSTOMER_PREFIX = "customer" + "/";

/** Any path segment literally named "internal" forces internal-only. */
export function isForcedInternal(relPath) {
  return relPath.split("/").some((segment) => segment === "internal");
}

export function isCustomer(relPath) {
  return relPath === "customer" || relPath.startsWith(CUSTOMER_PREFIX);
}

/**
 * Publication rules (see docs publishing plan):
 * - docs/customer/** is excluded from every target, unconditionally.
 * - Any **\/internal/** path is forced internal-only, regardless of its own
 *   frontmatter.
 * - target "external": eligible only when frontmatter audience === "public".
 * - target "internal": eligible for everything else (public implies
 *   internal; unset/"internal" audience defaults to internal).
 */
export function isEligible(relPath, frontmatterData, target) {
  if (isCustomer(relPath)) return false;

  if (target === "external") {
    if (isForcedInternal(relPath)) return false;
    return frontmatterData.audience === "public";
  }

  if (target === "internal") {
    return true;
  }

  throw new Error(`Unknown target: ${target}`);
}
