#!/usr/bin/env tsx
/**
 * Verify GL Single Source — Phase 10
 *
 * Asserts that `ledger.upsert_gl_balance` is only called from
 * `server/packages/services/business/ledger/post-journal-gl.service.ts`
 * (the single-source GL helper per review finding R6 / docs/architecture/p2p.md §7).
 *
 * Implementation: read-only filesystem grep — no DB connection needed.
 *
 * Usage:
 *   npx tsx server/scripts/verify-gl-single-source.ts
 *   npx tsx server/scripts/verify-gl-single-source.ts --json
 *
 * Exit code:
 *   0 — only post-journal-gl.service.ts references upsert_gl_balance
 *   1 — at least one other call site found
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const JSON_OUTPUT = process.argv.includes("--json");

const REPO_ROOT       = process.cwd();
const SEARCH_ROOTS    = ["server/packages", "server/scripts", "apps", "packages"];
const ALLOWED_FILE    = "server/packages/services/business/ledger/post-journal-gl.service.ts";
const NEEDLE          = "upsert_gl_balance";
const SKIP_DIRECTORIES = new Set([
  "node_modules", "dist", ".next", ".turbo", "coverage", ".git",
]);
const FILE_EXTS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".sql"];

interface Hit {
  file:    string;
  line_no: number;
  text:    string;
}

function walk(dir: string, hits: Hit[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      walk(full, hits);
      continue;
    }
    if (!FILE_EXTS.some((ext) => entry.endsWith(ext))) continue;

    // The DDL file that defines the function and its security grant are
    // expected — they're the function's home schema, not call sites.
    const rel = relative(REPO_ROOT, full).split(sep).join("/");
    if (rel === "server/db/ddl/ledger/05_functions.sql")            continue;
    if (rel === "server/db/ddl/security/800_security_hardening.sql") continue;
    if (rel === "server/scripts/verify-gl-single-source.ts")        continue;
    if (rel === "docs/architecture/p2p.md")                         continue;

    let content;
    try { content = readFileSync(full, "utf8"); } catch { continue; }
    if (!content.includes(NEEDLE)) continue;

    const lines = content.split("\n");
    lines.forEach((text, i) => {
      if (text.includes(NEEDLE)) {
        hits.push({ file: rel, line_no: i + 1, text: text.trim() });
      }
    });
  }
}

function main(): void {
  const hits: Hit[] = [];
  for (const root of SEARCH_ROOTS) {
    const full = join(REPO_ROOT, root);
    try {
      if (statSync(full).isDirectory()) walk(full, hits);
    } catch { /* missing root — skip */ }
  }

  const violations = hits.filter((h) => h.file !== ALLOWED_FILE);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      ok:         violations.length === 0,
      allowed:    ALLOWED_FILE,
      total_hits: hits.length,
      violations,
    }, null, 2));
  } else {
    console.log(`Searched ${SEARCH_ROOTS.join(", ")} for '${NEEDLE}'`);
    console.log(`Total hits: ${hits.length}`);
    console.log(`Allowed file: ${ALLOWED_FILE}`);
    if (violations.length === 0) {
      console.log("✓ pass — single-source GL invariant holds");
    } else {
      console.error(`✗ FAIL — ${violations.length} unauthorised call site(s):`);
      for (const v of violations) {
        console.error(`  ${v.file}:${v.line_no}  ${v.text}`);
      }
    }
  }

  process.exit(violations.length === 0 ? 0 : 1);
}

main();
