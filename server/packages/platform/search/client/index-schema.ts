/**
 * Meilisearch index schema — cross-entity search.
 *
 * Design: single `records` index with `entity_type` as a filterable
 * attribute. Chosen over per-entity indices because:
 *   - Sprint 41 SearchInput is a unified search UI
 *   - Cross-entity ranking happens in one place
 *   - Halves operational overhead (one index to backfill, version, settle)
 *   - Meilisearch tenant tokens can gate both entity_type and tenant in a
 *     single token (not possible across multiple indices without minting N)
 *
 * Every document in the `records` index has at minimum:
 *   id            — Meilisearch primary key. Format: `{entity_type}:{row_id}`
 *                   so the same underlying row across entity types never
 *                   collides (defensive — row IDs are UUIDs so collisions
 *                   shouldn't happen, but the compound ID keeps shardability).
 *   _tenant_id    — tenant UUID (filterable, never searchable).
 *   entity_type   — control.entity.name value (filterable + searchable).
 *   entity_id     — row UUID within its entity's backing table.
 *   title         — canonical human-readable label for the row.
 *   summary       — short descriptor (often from description column).
 *   body          — optional longer text (CMS body, comments, line notes).
 *   tags          — array of string tags, faceted.
 *   status        — row status, filterable.
 *   updated_at    — unix ms, sortable.
 */

export const SEARCH_INDEX_NAME = "records";

/**
 * Attributes available for full-text search — ranked in priority order.
 * Meilisearch uses position in this array as the ranking weight (earlier =
 * more important).
 */
export const SEARCHABLE_ATTRIBUTES = [
  "title",
  "entity_type",
  "tags",
  "summary",
  "body",
] as const;

/**
 * Attributes clients can filter on. Notable:
 *   _tenant_id — EVERY query must filter on this (enforced by tenant token).
 *   entity_type — cross-entity scoping.
 */
export const FILTERABLE_ATTRIBUTES = [
  "_tenant_id",
  "entity_type",
  "status",
  "tags",
  "updated_at",
] as const;

/** Attributes clients can sort on. */
export const SORTABLE_ATTRIBUTES = [
  "updated_at",
  "title",
] as const;

/**
 * Stop words. Meilisearch ignores these when indexing, reducing index size
 * and improving precision. English-only for v1; extend per locale later.
 */
export const STOP_WORDS = [
  "a", "an", "and", "or", "the", "of", "to", "in", "on", "for",
] as const;

/**
 * Ranking rules — applied in order to break ties. First five are the
 * Meilisearch defaults; adding "updated_at:desc" at the end biases recent
 * docs when all else is equal.
 */
export const RANKING_RULES = [
  "words",
  "typo",
  "proximity",
  "attribute",
  "sort",
  "exactness",
  "updated_at:desc",
] as const;

/**
 * A single indexable document. Callers (outbox sync worker, backfill) map
 * entity rows into this shape before upserting.
 */
export interface SearchDocument {
  id:           string;   // `{entity_type}:{entity_id}`
  _tenant_id:   string;
  entity_type:  string;
  entity_id:    string;
  title:        string;
  summary?:     string;
  body?:        string;
  tags?:        string[];
  status?:      string;
  updated_at:   number;   // unix ms
  /** Free-form extensions — Meili indexes every field by default. */
  [key: string]: unknown;
}

export function buildDocumentId(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}
