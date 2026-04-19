#!/usr/bin/env tsx
/**
 * Archetype Tag Verifier
 *
 * Checks that every COMMENT ON TABLE statement in the tagged schemas has a
 * valid ARCHETYPE= prefix in its first quoted string.
 *
 * Tagged schemas: control, event, governance, shared
 *
 * Usage:
 *   npx tsx server/scripts/verify-archetypes.ts
 *   pnpm --filter @athyper/server archetypes:verify
 *
 * Exit code:
 *   0 — all COMMENT ON TABLE statements are tagged and valid
 *   1 — one or more are missing or malformed
 */

import { readFileSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Config ──────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_ROOT = resolve(__dirname, "../db/sql");

/** Schemas whose table files are required to carry ARCHETYPE= tags. */
const TAGGED_SCHEMAS: string[] = ["control", "event", "governance", "shared"];

/** Regex that matches only table files (not views, functions, triggers, etc.) */
const TABLE_FILE_RE = /\d+[a-z]*_tables[_a-z]*.sql$/i;

// ── Validation sets ──────────────────────────────────────────────────────────

const VALID_ARCHETYPES = new Set(["A", "B", "B_LITE", "C", "D", "E", "F"]);
const VALID_SCOPES = new Set(["T", "G", "N"]);
const VALID_SUBTYPES = new Set(["SNAPSHOT", "APPEND_ONLY", "APPEND_ONLY_LOG"]);
const VALID_QUALIFIERS = new Set(["PENDING_ACTIVE_SET", "DEVIATION"]);

// ── Tag parser ───────────────────────────────────────────────────────────────

interface ParseResult {
  ok: boolean;
  error?: string;
}

/**
 * Parses the tag string extracted from the first quoted segment of a
 * COMMENT ON TABLE statement.
 *
 * Expected format (prefix before the first period + space):
 *   ARCHETYPE=X;SCOPE=Y[;SUBTYPE=Z][;QUALIFIER]
 *
 * Examples:
 *   ARCHETYPE=A;SCOPE=N
 *   ARCHETYPE=B;SCOPE=T
 *   ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET
 *   ARCHETYPE=C;SCOPE=T;DEVIATION
 *   ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT
 */
function parseTag(firstQuotedContent: string): ParseResult {
  // Extract the tag portion — everything up to the first ". " or end of string
  const tagMatch = firstQuotedContent.match(/^([^.]+)\./);
  if (!tagMatch) {
    return {
      ok: false,
      error: `No ". " found after tag — expected "ARCHETYPE=X;SCOPE=Y. <prose>"`,
    };
  }

  const tagStr = tagMatch[1].trim();
  const parts = tagStr.split(";");

  if (parts.length < 2) {
    return { ok: false, error: `Tag "${tagStr}" must have at least ARCHETYPE= and SCOPE=` };
  }

  // Part 0: ARCHETYPE=X
  if (!parts[0].startsWith("ARCHETYPE=")) {
    return { ok: false, error: `Tag must start with ARCHETYPE=, got "${parts[0]}"` };
  }
  const archetype = parts[0].slice("ARCHETYPE=".length);
  if (!VALID_ARCHETYPES.has(archetype)) {
    return {
      ok: false,
      error: `Unknown archetype "${archetype}". Valid: ${[...VALID_ARCHETYPES].join(", ")}`,
    };
  }

  // Part 1: SCOPE=Y
  if (!parts[1].startsWith("SCOPE=")) {
    return { ok: false, error: `Second segment must be SCOPE=, got "${parts[1]}"` };
  }
  const scope = parts[1].slice("SCOPE=".length);
  if (!VALID_SCOPES.has(scope)) {
    return {
      ok: false,
      error: `Unknown scope "${scope}". Valid: ${[...VALID_SCOPES].join(", ")}`,
    };
  }

  // Optional parts[2..]: SUBTYPE=Z or qualifiers
  for (let i = 2; i < parts.length; i++) {
    const seg = parts[i].trim();
    if (seg.startsWith("SUBTYPE=")) {
      const subtype = seg.slice("SUBTYPE=".length);
      if (!VALID_SUBTYPES.has(subtype)) {
        return {
          ok: false,
          error: `Unknown subtype "${subtype}". Valid: ${[...VALID_SUBTYPES].join(", ")}`,
        };
      }
    } else if (VALID_QUALIFIERS.has(seg)) {
      // ok
    } else {
      return {
        ok: false,
        error: `Unknown segment "${seg}". Valid qualifiers: ${[...VALID_QUALIFIERS].join(", ")}`,
      };
    }
  }

  return { ok: true };
}

// ── SQL file scanner ─────────────────────────────────────────────────────────

interface Finding {
  file: string;
  table: string;
  line: number;
  error: string;
}

/**
 * Extracts the content of the first single-quoted string in a multi-line
 * SQL string literal (concatenated with newline-adjacent quote pairs).
 *
 * Handles both:
 *   'ARCHETYPE=A;SCOPE=N. foo'
 *   'ARCHETYPE=A;SCOPE=N. foo '
 *   'part1 '
 *   'part2';   ← only the first segment matters
 */
function extractFirstQuotedSegment(commentBlock: string): string | null {
  // Match the first '...' segment (single-line)
  const m = commentBlock.match(/'([^']*)'/);
  return m ? m[1] : null;
}

