#!/usr/bin/env node
/**
 * Generate HS (Harmonized System) seed SQL from GitHub datasets CSV.
 *
 * CSV columns: section, hscode, description, parent, level
 * HS hierarchy: Chapter (2-digit) → Heading (4-digit) → Subheading (6-digit)
 * Level mapping: Chapter=2 → level_no=1, Heading=4 → level_no=2, Subheading=6 → level_no=3
 *
 * Output: SQL INSERT statements for ref.commodity_code with domain_code='hs'
 */
const fs = require("fs");
const path = require("path");

const csvPath = path.join(__dirname, "hs-codes.csv");
const outPath = path.join(__dirname, "..", "..", "seed", "platform", "001_global_reference", "008b_commodity_code_hs.sql");

const raw = fs.readFileSync(csvPath, "utf-8");
const lines = raw.split("\n").filter((l) => l.trim());

// Skip header
const dataLines = lines.slice(1);

const chapters = []; // level 2 in CSV = our level 1
const headings = []; // level 4 in CSV = our level 2
const subheadings = []; // level 6 in CSV = our level 3

// Track all codes for determining leaf status
const allCodes = new Set();
const parentCodes = new Set();

// First pass: collect all codes
for (const line of dataLines) {
  const fields = parseCSVLine(line);
  if (fields.length < 5) continue;

  const [section, hscode, description, parent, level] = fields;
  if (!hscode || hscode === "TOTAL") continue;

  allCodes.add(hscode.trim());
  if (parent && parent !== "TOTAL") {
    parentCodes.add(parent.trim());
  }
}

// Second pass: build entries
for (const line of dataLines) {
  const fields = parseCSVLine(line);
  if (fields.length < 5) continue;

  const [section, hscode, description, parent, level] = fields;
  if (!hscode || hscode === "TOTAL") continue;

  const code = hscode.trim();
  const desc = description.trim();
  const parentCode = parent && parent !== "TOTAL" ? parent.trim() : null;
  const csvLevel = parseInt(level, 10);
  const isLeaf = !parentCodes.has(code); // leaf if no other code references it as parent

  // Map CSV level (2=chapter, 4=heading, 6=subheading) to our level_no (1, 2, 3)
  let levelNo;
  if (csvLevel === 2) {
    levelNo = 1;
    chapters.push({
      code,
      name: desc,
      parent: parentCode,
      level: levelNo,
      isLeaf,
    });
  } else if (csvLevel === 4) {
    levelNo = 2;
    headings.push({
      code,
      name: desc,
      parent: parentCode,
      level: levelNo,
      isLeaf,
    });
  } else if (csvLevel === 6) {
    levelNo = 3;
    subheadings.push({
      code,
      name: desc,
      parent: parentCode,
      level: levelNo,
      isLeaf,
    });
  }
}

console.log(`Chapters: ${chapters.length}`);
console.log(`Headings: ${headings.length}`);
console.log(`Subheadings: ${subheadings.length}`);
console.log(`Total: ${chapters.length + headings.length + subheadings.length}`);

// Generate SQL
const sqlParts = [];

sqlParts.push(`/* ============================================================================
   Athyper — HS (Harmonized System) Commodity Codes (Full Hierarchy)
   Schema: ref
   Source: datasets/harmonized-system on GitHub (ODC-PDDL-1.0, public domain)
   URL: https://github.com/datasets/harmonized-system
   Upstream: UN Comtrade API

   HS 2022 Edition — 3-level hierarchy:
     Level 1: Chapter    (2-digit)  — ${chapters.length} entries
     Level 2: Heading    (4-digit)  — ${headings.length} entries
     Level 3: Subheading (6-digit)  — ${subheadings.length} entries
     Total: ${chapters.length + headings.length + subheadings.length} codes
   ============================================================================ */
`);

const BATCH = 500;

function esc(s) {
  return s.replace(/'/g, "''");
}

function generateInserts(label, rows) {
  sqlParts.push(`\n-- ${label}`);

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    sqlParts.push(
      `INSERT INTO ref.commodity_code (domain_code, code, name, parent_code, level_no, is_leaf, status, created_by)`,
    );
    sqlParts.push(`VALUES`);

    const values = batch.map((r, idx) => {
      const parentClause = r.parent ? `'${r.parent}'` : "NULL";
      const comma = idx < batch.length - 1 ? "," : "";
      return `  ('hs', '${r.code}', '${esc(r.name)}', ${parentClause}, ${r.level}, ${r.isLeaf}, 'active', 'seed')${comma}`;
    });

    sqlParts.push(values.join("\n"));
    sqlParts.push(`ON CONFLICT (domain_code, code) DO UPDATE SET`);
    sqlParts.push(`  name = excluded.name,`);
    sqlParts.push(`  parent_code = excluded.parent_code,`);
    sqlParts.push(`  level_no = excluded.level_no,`);
    sqlParts.push(`  is_leaf = excluded.is_leaf,`);
    sqlParts.push(`  updated_at = now();`);
  }
}

// Chapters first (level 1), then headings (level 2), then subheadings (level 3)
generateInserts(`HS Chapters (Level 1) — ${chapters.length} entries`, chapters);
generateInserts(`HS Headings (Level 2) — ${headings.length} entries`, headings);
generateInserts(
  `HS Subheadings (Level 3) — ${subheadings.length} entries`,
  subheadings,
);

const sql = sqlParts.join("\n");
fs.writeFileSync(outPath, sql, "utf-8");
console.log(`\nWrote ${outPath} (${(sql.length / 1024).toFixed(0)} KB)`);

// Simple CSV parser that handles quoted fields
function parseCSVLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}
