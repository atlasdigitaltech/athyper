import path from "node:path";
import { isCustomer, isForcedInternal } from "./classify.mjs";

// Generic filenames are too weak a signal on their own — "README.md" or
// "index.md" will legitimately appear inside unrelated evidence/log JSON.
// Only ever match on these as full relative paths, never as bare basenames.
const GENERIC_BASENAMES = new Set([
  "readme.md",
  "readme.mdx",
  "index.md",
  "index.mdx",
  "source-manifest.json",
]);

export function bannedTokens(docsFiles, target) {
  const tokens = new Set();

  for (const relPath of docsFiles) {
    if (isCustomer(relPath)) {
      tokens.add(relPath);
      const base = path.posix.basename(relPath);
      if (!GENERIC_BASENAMES.has(base.toLowerCase())) tokens.add(base);
    }
  }

  if (target === "external") {
    for (const relPath of docsFiles) {
      if (isForcedInternal(relPath)) {
        const base = path.posix.basename(relPath).replace(/\.mdx?$/i, "");
        if (!GENERIC_BASENAMES.has(base.toLowerCase())) tokens.add(base);
        tokens.add(relPath);
      }
    }
    tokens.add("server/db/ddl");
  }

  return [...tokens].filter(Boolean);
}
