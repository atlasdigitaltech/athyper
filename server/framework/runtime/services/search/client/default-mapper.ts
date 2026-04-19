/**
 * Default row → SearchDocument mapper — convention-based.
 *
 * Works for any entity row fetched from a table registered in
 * control.entity. Uses naming conventions shared across athyper schemas:
 *
 *   title      ← first non-empty of: name, code, {entity_type}_number,
 *                document_number, short_name
 *   summary    ← first non-empty of: description, notes, summary,
 *                business_description
 *   status     ← status column if it's a string
 *   tags       ← tags column if it's a jsonb array of strings
 *   updated_at ← updated_at (ms) or created_at fallback
 *
 * Every scalar column is passed through as a document field so the index
 * retains the full row context. Meilisearch will index every attribute by
 * default — searchability/filterability is controlled by the index
 * settings in index-schema.ts, not by the document shape.
 *
 * Columns that carry no useful search signal or are sensitive are
 * excluded: BINARY_EXCLUDES — PII, credentials, internal bookkeeping.
 */

import type { SearchDocument } from "./index-schema.js";
import { buildDocumentId } from "./index-schema.js";

/** Columns we never promote to the index. */
const EXCLUDE_COLUMNS = new Set([
  "password_hash",
  "credential_encrypted",
  "signing_secret",
  "api_key_hash",
  "access_token",
  "refresh_token",
]);

function pickFirstString(
  row: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return undefined;
}

function normaliseTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const strings = raw.filter((t): t is string => typeof t === "string");
  return strings.length > 0 ? strings : undefined;
}

function toMillis(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const n = new Date(value).getTime();
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof value === "number") return value;
  return undefined;
}

/**
 * Shape of the generic mapping pass. Overrides receive this as input.
 */
export function defaultRowToSearchDocument(
  row:        Record<string, unknown>,
  entityType: string,
): SearchDocument | null {
  const id        = row["id"];
  const tenantId  = row["tenant_id"];
  if (typeof id !== "string" || typeof tenantId !== "string") return null;

  const titleKeys = ["name", "code", `${entityType}_number`, "document_number", "short_name"];
  const title =
    pickFirstString(row, titleKeys) ?? `${entityType}:${id.slice(0, 8)}`;

  const summary = pickFirstString(row, [
    "description", "notes", "summary", "business_description",
  ]);

  const tags   = normaliseTags(row["tags"]);
  const status = typeof row["status"] === "string" ? row["status"] : undefined;

  const updatedAt =
    toMillis(row["updated_at"]) ??
    toMillis(row["created_at"]) ??
    Date.now();

  const doc: SearchDocument = {
    id:          buildDocumentId(entityType, id),
    _tenant_id:  tenantId,
    entity_type: entityType,
    entity_id:   id,
    title,
    ...(summary ? { summary } : {}),
    ...(tags    ? { tags }    : {}),
    ...(status  ? { status }  : {}),
    updated_at:  updatedAt,
  };

  // Pass-through extensions — scalars only; exclude sensitive columns.
  for (const [key, value] of Object.entries(row)) {
    if (EXCLUDE_COLUMNS.has(key)) continue;
    if (key in doc) continue;
    if (value == null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      doc[key] = value;
    } else if (value instanceof Date) {
      doc[key] = value.toISOString();
    }
    // Skip jsonb objects, arrays beyond tags — let overrides opt them in.
  }

  return doc;
}

/**
 * Per-entity override. Returns an enriched SearchDocument or the default
 * unchanged. Called AFTER the default mapping.
 */
export type EntityDocumentOverride = (
  defaultDoc: SearchDocument,
  row:        Record<string, unknown>,
) => SearchDocument;
