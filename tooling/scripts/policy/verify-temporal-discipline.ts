#!/usr/bin/env tsx
/**
 * Temporal discipline (policy gate)
 *
 * Bans direct date-parsing primitives outside @athyper/platform-temporal. The whole
 * point of the temporal package is that ONE place owns the choice of "how do
 * we interpret this string as a moment in time" â€” every other call site
 * delegates so a silent fix in temporal heals the whole repo.
 *
 * Banned patterns (outside the allowlist):
 *   - new Date("â€¦")     // string-literal parsing â€” silent TZ traps
 *   - new Date('â€¦')
 *   - new Date(`â€¦`)
 *   - Date.parse(â€¦)
 *
 * Allowlist:
 *   - packages/platform/foundation/temporal/**              (the owner)
 *   - **\/__tests__/**                      (test fixtures)
 *   - **\/*.test.ts(x)?                     (test files)
 *   - **\/*.spec.ts(x)?
 *   - node_modules/.*
 *
 * Escape hatch:
 *   - Add `// eslint-disable-next-line no-direct-date-parse -- reason: â€¦`
 *     above the line. The token must be on the line and include the word "reason:".
 *     Reviewers MUST sign off on every escape.
 *
 * Usage:
 *   npx tsx tooling/scripts/policy/verify-temporal-discipline.ts
 *
 * Exit code:
 *   0 â€” no violations
 *   1 â€” at least one violation outside allowlist (CI red)
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error -- shared ESM policy helper, untyped by design.
import {
  compareToRatchet,
  describeImprovements,
  describeRegressions,
  loadRatchet,
  renderRatchet,
  writeRatchet,
} from "./violation-ratchet.mjs";

const RATCHET_PATH =
  "governance/config/governance/temporal-discipline-ratchet.json";
const UPDATE_COMMAND = "pnpm policy:temporal-discipline --update-ratchet";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const QUIET = process.argv.includes("--quiet");

const SCAN_ROOTS = ["apps", "packages", "server"] as const;

const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);
// Alternate Next.js distDir outputs (.next-bp-consolidated and friends) are
// generated, exactly like .next/, and .gitignore already treats them as such.
const ignoredDir = (name: string) =>
  IGNORE_DIRS.has(name) || name.startsWith(".next-");

const ALLOWLIST = [
  /^packages\/platform\/foundation\/temporal\//,
  /\/__tests__\//,
  /\.(test|spec)\.(ts|tsx|mts|cts)$/,
  /^packages\/product-deprecated\//, // legacy code, frozen for reference per project policy
] as const;

interface Rule {
  name: string;
  pattern: RegExp;
  description: string;
}

const RULES: Rule[] = [
  {
    name: "new-date-string-literal",
    pattern: /\bnew\s+Date\s*\(\s*(["'`])/g,
    description:
      "new Date('string') parsing is timezone-ambiguous. Use parseInstant / parseBusinessDate from @athyper/platform-temporal.",
  },
  {
    name: "date-parse",
    pattern: /\bDate\s*\.\s*parse\s*\(/g,
    description:
      "Date.parse() is timezone-ambiguous. Use parseInstant / parseBusinessDate from @athyper/platform-temporal.",
  },
];

interface Finding {
  file: string;
  line: number;
  column: number;
  match: string;
  rule: Rule;
}

function toRepoPath(path: string): string {
  return relative(ROOT, path).replace(/\\/g, "/");
}

function isAllowlisted(file: string): boolean {
  return ALLOWLIST.some((p) => p.test(file));
}

function extensionOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i);
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDir(entry.name)) walk(join(dir, entry.name), out);
      continue;
    }
    const file = join(dir, entry.name);
    if (FILE_EXTENSIONS.has(extensionOf(file))) out.push(file);
  }
  return out;
}

function lineColumnFor(
  content: string,
  index: number,
): { line: number; column: number } {
  const before = content.slice(0, index);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: lines[lines.length - 1]!.length + 1 };
}

function hasReasonedDisable(content: string, lineNumber: number): boolean {
  const lines = content.split(/\r?\n/);
  const prev = lines[lineNumber - 2] ?? "";
  return /no-direct-date-parse[^\n]*reason\s*:/.test(prev);
}

function scanFile(file: string): Finding[] {
  const content = readFileSync(file, "utf8");
  const findings: Finding[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(content)) !== null) {
      const { line, column } = lineColumnFor(content, m.index);
      if (hasReasonedDisable(content, line)) continue;
      findings.push({
        file: toRepoPath(file),
        line,
        column,
        match: m[0],
        rule,
      });
    }
  }
  return findings;
}

function main(): void {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(ROOT, root), files);

  const violations: Finding[] = [];
  for (const file of files) {
    const repoPath = toRepoPath(file);
    if (isAllowlisted(repoPath)) continue;
    violations.push(...scanFile(file));
  }

  if (violations.length === 0) {
    if (!QUIET)
      console.log(
        `temporal-discipline OK â€” scanned ${files.length} files, 0 violations.`,
      );
    return;
  }

  const ratchetPath = join(ROOT, RATCHET_PATH);
  const violationFiles = violations.map((v) => v.file);

  if (process.argv.includes("--update-ratchet")) {
    writeRatchet(
      ratchetPath,
      renderRatchet(
        "policy:temporal-discipline",
        violationFiles,
        "Direct Date parsing predating @athyper/platform-temporal. Fix down; never up.",
      ),
    );
    console.log(
      `Wrote ${RATCHET_PATH}: ${violations.length} violation(s) across ${new Set(violationFiles).size} file(s).`,
    );
    return;
  }

  // The full report always prints, ratcheted or not: debt stays visible.
  console.error(`temporal-discipline — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(
      `  ${v.file}:${v.line}:${v.column}  ${v.rule.name}  ${v.match.trim()}`,
    );
  }
  console.error(
    "\nFix by importing from @athyper/platform-temporal (parseInstant / parseBusinessDate).",
  );
  console.error(
    "If genuinely unavoidable, suppress with: // eslint-disable-next-line no-direct-date-parse -- reason: <why>",
  );

  const comparison = compareToRatchet(loadRatchet(ratchetPath), violationFiles);
  const regressions = describeRegressions(
    "Temporal-discipline violations",
    comparison,
    UPDATE_COMMAND,
  );
  if (regressions) {
    console.error("\n" + regressions);
    process.exit(1);
  }
  const improvements = describeImprovements(comparison, UPDATE_COMMAND);
  if (improvements) console.log(improvements);
  console.log(
    `temporal-discipline passed the ratchet: ${violations.length} known violation(s), none new.`,
  );
}

main();
