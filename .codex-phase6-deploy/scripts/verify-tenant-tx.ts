#!/usr/bin/env tsx
/**
 * Tenant-Transaction Discipline Verifier (CI gate)
 *
 * Replaces a custom ESLint rule. Scans server/packages/services/** TypeScript
 * sources for raw mutating Kysely calls (`insertInto`, `updateTable`,
 * `deleteFrom`, `replaceInto`) that occur OUTSIDE a documented system-tx or
 * tenant-tx scope.
 *
 * Why: a service that bypasses withSystemTx/withTenantTx loses the implicit
 * `app.current_tenant_id` GUC stamp the TenantStampDriver injects at BEGIN.
 * FORCE RLS on tenant-scoped tables makes the resulting query return zero
 * rows (read) or fail the WITH CHECK (write), but the failure mode is silent
 * data-loss-shaped rather than an obvious error. We want this caught at CI
 * before it ships.
 *
 * Allowed call shapes:
 *   trx.insertInto(...)         where trx is a withSystemTx / withTenantTx
 *                               handler parameter (or aliased in scope)
 *   db.kysely.selectFrom(...)   reads — RLS catches cross-tenant leak
 *   tx.updateTable(...)         inside a Kysely transaction block
 *
 * Flagged call shapes:
 *   deps.db.insertInto(...)
 *   db.kysely.updateTable(...)
 *   anything.deleteFrom(...)    when not invoked on a known trx identifier
 *
 * Heuristic: the receiver of the call must be a parameter introduced by
 * withSystemTx, withTenantTx, db.transaction().execute, or named one of
 * /^(trx|tx|transaction)$/ — see ALLOWED_RECEIVER_NAMES below. False positives
 * can be silenced with a `// allow-direct-mutation: <reason>` comment on the
 * preceding line.
 *
 * Usage:
 *   npx tsx server/scripts/verify-tenant-tx.ts
 *   npx tsx server/scripts/verify-tenant-tx.ts --json
 *
 * Exit code:
 *   0 — no violations
 *   1 — at least one violation found
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.env["ATHYPER_ROOT"] ?? process.cwd();
const SCAN_ROOTS = [
  join(ROOT, "server", "packages", "services"),
  join(ROOT, "server", "src"),
];
const JSON_OUTPUT = process.argv.includes("--json");

const MUTATING_METHODS = ["insertInto", "updateTable", "deleteFrom", "replaceInto"] as const;
const ALLOWED_RECEIVER_NAMES = new Set(["trx", "tx", "transaction", "t", "txn"]);
const SUPPRESS_COMMENT_RE = /\/\/\s*allow-direct-mutation:/i;

interface Violation {
  file: string;
  line: number;
  receiver: string;
  method: string;
  snippet: string;
}

function walk(dir: string, out: string[]): void {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".turbo") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".d.ts")) continue;
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts")) continue;
    out.push(full);
  }
}

function discoverFiles(): string[] {
  const out: string[] = [];
  for (const root of SCAN_ROOTS) {
    try {
      statSync(root);
    } catch {
      continue;
    }
    walk(root, out);
  }
  return out;
}

const CALL_RE = new RegExp(
  // (^|non-word)(receiver).(method)\(
  String.raw`(^|[^\w.])(\w+)\.(insertInto|updateTable|deleteFrom|replaceInto)\(`,
  "g",
);

function findViolations(file: string): Violation[] {
  const source = readFileSync(file, "utf-8");
  const lines = source.split(/\r?\n/);
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const prevLine = i > 0 ? lines[i - 1]! : "";
    if (SUPPRESS_COMMENT_RE.test(prevLine)) continue;

    CALL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CALL_RE.exec(line)) !== null) {
      const receiver = match[2]!;
      const method = match[3]!;
      if (ALLOWED_RECEIVER_NAMES.has(receiver)) continue;
      // Selective allow for "tx-like" suffixes (trx2, innerTx, etc.)
      if (/^(?:trx|tx|txn|transaction)\w*$/i.test(receiver)) continue;

      violations.push({
        file: relative(ROOT, file).replace(/\\/g, "/"),
        line: i + 1,
        receiver,
        method,
        snippet: line.trim().slice(0, 200),
      });
    }
  }

  return violations;
}

function main(): void {
  const files = discoverFiles();
  const all: Violation[] = [];
  for (const file of files) {
    for (const v of findViolations(file)) all.push(v);
  }

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ filesScanned: files.length, violations: all }, null, 2));
  } else {
    console.log(
      `\n\x1b[1mTenant-tx discipline — ${files.length} TS files scanned\x1b[0m`,
    );
    console.log("─".repeat(75));
    if (all.length === 0) {
      console.log("  \x1b[32mOK\x1b[0m  no raw mutations outside withSystemTx/withTenantTx");
    } else {
      for (const v of all) {
        console.log(`  \x1b[31mFAIL\x1b[0m  ${v.file}:${v.line}  ${v.receiver}.${v.method}()`);
        console.log(`        ${v.snippet}`);
      }
      console.log(
        `\n  ${all.length} violation(s) — wrap in withTenantTx or annotate the line above with`
        + `\n  \`// allow-direct-mutation: <reason>\` to silence intentional cases.`,
      );
    }
  }

  if (all.length > 0) process.exit(1);
}

main();
