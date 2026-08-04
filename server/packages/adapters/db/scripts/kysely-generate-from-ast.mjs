#!/usr/bin/env node
/**
 * kysely-generate-from-ast.mjs
 * ============================
 * Generates Kysely TypeScript types from a Prisma schema file using
 * @mrleebo/prisma-ast (pure JS, no WASM). Produces the same output as
 * prisma-kysely, but bypasses the Prisma WASM schema-build binary that panics
 * on large schemas (capacity overflow with 433+ models).
 *
 * Usage:
 *   node scripts/kysely-generate-from-ast.mjs --schema src/prisma/schema.prisma --output src/generated/kysely
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load @mrleebo/prisma-ast from the pnpm store (not in workspace deps).
// The store root is two levels above the monorepo root (server/../ -> athyper/).
const PRISMA_AST_PATH = resolve(
  __dirname,
  "../../../../../node_modules/.pnpm/@mrleebo+prisma-ast@0.13.1/node_modules/@mrleebo/prisma-ast/dist/index.js"
);
const { getSchema } = require(PRISMA_AST_PATH);

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

const schemaArg = getArg("--schema");
const outputArg = getArg("--output");
if (!schemaArg) {
  console.error("Usage: node kysely-generate-from-ast.mjs --schema <path> [--output <dir>]");
  process.exit(1);
}

const schemaPath = resolve(process.cwd(), schemaArg);

// ── Type mappings ─────────────────────────────────────────────────────────────
const PRISMA_SCALAR_MAP = {
  String: "string",
  Int: "number",
  Float: "number",
  BigInt: "bigint",
  Decimal: "string",
  Boolean: "boolean",
  DateTime: "Timestamp",
  Json: "unknown",
  Bytes: "Buffer",
};

function mapPrismaType(typeName) {
  return PRISMA_SCALAR_MAP[typeName] ?? null; // null = not a known scalar
}

// ── Parse schema ──────────────────────────────────────────────────────────────
const schemaSource = readFileSync(schemaPath, "utf-8");
const parsed = getSchema(schemaSource);

// Derive output path from schema generator block if not supplied via CLI
function getGeneratorOutput(schema, generatorName) {
  for (const block of schema.list) {
    if (block.type === "generator" && block.name === generatorName) {
      for (const a of block.assignments) {
        if (a.type === "assignment" && a.key === "output") {
          const v = a.value;
          return typeof v === "string" ? v.replace(/^"|"$/g, "") : null;
        }
      }
    }
  }
  return null;
}

let outputDir;
if (outputArg) {
  outputDir = resolve(process.cwd(), outputArg);
} else {
  const relOut = getGeneratorOutput(parsed, "kysely");
  if (!relOut) {
    console.error("Could not find 'generator kysely { output = ... }' in schema. Pass --output.");
    process.exit(1);
  }
  outputDir = resolve(dirname(schemaPath), relOut);
}

// Collect all model names so we can identify relation fields by their type
const modelNames = new Set();
const enumNames = new Set();
for (const block of parsed.list) {
  if (block.type === "model") modelNames.add(block.name);
  if (block.type === "enum") enumNames.add(block.name);
}

// ── Extract model info ────────────────────────────────────────────────────────
function getStringArgValue(arg) {
  if (!arg) return null;
  const v = arg.value;
  if (typeof v === "string") return v.replace(/^"|"$/g, "");
  return null;
}

function hasRelationAttr(field) {
  return field.attributes?.some((a) => a.name === "relation") ?? false;
}

function hasDefaultAttr(field) {
  return field.attributes?.some((a) => a.name === "default") ?? false;
}

function getSchemaAttr(block) {
  const props = block.properties ?? [];
  for (const p of props) {
    if (p.type === "attribute" && p.name === "schema") {
      const firstArg = p.args?.[0];
      if (firstArg) return getStringArgValue(firstArg) ?? null;
    }
  }
  return null;
}

function getMapAttr(block) {
  const props = block.properties ?? [];
  for (const p of props) {
    if (p.type === "attribute" && p.name === "map") {
      const firstArg = p.args?.[0];
      if (firstArg) return getStringArgValue(firstArg) ?? null;
    }
  }
  return null;
}

// ── Generate output ───────────────────────────────────────────────────────────
const DEFAULT_SCHEMA = "public";

const lines = [];

lines.push(`import type { ColumnType } from "kysely";`);
lines.push(`export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>`);
lines.push(`  ? ColumnType<S, I | undefined, U>`);
lines.push(`  : ColumnType<T, T | undefined, T>;`);
lines.push(`export type Timestamp = ColumnType<Date, Date | string, Date | string>;`);
lines.push(``);

// Collect enums
for (const block of parsed.list) {
  if (block.type !== "enum") continue;
  const values = block.enumerators
    .filter((e) => e.type === "enumerator")
    .map((e) => `"${e.name}"`);
  if (values.length === 0) continue;
  lines.push(`export type ${block.name} = ${values.join(" | ")};`);
  lines.push(``);
}

// Collect models sorted by name
const models = parsed.list.filter((b) => b.type === "model");
models.sort((a, b) => a.name.localeCompare(b.name));

const dbEntries = []; // { key, typeName }

for (const model of models) {
  const modelName = model.name;
  const pgSchema = getSchemaAttr(model) ?? DEFAULT_SCHEMA;
  const tableDbName = getMapAttr(model) ?? modelName;

  const fieldLines = [];
  for (const prop of model.properties) {
    if (prop.type !== "field") continue;
    const field = prop;

    // Skip relation fields
    if (hasRelationAttr(field)) continue;

    // Determine the base field type
    let fieldTypeName;
    if (typeof field.fieldType === "string") {
      fieldTypeName = field.fieldType;
    } else if (field.fieldType?.type === "function") {
      // e.g. Unsupported("...") -> unknown
      fieldTypeName = "Unsupported";
    } else {
      fieldTypeName = String(field.fieldType);
    }

    // Check if it's a scalar type
    const tsScalar = mapPrismaType(fieldTypeName);
    let tsType;

    if (tsScalar !== null) {
      tsType = tsScalar;
    } else if (enumNames.has(fieldTypeName)) {
      tsType = fieldTypeName;
    } else if (modelNames.has(fieldTypeName)) {
      // Relation field without explicit @relation attr (back-ref array/optional)
      // Skip if it's a model reference (relation back-ref)
      if (field.array || field.optional) {
        // Only skip if it's truly a back-ref (model type)
        continue;
      }
      // Non-optional, non-array model type without @relation: unusual, skip
      continue;
    } else if (fieldTypeName === "Unsupported") {
      tsType = "unknown";
    } else {
      // Unknown type → unknown
      tsType = "unknown";
    }

    // Handle arrays (scalar arrays like String[] are real DB columns)
    if (field.array) {
      tsType = `${tsType}[]`;
    }

    const hasDefault = hasDefaultAttr(field);
    const isOptional = field.optional && !field.array;

    let finalType;
    if (hasDefault && isOptional) {
      finalType = `Generated<${tsType} | null>`;
    } else if (hasDefault) {
      finalType = `Generated<${tsType}>`;
    } else if (isOptional) {
      finalType = `${tsType} | null`;
    } else {
      finalType = tsType;
    }

    fieldLines.push(`    ${field.name}: ${finalType};`);
  }

  if (fieldLines.length === 0) continue;

  lines.push(`export type ${modelName} = {`);
  for (const fl of fieldLines) lines.push(fl);
  lines.push(`};`);
  lines.push(``);

  // DB map key
  const dbKey =
    pgSchema === DEFAULT_SCHEMA
      ? tableDbName
      : `${pgSchema}.${tableDbName}`;
  dbEntries.push({ key: dbKey, typeName: modelName });
}

// DB type
lines.push(`export type DB = {`);
for (const entry of dbEntries) {
  const needsQuotes = entry.key.includes(".");
  const keyStr = needsQuotes ? `"${entry.key}"` : entry.key;
  lines.push(`    ${keyStr}: ${entry.typeName};`);
}
lines.push(`};`);
lines.push(``);

// ── Write output ──────────────────────────────────────────────────────────────
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, "types.ts");
writeFileSync(outputPath, lines.join("\n"), "utf-8");
console.log(`Generated ${lines.length} lines → ${outputPath}`);
console.log(`  Models: ${models.length}, DB entries: ${dbEntries.length}`);
