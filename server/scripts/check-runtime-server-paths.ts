#!/usr/bin/env tsx
/**
 * Runtime Server Path Guard (warn mode initially; strict at T+60)
 *
 * Scans server/ and packages/ TypeScript sources for hand-rolled references
 * to the legacy upstream URLs that the runtime service rename targets.
 *
 * Forbidden literals (after Phase 2 of the rename ships):
 *   /api/records/                       — replaced by /api/runtime/v1/entities/
 *   /api/metadata/document-runtime/     — replaced by /api/runtime/v1/{lookups,bindings}/...
 *                                         and /api/runtime/v1/entities/[entity]/rules
 *
 * Intentionally NOT forbidden:
 *   /api/metadata/lookups/[domain]      — canonical, never moves (locked decision).
 *   /api/finance/ap/invoices/.../pricing-components — finance domain, out of scope.
 *
 * Allowlist (rationale below):
 *   - server/packages/services/records/**            : the legacy routes themselves
 *     until Phase 2 ships dispatch aliases.
 *   - server/packages/services/metadata/routes/document-runtime-registry.route.ts
 *     and lookup.route.ts: same — current canonical home of these handlers.
 *   - server/scripts/check-runtime-server-paths.ts   : self-reference.
 *   - docs/runtime-service-rename.md                 : design log carries the
 *     historical mapping table.
 *   - Test fixtures and recorded HTTP traces.
 *
 * Usage:
 *   tsx server/scripts/check-runtime-server-paths.ts            # warn mode (exit 0)
 *   tsx server/scripts/check-runtime-server-paths.ts --strict   # fail on any hit
 *
 * Wired into server/package.json as `runtime:server-path-check` once Phase 1
 * lands. Promoted to --strict inside `lint` at the T+60 sunset gate.
 */

import { promises as fs } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const SCAN_ROOTS = ["server", "packages"];
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
  { name: "records (legacy upstream)",          regex: /\/api\/records\b/ },
  { name: "document-runtime (legacy metadata)", regex: /\/api\/metadata\/document-runtime\b/ },
];

// Phase 1 (now): broad allowlist covers the legacy routes that will be
// retired in Phase 2 + the docs that reference them historically.
// At T+60, after Phase 4 deletes the legacy routes, prune this list to
// just the self-reference and the design log.
const ALLOW_FILES = new Set<string>([
  "server/scripts/check-runtime-server-paths.ts",
  "docs/runtime-service-rename.md",
  "docs/runtime-api-v1.md",
]);

const ALLOW_PREFIXES: readonly string[] = [
  // Records service. Many sub-resources (lines, distributions, lifecycle,
  // versions, action-dispatcher, bulk-*, business-partner-management,
  // supplier-intake, export, import, activity,
  // stream, attachments, sub-resource stubs) still mount under
  // /records/* and are out of scope for the current rename slice. Documentation
  // comments referencing /api/records/* in JSDoc remain as well. Narrow this
  // entry per directory as later slices migrate those endpoints.
  "server/packages/services/records/",
  // Other services that touch records as part of cross-service composition.
  // Phase 3b will migrate these; warn-only flags them today.
  // (Listed here for transparency; remove entries as Phase 3b cuts them over.)
  "server/packages/services/finance/",
  "server/packages/services/workflow/",
  "server/packages/services/jobs/",
  // Test fixtures and golden traces.
  "server/src/auth/__tests__/",
  // Client packages still calling /api/records/* through the BFF relay or
  // directly. Migration to runtimePath happens as a separate cleanup track —
  // see the Phase 0 discovery note in docs/runtime-service-rename.md.
  "packages/",
];

interface Hit {
  file: string;
  line: number;
  pattern: string;
  text: string;
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
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

function isAllowed(relPath: string): boolean {
  if (ALLOW_FILES.has(relPath)) return true;
  return ALLOW_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

async function main(): Promise<number> {
  const strict = process.argv.includes("--strict");
  const showAllowed = process.argv.includes("--include-allowed");
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    await walk(join(REPO_ROOT, root), files);
  }

  const hits: Hit[] = [];
  const suppressedCount = new Map<string, number>();

  for (const abs of files) {
    const rel = relative(REPO_ROOT, abs).replace(/\\/g, "/");
    const fileHits = await scanFile(abs, rel);
    if (fileHits.length === 0) continue;
    if (!showAllowed && isAllowed(rel)) {
      // Bucket suppressed hits by allowing-prefix so the warning summary
      // still surfaces them as a per-area count.
      const matchedPrefix = ALLOW_PREFIXES.find((p) => rel.startsWith(p)) ?? rel;
      suppressedCount.set(matchedPrefix, (suppressedCount.get(matchedPrefix) ?? 0) + fileHits.length);
      continue;
    }
    hits.push(...fileHits);
  }

  if (hits.length === 0 && suppressedCount.size === 0) {
    console.log("[runtime:server-path-check] OK — no legacy upstream paths found.");
    return 0;
  }

  if (suppressedCount.size > 0) {
    console.log("[runtime:server-path-check] suppressed (allow-listed):");
    for (const [area, count] of suppressedCount) {
      console.log(`  ${area.padEnd(60)} ${count} hit(s)`);
    }
    console.log(
      "[runtime:server-path-check] Use --include-allowed to print every suppressed line.",
    );
  }

  if (hits.length === 0) {
    return 0;
  }

  const label = strict ? "ERROR" : "WARN ";
  for (const hit of hits) {
    console.log(`[runtime:server-path-check] ${label} ${hit.file}:${hit.line}  (${hit.pattern})  ${hit.text}`);
  }
  console.log(
    `[runtime:server-path-check] ${hits.length} unsuppressed occurrence(s) of legacy upstream paths. ` +
    `Use runtimeServerPath.* from @athyper/api-contracts/runtime-server-paths once Phase 2 lands.`,
  );
  return strict ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((err: unknown) => {
  console.error("[runtime:server-path-check] fatal", err);
  process.exit(2);
});
