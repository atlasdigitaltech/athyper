/**
 * @athyper/platform-api-client — Runtime Paths
 *
 * Canonical URL path builders for the records runtime API.
 * All dynamic segments are encoded by the caller via encodePathSegment.
 */
import { encodePathSegment } from "./base";
import { type FilterEntry } from "./types";

const RECORDS_BASE = "/api/runtime/v1/entities";

export const runtimePath = {
  list:            (entityCode: string) =>
    `${RECORDS_BASE}/${encodePathSegment(entityCode)}`,
  detail:          (entityCode: string, id: string) =>
    `${RECORDS_BASE}/${encodePathSegment(entityCode)}/${encodePathSegment(id)}`,
  create:          (entityCode: string) =>
    `${RECORDS_BASE}/${encodePathSegment(entityCode)}`,
  bulkPreflight:   (entityCode: string) =>
    `${RECORDS_BASE}/${encodePathSegment(entityCode)}/bulk/preflight`,
  bulkAction:      (entityCode: string) =>
    `${RECORDS_BASE}/${encodePathSegment(entityCode)}/bulk/action`,
  lock:            (entityCode: string, recordId: string) =>
    `${RECORDS_BASE}/${encodePathSegment(entityCode)}/${encodePathSegment(recordId)}/lock`,
  submitPreflight: (entityCode: string, recordId: string) =>
    `${RECORDS_BASE}/${encodePathSegment(entityCode)}/${encodePathSegment(recordId)}/submit-preflight`,
};

/**
 * Serialize a FilterEntry to a URL sigil string.
 * Format: op:value — e.g. "neq:foo", "in:a,b,c", "gt:100", "null"
 * Simple equality emits the bare value (no prefix) for URL readability.
 */
export function serializeFilterEntry(entry: FilterEntry): string | null {
  if ("eq"     in entry) return entry.eq     != null ? String(entry.eq)            : null;
  if ("neq"    in entry) return entry.neq    != null ? `neq:${String(entry.neq)}`  : null;
  if ("in"     in entry) return entry.in.length > 0  ? `in:${entry.in.join(",")}`  : null;
  if ("nin"    in entry) return entry.nin.length > 0  ? `nin:${entry.nin.join(",")}` : null;
  if ("gt"     in entry) return entry.gt     != null ? `gt:${String(entry.gt)}`    : null;
  if ("gte"    in entry) return entry.gte    != null ? `gte:${String(entry.gte)}`  : null;
  if ("lt"     in entry) return entry.lt     != null ? `lt:${String(entry.lt)}`    : null;
  if ("lte"    in entry) return entry.lte    != null ? `lte:${String(entry.lte)}`  : null;
  if ("like"   in entry) return                        `like:${entry.like}`;
  if ("ilike"  in entry) return                        `ilike:${entry.ilike}`;
  if ("isNull" in entry) return entry.isNull           ? "null"      : "notnull";
  return null;
}
