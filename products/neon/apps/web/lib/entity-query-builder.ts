import "server-only";

/**
 * Entity Query Builder
 *
 * Metadata-validated SQL clause building for server-side search, filter, and sort.
 * All values are parameterized via Kysely's sql template (no string interpolation).
 *
 * Filter wire format: "column:value,column:~partial"
 *   - No prefix on value → exact match (quick filters)
 *   - ~ prefix on value  → ILIKE '%value%' (column text filters)
 */

import { createHash } from "crypto";

import { sql, type RawBuilder } from "kysely";

import type { ServerFieldMeta } from "@/lib/entity-meta-fields";

import { getEntityDataParams } from "@/config/entity-data-params";

// ============================================================================
// Types
// ============================================================================

export interface ParsedFilter {
  column: string;
  value: string;
  mode: "exact" | "ilike";
}

// Strict column name pattern: starts with letter/underscore, then alphanumeric/underscore
const COLUMN_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Types eligible for ILIKE / text search operations.
// Covers both mapped types (from PG_TYPE_MAP: "string", "enum") and raw PostgreSQL
// types that may be stored in meta.field.data_type.
const TEXT_COMPATIBLE_TYPES = new Set([
  "string",
  "enum",
  "text",
  "varchar",
  "char",
  "character",
  "bpchar",
  "character varying",
  "uuid",
]);

// Numeric data types — when the search query is purely numeric, restrict search
// to code/numeric columns only to avoid OR explosion across text columns.
const NUMERIC_TYPES = new Set([
  "number",
  "integer",
  "int",
  "bigint",
  "smallint",
  "decimal",
  "numeric",
  "real",
  "double precision",
  "float",
]);

// Column names that hold codes/identifiers (matched by suffix) — always included
// in numeric search even if their data type is text.
const CODE_COLUMN_SUFFIXES = ["_code", "_number", "_no", "_num", "_id"];
const CODE_COLUMN_EXACT = new Set(["code", "number", "numeric_code"]);

// Purely numeric string (optionally with leading zeros): "024", "12345"
const NUMERIC_SEARCH_RE = /^\d+$/;

// ============================================================================
// Parse Filters
// ============================================================================

/**
 * Parse the compact filter wire format into structured filter objects.
 *
 * Input:  "status:ACTIVE,name:~john,is_active:true"
 * Output: [
 *   { column: "status",    value: "ACTIVE", mode: "exact" },
 *   { column: "name",      value: "john",   mode: "ilike" },
 *   { column: "is_active", value: "true",   mode: "exact" },
 * ]
 */
export function parseFilters(raw: string): ParsedFilter[] {
  if (!raw) return [];

  const params = getEntityDataParams();
  const parts = raw.split(",").filter(Boolean);
  const result: ParsedFilter[] = [];

  for (const part of parts.slice(0, params.filter.maxFilterClauses)) {
    const colonIdx = part.indexOf(":");
    if (colonIdx < 1) continue;

    const column = part.substring(0, colonIdx).trim();
    let value = part.substring(colonIdx + 1).trim();

    // Validate column name (prevent injection)
    if (!COLUMN_NAME_RE.test(column)) continue;

    // Enforce value length limit
    if (value.length > params.filter.maxFilterValueLength) continue;

    // Detect mode: ~ prefix = ILIKE
    let mode: "exact" | "ilike" = "exact";
    if (value.startsWith("~")) {
      mode = "ilike";
      value = value.substring(1);
    }

    if (!value) continue;

    result.push({ column, value, mode });
  }

  return result;
}

// ============================================================================
// Build Filter Clauses
// ============================================================================

/**
 * Build parameterized WHERE fragments from parsed filters.
 * Cross-checks each column against field metadata — unknown columns are skipped.
 * ILIKE is restricted to string/enum data types.
 */
export function buildFilterClauses(
  filters: ParsedFilter[],
  fields: ServerFieldMeta[],
): RawBuilder<unknown>[] {
  const fieldMap = new Map(fields.map((f) => [f.columnName, f]));
  const clauses: RawBuilder<unknown>[] = [];

  for (const filter of filters) {
    const field = fieldMap.get(filter.column);
    if (!field) continue; // skip columns not in metadata

    if (filter.mode === "ilike") {
      // ::text cast makes ILIKE safe for any column type
      clauses.push(
        sql`${sql.ref(filter.column)}::text ILIKE ${"%" + filter.value + "%"}`,
      );
    } else {
      // Exact match with type-appropriate casting
      if (field.dataType === "boolean" || field.dataType === "bool") {
        const boolVal = filter.value.toLowerCase() === "true";
        clauses.push(sql`${sql.ref(filter.column)} = ${boolVal}`);
      } else {
        // Case-insensitive exact match (ILIKE without wildcards)
        // DB may store "active" while filter sends "ACTIVE"
        clauses.push(
          sql`${sql.ref(filter.column)}::text ILIKE ${filter.value}`,
        );
      }
    }
  }

  return clauses;
}

