#!/usr/bin/env tsx
/**
 * tsconfig policy checks. Scope matches the approved audit:
 *
 *   - [casing] moduleResolution must be the lowercase canonical form
 *             ("bundler" not "Bundler"). TS accepts both at runtime, but
 *             the repo standardizes on lowercase for consistency.
 *   - [strictness] strictness-class options must not be disabled per package.
 *   - [extends] workspace tsconfigs must extend a shared base config.
 *
 * Notes on intentional divergences (not flagged):
 *   - server/tsconfig.json uses NodeNext directly (sub-monorepo, separate resolution).
 *   - packages/shared/config/* are the shared bases themselves.
 *   - Casing on `module` / `target` is left to the TS schema's mixed-case
 *     conventions ("ESNext", "ES2022") — both are canonical.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

type TsConfig = {
  extends?: string | string[];
  compilerOptions?: Record<string, unknown>;
};

// moduleResolution canonical lowercase forms. If a file's value lowercases
// to any of these but isn't *exactly* one of these, it's a casing drift.
const MODULE_RESOLUTION_LOWERCASE = new Set([
  "bundler",
  "classic",
  "node",
  "node10",
  "node16",
  "nodenext",
]);

const STRICT_OPTIONS_FORBIDDEN_FALSE = [
  "strict",
  "noUncheckedIndexedAccess",
  "noImplicitOverride",
  "forceConsistentCasingInFileNames",
];

const SCAN_ROOTS = ["apps", "packages", "server", "tooling"];
const IGNORE_DIR = new Set(["node_modules", ".next", "dist", ".turbo", "coverage", ".git"]);
const TSCONFIG_RE = /^tsconfig(\.[\w.-]+)?\.json$/;

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
    else if (TSCONFIG_RE.test(name)) out.push(full);
  }
}

const files: string[] = [];
for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
files.push(join(REPO_ROOT, "tsconfig.json"));

function isSharedBaseOrIndependent(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/");
  return (
    norm === "tsconfig.json" ||
    norm.startsWith("tooling/tsconfig/") ||
    norm.startsWith("packages/shared/config/") ||
    norm === "server/tsconfig.json"
  );
}

// String-aware JSONC comment stripper — only trips on comments outside of strings.
function stripJsonComments(raw: string): string {
  let out = "";
  let i = 0;
  let inString: '"' | "'" | null = null;
  while (i < raw.length) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < raw.length) {
        out += raw[i + 1];
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch as '"' | "'";
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < raw.length && raw[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  // Strip trailing commas
  return out.replace(/,(\s*[}\]])/g, "$1");
}

function parseTsConfig(raw: string): TsConfig {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(stripJsonComments(raw));
  }
}

const errors: string[] = [];

for (const abs of files) {
  const rel = relative(REPO_ROOT, abs).replace(/\\/g, "/");
  let raw: string;
  try {
    raw = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  let json: TsConfig;
  try {
    json = parseTsConfig(raw);
  } catch (e) {
    errors.push(`${rel}: invalid JSON (${(e as Error).message})`);
    continue;
  }

  const opts = json.compilerOptions ?? {};

  // Rule 1: moduleResolution canonical lowercase form
  const mr = opts.moduleResolution;
  if (typeof mr === "string") {
    const lower = mr.toLowerCase();
    if (MODULE_RESOLUTION_LOWERCASE.has(lower) && mr !== lower) {
      errors.push(
        `${rel}: [casing] compilerOptions.moduleResolution = "${mr}" — use lowercase "${lower}" for consistency`,
      );
    }
  }

  // Rule 2: strictness options must not be disabled at the package level
  for (const key of STRICT_OPTIONS_FORBIDDEN_FALSE) {
    if (opts[key] === false) {
      errors.push(
        `${rel}: [strictness] compilerOptions.${key} = false — strictness options must not be disabled at the package level`,
      );
    }
  }

  // Rule 3: workspace tsconfig.json must extend a shared base
  const isWorkspaceEntry = /^(apps|packages|server)\/.+\/tsconfig\.json$/.test(rel);
  if (isWorkspaceEntry && !isSharedBaseOrIndependent(rel)) {
    const ext = json.extends;
    const list = Array.isArray(ext) ? ext : ext ? [ext] : [];
    const ok = list.some(
      (e) =>
        e.includes("@athyper/config") ||
        e.includes("@athyper/tsconfig") ||
        e.includes("tooling/tsconfig"),
    );
    if (!ok) {
      errors.push(
        `${rel}: [extends] tsconfig.json must extend @athyper/config (or @athyper/tsconfig). Got: ${JSON.stringify(ext ?? null)}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("tsconfig policy violations:\n");
  for (const e of errors) console.error(`  ${e}`);
  console.error(`\n${errors.length} violation(s).`);
  process.exit(1);
}

console.log(`tsconfig policy: OK (${files.length} file(s) scanned).`);