function scanFile(filePath: string): Finding[] {
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split("\n");
  const findings: Finding[] = [];
  const relPath = filePath.replace(/\\/g, "/").split("/server/db/sql/")[1] ?? filePath;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect COMMENT ON TABLE lines (with optional double space)
    if (!/^COMMENT ON TABLE\s+\S+\s+IS\s*$/i.test(line.trim()) &&
        !/^COMMENT ON TABLE\s+\S+\s+IS\s+'/.test(line)) {
      continue;
    }

    // Extract the table name
    const tableMatch = line.match(/COMMENT ON TABLE\s+(\S+)\s+IS/i);
    if (!tableMatch) continue;
    const tableName = tableMatch[1];

    // Collect the full comment block (may span multiple lines until ;)
    let block = "";
    let j = i;
    while (j < lines.length) {
      block += lines[j] + "\n";
      if (lines[j].includes(";") && j > i) break;
      if (lines[j].trim().endsWith(";")) break;
      j++;
    }

    const firstSegment = extractFirstQuotedSegment(block);

    if (!firstSegment) {
      findings.push({
        file: relPath,
        table: tableName,
        line: i + 1,
        error: "Could not extract first quoted string from COMMENT ON TABLE",
      });
      continue;
    }

    if (!firstSegment.startsWith("ARCHETYPE=")) {
      findings.push({
        file: relPath,
        table: tableName,
        line: i + 1,
        error: `Missing ARCHETYPE= prefix. First quoted segment starts with: "${firstSegment.slice(0, 60)}"`,
      });
      continue;
    }

    const result = parseTag(firstSegment);
    if (!result.ok) {
      findings.push({
        file: relPath,
        table: tableName,
        line: i + 1,
        error: result.error!,
      });
    }
  }

  return findings;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function collectTableFiles(schema: string): string[] {
  const schemaDir = join(SQL_ROOT, schema);
  try {
    return readdirSync(schemaDir)
      .filter((f) => TABLE_FILE_RE.test(f))
      .map((f) => join(schemaDir, f));
  } catch {
    console.error(`  ✗ Schema directory not found: ${schemaDir}`);
    return [];
  }
}

function main() {
  console.log("Archetype tag verifier\n");

  const allFindings: Finding[] = [];
  let totalFiles = 0;
  let totalComments = 0;

  for (const schema of TAGGED_SCHEMAS) {
    const files = collectTableFiles(schema);
    console.log(`schema: ${schema} (${files.length} file${files.length !== 1 ? "s" : ""})`);

    for (const file of files) {
      totalFiles++;
      const findings = scanFile(file);

      // Count COMMENT ON TABLE in file for stats
      const raw = readFileSync(file, "utf8");
      const count = (raw.match(/^COMMENT ON TABLE\s/gim) ?? []).length;
      totalComments += count;

      const relPath = file.replace(/\\/g, "/").split("/server/db/sql/")[1] ?? file;
      if (findings.length === 0) {
        console.log(`  ✓ ${relPath} (${count} tables)`);
      } else {
        for (const f of findings) {
          console.log(`  ✗ ${relPath}:${f.line}  ${f.table}  — ${f.error}`);
        }
        allFindings.push(...findings);
      }
    }
  }

  console.log(
    `\n${totalFiles} files, ${totalComments} COMMENT ON TABLE statements checked`,
  );

  if (allFindings.length === 0) {
    console.log("All archetype tags valid.\n");
    process.exit(0);
  } else {
    console.log(`\n${allFindings.length} error${allFindings.length !== 1 ? "s" : ""} found.\n`);
    process.exit(1);
  }
}

main();
