#!/usr/bin/env node
/**
 * Generate UNSPSC seed SQL from Oklahoma Open Data CSV.
 *
 * CSV columns: Segment, Segment Name, Family, Family Name, Class, Class Name, Commodity, Commodity Name
 * UNSPSC hierarchy: Segment (2-digit prefix, 8-digit code) → Family → Class → Commodity
 * Level mapping: Segment=1, Family=2, Class=3, Commodity=4
 *
 * Output: SQL INSERT statements for ref.commodity_code with domain_code='unspsc'
 */
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'unspsc-codes.csv');
const outPath = path.join(__dirname, '..', 'sql', '201_seed_unspsc.sql');

const raw = fs.readFileSync(csvPath, 'utf-8');
const lines = raw.split('\n').filter(l => l.trim());

// Skip header
const dataLines = lines.slice(1);

// Collect unique entries at each level
const segments = new Map(); // code -> name
const families = new Map();
const classes = new Map();
const commodities = new Map();

for (const line of dataLines) {
  // Parse CSV carefully (some names may contain commas within quotes)
  const fields = parseCSVLine(line);
  if (fields.length < 8) continue;

  const [segCode, segName, famCode, famName, clsCode, clsName, comCode, comName] = fields;

  if (segCode && segName && !segments.has(segCode)) {
    segments.set(segCode, segName.trim());
  }
  if (famCode && famName && !families.has(famCode)) {
    families.set(famCode, { name: famName.trim(), parent: segCode });
  }
  if (clsCode && clsName && !classes.has(clsCode)) {
    classes.set(clsCode, { name: clsName.trim(), parent: famCode });
  }
  if (comCode && comName && !commodities.has(comCode)) {
    commodities.set(comCode, { name: comName.trim(), parent: clsCode });
  }
}

console.log(`Segments: ${segments.size}`);
console.log(`Families: ${families.size}`);
console.log(`Classes: ${classes.size}`);
console.log(`Commodities: ${commodities.size}`);
console.log(`Total: ${segments.size + families.size + classes.size + commodities.size}`);

// Generate SQL
const sqlParts = [];

sqlParts.push(`/* ============================================================================
   Athyper — UNSPSC Commodity Codes (Full Hierarchy)
   Schema: ref
   Source: Oklahoma Open Data Portal (US Government Open Data, public domain)
   URL: https://data.ok.gov/dataset/unspsc-codes

   UNSPSC v19.0501 — 4-level hierarchy:
     Level 1: Segment   (XX000000)  — ${segments.size} entries
     Level 2: Family    (XXXX0000)  — ${families.size} entries
     Level 3: Class     (XXXXXX00)  — ${classes.size} entries
     Level 4: Commodity (XXXXXXXX)  — ${commodities.size} entries
     Total: ${segments.size + families.size + classes.size + commodities.size} codes
   ============================================================================ */
`);

// Batch size for INSERT statements (Postgres handles big VALUES lists fine)
const BATCH = 500;

// Helper to escape single quotes
function esc(s) {
  return s.replace(/'/g, "''");
}

// Generate INSERT for a batch of rows
function generateInserts(label, rows) {
  sqlParts.push(`\n-- ${label}`);

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    sqlParts.push(`INSERT INTO ref.commodity_code (domain_code, code, name, parent_code, level_no, is_leaf, status, created_by)`);
    sqlParts.push(`VALUES`);

    const values = batch.map((r, idx) => {
      const parentClause = r.parent ? `'${r.parent}'` : 'NULL';
      const comma = idx < batch.length - 1 ? ',' : '';
      return `  ('unspsc', '${r.code}', '${esc(r.name)}', ${parentClause}, ${r.level}, ${r.isLeaf}, 'active', 'seed')${comma}`;
    });

    sqlParts.push(values.join('\n'));
    sqlParts.push(`ON CONFLICT (domain_code, code) DO UPDATE SET`);
    sqlParts.push(`  name = excluded.name,`);
    sqlParts.push(`  parent_code = excluded.parent_code,`);
    sqlParts.push(`  level_no = excluded.level_no,`);
    sqlParts.push(`  is_leaf = excluded.is_leaf,`);
    sqlParts.push(`  updated_at = now();`);
  }
}

// Segments (level 1, not leaf)
const segRows = [...segments.entries()].map(([code, name]) => ({
  code, name, parent: null, level: 1, isLeaf: false
}));
generateInserts(`UNSPSC Segments (Level 1) — ${segRows.length} entries`, segRows);

// Families (level 2, not leaf)
const famRows = [...families.entries()].map(([code, { name, parent }]) => ({
  code, name, parent, level: 2, isLeaf: false
}));
generateInserts(`UNSPSC Families (Level 2) — ${famRows.length} entries`, famRows);

// Classes (level 3, not leaf)
const clsRows = [...classes.entries()].map(([code, { name, parent }]) => ({
  code, name, parent, level: 3, isLeaf: false
}));
generateInserts(`UNSPSC Classes (Level 3) — ${clsRows.length} entries`, clsRows);

// Commodities (level 4, leaf)
const comRows = [...commodities.entries()].map(([code, { name, parent }]) => ({
  code, name, parent, level: 4, isLeaf: true
}));
generateInserts(`UNSPSC Commodities (Level 4) — ${comRows.length} entries`, comRows);

const sql = sqlParts.join('\n');
fs.writeFileSync(outPath, sql, 'utf-8');
console.log(`\nWrote ${outPath} (${(sql.length / 1024 / 1024).toFixed(1)} MB)`);

// Simple CSV parser that handles quoted fields
function parseCSVLine(line) {
  const fields = [];
  let current = '';
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
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}
