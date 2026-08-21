#!/usr/bin/env tsx
/**
 * Reversal stub-regression guard (audit AP-S3 / rb-19 closure).
 *
 * Fails CI when either of the two stub return codes appears anywhere
 * under server/packages/services/business/p2p/. Both codes were removed
 * when the real reversal handlers shipped:
 *
 *   RECEIPT_REVERSAL_NOT_IMPLEMENTED         (AP-S2a)
 *   SERVICE_SHEET_REVERSAL_NOT_IMPLEMENTED   (AP-S3)
 *
 * Their continued absence is the signal that nobody has accidentally
 * regressed a posting service back to a stub. If a future refactor
 * legitimately needs to re-introduce a stub (e.g. for a new entity),
 * the constant list below is the single place to update.
 *
 * Usage:
 *   npx tsx server/scripts/verify-reversal-implementations.ts
 *
 *   # JSON output for CI dashboards:
 *   npx tsx server/scripts/verify-reversal-implementations.ts --json
 *
 * Exit code:
 *   0 — no stub codes found
 *   1 — at least one stub code present (regression)
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

const FORBIDDEN_TOKENS = [
  "RECEIPT_REVERSAL_NOT_IMPLEMENTED",
  "SERVICE_SHEET_REVERSAL_NOT_IMPLEMENTED",
] as const;

const SCAN_ROOTS = [
  "server/packages/services/business/p2p",
] as const;

const FILE_SUFFIXES = [".ts", ".sql"];

const SCRIPT_PATH_TOKEN = "verify-reversal-implementations";
const JSON_OUTPUT = process.argv.includes("--json");

interface Hit {
  file:  string;
  line:  number;
  token: string;
}

async function walk(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (entry.isFile() && FILE_SUFFIXES.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

async function scanFile(file: string): Promise<Hit[]> {
  const content = await fs.readFile(file, "utf8");
  const hits: Hit[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    for (const token of FORBIDDEN_TOKENS) {
      if (line.includes(token)) {
        hits.push({ file, line: i + 1, token });
      }
    }
  }
  return hits;
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const allFiles: string[] = [];
  for (const root of SCAN_ROOTS) {
    allFiles.push(...(await walk(path.resolve(repoRoot, root))));
  }

  // Exclude the guard script itself from the scan so it doesn't false-flag
  // on its own forbidden-token constants.
  const filesToScan = allFiles.filter((f) => !f.includes(SCRIPT_PATH_TOKEN));

  const hits: Hit[] = [];
  for (const file of filesToScan) {
    hits.push(...(await scanFile(file)));
  }

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      ok:           hits.length === 0,
      scanned:      filesToScan.length,
      hits_count:   hits.length,
      hits,
    }, null, 2));
  } else if (hits.length === 0) {
    console.log(
      `OK: scanned ${filesToScan.length} file(s) under ${SCAN_ROOTS.join(", ")}; ` +
      `no stub return codes present.`,
    );
  } else {
    console.error(
      `FAIL: ${hits.length} stub-code occurrence(s) found across ${filesToScan.length} scanned file(s).\n`,
    );
    for (const hit of hits) {
      console.error(`  ${path.relative(repoRoot, hit.file)}:${hit.line}  ${hit.token}`);
    }
    console.error(
      `\nIf this regression is intentional (rebuilding a reversal handler as a stub),\n` +
      `add an exception to FORBIDDEN_TOKENS in server/scripts/verify-reversal-implementations.ts.`,
    );
  }

  process.exit(hits.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("verify-reversal-implementations: fatal error", err);
  process.exit(2);
});
