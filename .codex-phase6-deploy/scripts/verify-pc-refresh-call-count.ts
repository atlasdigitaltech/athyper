#!/usr/bin/env tsx
/**
 * PC Refresh Call-Count Guard (Phase 0 acceptance gate).
 *
 * Statically inspects pricing-component.service.ts and asserts each
 * exported mutator calls `refreshInvoiceCaches` AT MOST ONCE per
 * service entry. Catches the regression class fixed in Phase 0 where
 * `apportionToLines` looped `createComponent` (which has its own
 * refresh) and turned one user edit into N PIL cache rewrites.
 *
 * Rules
 *   - Each exported mutator may contain ≤ 1 `refreshInvoiceCaches(` call
 *   - `apportionToLines` MUST NOT call `createComponent(` or
 *     `createComponentRow(` (the loop is the bug; use bulk INSERT)
 *
 * This is a source-text static check — fast, no DB, runs in CI before
 * tests. It does not replace runtime drift checks (those live in
 * verify-pc-cache-consistency.ts).
 *
 * Usage:
 *   npx tsx server/scripts/verify-pc-refresh-call-count.ts
 *   npx tsx server/scripts/verify-pc-refresh-call-count.ts --json
 *
 * Exit:
 *   0 — all mutators within budget
 *   1 — at least one violation
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const JSON_OUTPUT = process.argv.includes("--json");

const __dirname    = dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = resolve(
  __dirname,
  "..",
  "packages",
  "services",
  "business",
  "ap",
  "pricing-component.service.ts",
);

interface Finding {
  fn:       string;
  rule:     string;
  expected: string;
  actual:   string;
}

function extractFunctionBody(source: string, header: RegExp): string | null {
  const match = source.match(header);
  if (!match || match.index == null) return null;
  const start = source.indexOf("{", match.index + match[0].length);
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  return null;
}

function countOccurrences(body: string, needle: string): number {
  let count = 0;
  let i = 0;
  while ((i = body.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

const MUTATORS: ReadonlyArray<{ name: string; header: RegExp; maxRefresh: number }> = [
  { name: "createComponent",       header: /export\s+async\s+function\s+createComponent\b/,       maxRefresh: 1 },
  { name: "supersedeComponent",    header: /export\s+async\s+function\s+supersedeComponent\b/,    maxRefresh: 1 },
  { name: "deleteComponent",       header: /export\s+async\s+function\s+deleteComponent\b/,       maxRefresh: 1 },
  { name: "updateComponentInPlace",header: /export\s+async\s+function\s+updateComponentInPlace\b/,maxRefresh: 1 },
  { name: "apportionToLines",      header: /export\s+async\s+function\s+apportionToLines\b/,      maxRefresh: 1 },
];

function main(): void {
  const source = readFileSync(SERVICE_PATH, "utf-8");
  const findings: Finding[] = [];

  for (const m of MUTATORS) {
    const body = extractFunctionBody(source, m.header);
    if (body == null) {
      findings.push({
        fn:       m.name,
        rule:     "function-found",
        expected: "function declared",
        actual:   "not found",
      });
      continue;
    }

    const refreshCount = countOccurrences(body, "refreshInvoiceCaches(");
    if (refreshCount > m.maxRefresh) {
      findings.push({
        fn:       m.name,
        rule:     "refresh-call-budget",
        expected: `<= ${m.maxRefresh} refreshInvoiceCaches(`,
        actual:   `${refreshCount} call(s)`,
      });
    }

    // apportionToLines specifically must not invoke createComponent or
    // createComponentRow — that would put a per-row refresh (or per-row
    // INSERT round-trip) inside the apportionment loop, which is exactly
    // what Phase 0 removed. Bulk INSERT is the only sanctioned path.
    if (m.name === "apportionToLines") {
      const createCount = countOccurrences(body, "createComponent(")
                        + countOccurrences(body, "createComponentRow(");
      if (createCount > 0) {
        findings.push({
          fn:       m.name,
          rule:     "no-per-row-create",
          expected: "0 calls to createComponent / createComponentRow",
          actual:   `${createCount} call(s) — use bulk INSERT`,
        });
      }
    }
  }

  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify({ findings }, null, 2) + "\n");
  } else if (findings.length === 0) {
    process.stdout.write("verify-pc-refresh-call-count: OK\n");
    for (const m of MUTATORS) {
      process.stdout.write(`  ${m.name.padEnd(24)} <= ${m.maxRefresh} refresh call(s)\n`);
    }
  } else {
    process.stderr.write(`verify-pc-refresh-call-count: ${findings.length} violation(s)\n`);
    for (const f of findings) {
      process.stderr.write(`  [${f.fn}] ${f.rule}\n`);
      process.stderr.write(`    expected: ${f.expected}\n`);
      process.stderr.write(`    actual:   ${f.actual}\n`);
    }
  }

  process.exit(findings.length === 0 ? 0 : 1);
}

main();
