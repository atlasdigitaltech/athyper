#!/usr/bin/env tsx
/**
 * Enforces bounded peer-dependency ranges for libraries where an unbounded
 * `>=N` would silently accept a future major version.
 *
 * Scope matches the approved M-3 remediation: `@tanstack/react-query`.
 * Expand BOUNDED_RANGE_REQUIRED deliberately — each addition will flag every
 * peer declaration in the workspace, so coordinate fixes before widening.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const BOUNDED_RANGE_REQUIRED = new Set<string>([
  "@tanstack/react-query",
]);

const UNBOUNDED_PATTERN = /^\s*>=?\s*\d+(\.\d+)*\s*$/;

const SCAN_ROOTS = ["apps", "packages", "server", "tooling"];
const IGNORE_DIR = new Set(["node_modules", ".next", "dist", ".turbo", "coverage", ".git"]);

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (IGNORE_DIR.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (name === "package.json") out.push(full);
  }
}

const files: string[] = [];
for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);

type Finding = { file: string; dep: string; range: string };
const findings: Finding[] = [];

for (const abs of files) {
  let pkg: { peerDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    continue;
  }
  const peers = pkg.peerDependencies ?? {};
  for (const [dep, range] of Object.entries(peers)) {
    if (!BOUNDED_RANGE_REQUIRED.has(dep)) continue;
    if (range.startsWith("workspace:")) continue;
    if (UNBOUNDED_PATTERN.test(range)) {
      findings.push({ file: relative(REPO_ROOT, abs), dep, range });
    }
  }
}

if (findings.length > 0) {
  console.error("Peer-range policy violations (must be bounded, e.g. '>=5 <6'):\n");
  for (const f of findings) {
    console.error(`  ${f.file}`);
    console.error(`    ${f.dep}: "${f.range}"`);
  }
  console.error(`\n${findings.length} violation(s). Replace open-ended '>=N' with bounded '>=N <N+1'.`);
  process.exit(1);
}

console.log(`Peer-range policy: OK (${files.length} package.json scanned, ${BOUNDED_RANGE_REQUIRED.size} lib(s) enforced).`);
