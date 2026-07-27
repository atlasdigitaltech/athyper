/**
 * Apportionment breakup drawer — pure helpers.
 *
 * Extracted from ap.route.ts so the parsing + escaping logic can be
 * unit-tested without dragging in express + kysely. The route file
 * re-imports from here; nothing else should reference this module
 * (apportionment is a finance-internal concern).
 *
 * All helpers are pure: same input → same output, no side effects.
 * The SQL layer in ap.route.ts trusts these to validate + normalize
 * untrusted query-string input before binding to query parameters.
 */

import { isUuid } from "@athyper/svc-shared";

// ─── Pagination cursor ────────────────────────────────────────────────
//
// Base64url of a discriminated-union object. Two cursor shapes today:
//
//   - kind: "line_no_asc"  — pairs with tab=all|overrides (ORDER BY
//                            line_no ASC, pil_id ASC). The legacy /
//                            default ordering since Phase 4.
//   - kind: "basis_desc"   — pairs with tab=top (ORDER BY basis_value
//                            DESC, pil_id ASC). Added in Phase 5f.
//
// The cursor's kind MUST match the active tab's ordering — the route
// drops the cursor (falls back to first page) if it doesn't. Tab
// transitions reset the cursor client-side anyway, but the server-side
// validation keeps malformed deep-links from corrupting the page.
//
// Failure modes (bad b64, malformed JSON, missing fields, invalid UUID,
// non-numeric line_no, unknown kind) all return null.
//
// Legacy compat: cursors emitted by Phase 4 had no `kind` field. We
// treat those as `line_no_asc` so any in-flight UI doesn't crash on
// upgrade.

export type ApportionmentCursor =
  | { kind: "line_no_asc"; line_no: number;     pil_id: string }
  | { kind: "basis_desc";  basis_value: string; pil_id: string };

export function parseApportionmentCursor(raw: unknown): ApportionmentCursor | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf-8");
    const obj  = JSON.parse(json) as Record<string, unknown>;
    const pil_id = typeof obj["pil_id"] === "string" ? obj["pil_id"] : "";
    if (!isUuid(pil_id)) return null;

    const kind = typeof obj["kind"] === "string" ? obj["kind"] : "line_no_asc";

    if (kind === "line_no_asc") {
      const line_no = typeof obj["line_no"] === "number" ? obj["line_no"] : NaN;
      if (!Number.isFinite(line_no)) return null;
      return { kind: "line_no_asc", line_no, pil_id };
    }

    if (kind === "basis_desc") {
      // basis_value travels as a numeric string (PG numeric → text) so
      // precision survives the round-trip. Validate it parses cleanly.
      const basis_value = typeof obj["basis_value"] === "string" ? obj["basis_value"] : "";
      if (basis_value.length === 0 || !Number.isFinite(Number(basis_value))) return null;
      return { kind: "basis_desc", basis_value, pil_id };
    }

    return null;
  } catch {
    return null;
  }
}

export function encodeApportionmentCursor(cursor: ApportionmentCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64url");
}

// ─── Tab filter ───────────────────────────────────────────────────────

export const APPORTIONMENT_TABS = new Set(["all", "overrides", "top"] as const);
export type ApportionmentTab = "all" | "overrides" | "top";

export function parseApportionmentTab(raw: unknown): ApportionmentTab {
  const value = typeof raw === "string" ? raw : "all";
  return APPORTIONMENT_TABS.has(value as ApportionmentTab)
    ? (value as ApportionmentTab)
    : "all";
}

// ─── Search query (v3.1 Phase 5e) ─────────────────────────────────────
//
// Three-branch parser with the safety rules documented in the route's
// `parseApportionmentQuery` block. The SQL side pairs the `text` branch
// with `ESCAPE '\'` so the wildcard escape below works as intended.

export type ApportionmentQuery =
  | { kind: "none" }
  | { kind: "line_no"; value: number }
  | { kind: "text";    value: string };

/** PostgreSQL `smallint` range. line_no is `smallint NOT NULL`. */
const SMALLINT_MIN = 1;
const SMALLINT_MAX = 32767;

export function parseApportionmentQuery(raw: unknown): ApportionmentQuery {
  if (typeof raw !== "string") return { kind: "none" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "none" };

  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    if (n < SMALLINT_MIN || n > SMALLINT_MAX) return { kind: "none" };
    return { kind: "line_no", value: n };
  }

  // Non-numeric: require ≥ 2 chars after trim to avoid broad LIKE %a% scans
  if (trimmed.length < 2) return { kind: "none" };
  // Escape LIKE wildcards so user-typed `%`, `_`, `\` are literal
  const escaped = trimmed.replace(/[\\%_]/g, "\\$&");
  return { kind: "text", value: escaped };
}

// ─── CSV row escape (RFC 4180) ────────────────────────────────────────
//
// Wraps in double quotes when the value contains a comma, double quote,
// CR, or LF, and doubles up embedded double quotes. Numeric strings and
// other safe input pass through unwrapped.

export function csvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ─── CSV row cap ──────────────────────────────────────────────────────
//
// Hard cap matches the records export so a single download can't dump
// an unbounded result set. Apportionment rowcount equals PIL count per
// header PC, so 10k covers any realistic invoice without runaway files.

export const APPORTIONMENT_CSV_MAX_ROWS = 10_000;