// ============================================================================
// Build Search Clause
// ============================================================================

/**
 * Build an OR-combined ILIKE clause across searchable string columns.
 * Returns null if the query is too short or no columns are searchable.
 *
 * Query plan protection:
 *   - If the search term is purely numeric (e.g. "024"), narrows the OR to only
 *     numeric-type columns and code/number text columns. This avoids an OR
 *     explosion across 10+ text columns when only code columns can match.
 */
export function buildSearchClause(
  query: string,
  fields: ServerFieldMeta[],
): RawBuilder<unknown> | null {
  const params = getEntityDataParams();
  if (!query || query.length < params.search.minLength) return null;

  const isNumericQuery = NUMERIC_SEARCH_RE.test(query);

  let searchableFields: ServerFieldMeta[];

  if (isNumericQuery) {
    // Narrow to numeric-typed columns + code/number text columns
    searchableFields = fields.filter((f) => {
      if (NUMERIC_TYPES.has(f.dataType)) return true;
      // Text columns with code-like names (e.g. "numeric_code", "alpha_2_code")
      if (TEXT_COMPATIBLE_TYPES.has(f.dataType)) {
        const col = f.columnName.toLowerCase();
        if (CODE_COLUMN_EXACT.has(col)) return true;
        if (CODE_COLUMN_SUFFIXES.some((suffix) => col.endsWith(suffix)))
          return true;
      }
      return false;
    });

    // If no code/numeric columns found, fall back to all searchable columns
    if (searchableFields.length === 0) {
      searchableFields = fields.filter(
        (f) => f.isSearchable || TEXT_COMPATIBLE_TYPES.has(f.dataType),
      );
    }
  } else {
    searchableFields = fields.filter(
      (f) => f.isSearchable || TEXT_COMPATIBLE_TYPES.has(f.dataType),
    );
  }

  searchableFields = searchableFields.slice(0, params.search.maxSearchColumns);
  if (searchableFields.length === 0) return null;

  const pattern = "%" + query + "%";
  const parts = searchableFields.map(
    (f) => sql`${sql.ref(f.columnName)}::text ILIKE ${pattern}`,
  );

  // Wrap in parens with OR: (col1 ILIKE $1 OR col2 ILIKE $1 OR ...)
  return sql`(${sql.join(parts, sql` OR `)})`;
}

// ============================================================================
// Build Sort Clause
// ============================================================================

/**
 * Build an ORDER BY clause, validating the column name against field metadata.
 * Falls back to `created_at DESC` if the column is unknown.
 */
export function buildSortClause(
  sortColumn: string,
  sortDir: "asc" | "desc",
  fields: ServerFieldMeta[],
): RawBuilder<unknown> {
  const fieldMap = new Map(fields.map((f) => [f.columnName, f]));
  const fallback = sql`created_at DESC`;

  if (!sortColumn || !fieldMap.has(sortColumn)) return fallback;

  return sortDir === "asc"
    ? sql`${sql.ref(sortColumn)} ASC NULLS LAST`
    : sql`${sql.ref(sortColumn)} DESC NULLS LAST`;
}

// ============================================================================
// Query Parameter Hashing (for Redis cache keys)
// ============================================================================

/**
 * Deterministic 16-char hash of query parameters (search + filters + sort + pagination).
 * Used as part of the Redis cache key for query results.
 */
export function hashQueryParams(params: {
  search?: string;
  filters?: string;
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
}): string {
  const sorted = Object.entries(params)
    .filter(([, v]) => v != null && v !== "" && v !== 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const raw = JSON.stringify(sorted);
  return createHash("sha256").update(raw).digest("hex").substring(0, 16);
}

/**
 * Hash excluding pagination (page/pageSize) — for count cache keys,
 * since the count doesn't change with page number.
 */
export function hashFilterParams(params: {
  search?: string;
  filters?: string;
}): string {
  const sorted = Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  const raw = JSON.stringify(sorted);
  return createHash("sha256").update(raw).digest("hex").substring(0, 16);
}
