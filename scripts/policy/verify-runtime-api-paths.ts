#!/usr/bin/env tsx
// Forbids hand-rolled references to the legacy runtime API paths.
// Callers must use `runtimePath` from @athyper/api-contracts/runtime-paths.
//
// Usage:
//   pnpm policy:runtime-api-paths          (strict — fails on any hit)
//   tsx scripts/policy/verify-runtime-api-paths.ts          (warn mode, exit 0)
//   tsx scripts/policy/verify-runtime-api-paths.ts --strict (fail on any hit)
//
// Also invoked inline by apps/neon "lint" so Neon contributors get fast
// local feedback (Neon is the app most likely to introduce a regression).

import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCAN_ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".git",
]);
const FILE_EXT = new Set([".ts", ".tsx"]);

const FORBIDDEN_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "runtime-records",                regex: /\/api\/runtime-records\b/ },
  { name: "document-runtime",               regex: /\/api\/document-runtime\b/ },
  { name: "runtime-options",                regex: /\/api\/runtime-options\b/ },
  { name: "pricing-component/supersede",    regex: /\/api\/pricing-component\/supersede\b/ },
  { name: "runtime/entities (legacy stub)", regex: /\/api\/runtime\/entities\b/ },
];

const ALLOW_FILES = new Set<string>([
  // Self-reference: this file lists the legacy strings to forbid.
  "scripts/policy/verify-runtime-api-paths.ts",
  // Docs explain the migration mapping; historical strings expected.
  "docs/runtime-api-v1.md",
]);

// Deprecated package trees that we don't migrate. Legacy URL references
// inside them are tolerated; the trees themselves will be deleted in a
// future cleanup. Keep this list narrow so non-deprecated regressions
// still surface.
const ALLOW_PREFIXES: readonly string[] = [
  "packages/product-deprecated/runtime-ui/",
];

interface Hit {
  file: string;
  line: number;
  pattern: string;
  text: string;
}

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else {
      const dot = entry.name.lastIndexOf(".");
      const ext = dot >= 0 ? entry.name.slice(dot) : "";
      if (FILE_EXT.has(ext)) out.push(full);
    }
  }
}

async function scanFile(absPath: string, relPath: string): Promise<Hit[]> {
  const text = await fs.readFile(absPath, "utf8");
  const lines = text.split(/\r?\n/);
  const hits: Hit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const { name, regex } of FORBIDDEN_PATTERNS) {
      if (regex.test(line)) {
        hits.push({ file: relPath, line: i + 1, pattern: name, text: line.trim() });
      }
    }
  }
  return hits;
}

async function main(): Promise<number> {
  const strict = process.argv.includes("--strict");
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(REPO_ROOT, root);
    try {
      await walk(abs, files);
    } catch {
      // Root missing in some checkouts; ignore.
    }
  }

  const hits: Hit[] = [];
  for (const abs of files) {
    const rel = relative(REPO_ROOT, abs).replace(/\\/g, "/");
    if (ALLOW_FILES.has(rel)) continue;
    if (ALLOW_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
    hits.push(...(await scanFile(abs, rel)));
  }

  if (hits.length === 0) {
    console.log("[runtime-api-paths] OK — no legacy runtime API paths found.");
    return 0;
  }

  const label = strict ? "ERROR" : "WARN ";
  for (const hit of hits) {
    console.log(`[runtime-api-paths] ${label} ${hit.file}:${hit.line}  (${hit.pattern})  ${hit.text}`);
  }
  console.log(
    `[runtime-api-paths] ${hits.length} occurrence(s) of legacy runtime API paths. ` +
    `Use runtimePath.* from @athyper/api-contracts/runtime-paths instead.`,
  );
  return strict ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((err: unknown) => {
  console.error("[runtime-api-paths] fatal", err);
  process.exit(2);
});
