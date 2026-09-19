import path from "node:path";

/** README(.mdx) files become index pages, so directories get clean routes. */
export function stagedRelPath(relPath) {
  const dir = path.posix.dirname(relPath);
  const base = path.posix.basename(relPath);
  const match = /^readme(\.mdx?)$/i.exec(base);
  if (!match) return relPath;
  return dir === "." ? `index${match[1]}` : `${dir}/index${match[1]}`;
}

/** The site route a staged markdown file resolves to, e.g. "/business-workflows". */
export function toHref(relPath) {
  const staged = stagedRelPath(relPath).replace(/\.mdx?$/i, "");
  if (staged === "index") return "/";
  const withoutTrailingIndex = staged.replace(/(^|\/)index$/, "$1");
  return `/${withoutTrailingIndex.replace(/\/$/, "")}`;
}

export function toAssetHref(relPath) {
  return `/assets/${relPath}`;
}

const MD_LINK = /(!?\[[^\]]*\]\()([^)\s]+)(\))/g;

/**
 * Rewrites relative markdown links/images in `body` (a file at `relPath`,
 * relative to the docs/ root) using `resolve(targetRelPath, isMd)` to decide
 * the replacement href. `resolve` returns `null` to leave a link untouched.
 */
export function rewriteLinks(body, relPath, resolve) {
  const sourceDir = path.posix.dirname(relPath);
  return body.replace(MD_LINK, (full, prefix, target, suffix) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return full; // scheme (http:, mailto:, etc.)
    if (target.startsWith("/") || target.startsWith("#")) return full; // already site-absolute or anchor-only

    const [rawPath, ...anchorParts] = target.split("#");
    const anchor = anchorParts.length ? `#${anchorParts.join("#")}` : "";
    const resolvedRelPath = path.posix
      .normalize(path.posix.join(sourceDir, rawPath))
      .replace(/\/+$/, "");
    const isMd = /\.mdx?$/i.test(rawPath);

    const href = resolve(resolvedRelPath, isMd, relPath);
    if (href === null) return full;
    return `${prefix}${href}${anchor}${suffix}`;
  });
}
