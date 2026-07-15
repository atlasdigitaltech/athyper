/**
 * Unit tests for the apportionment breakup drawer helpers.
 *
 * Covers the semantic surface the AP route exposes via `?cursor`, `?tab`,
 * and `?q` query params + the CSV row escape. The route's SQL layer
 * binds these values as parameters; the helpers below are the only line
 * of defense against unbounded LIKE scans, smallint overflow, and
 * accidental wildcard expansion.
 *
 * Integration cases that require a live DB (tab + q + cursor composition,
 * the actual SQL output for each filter branch) are stubbed as `it.todo`
 * at the bottom of the file — they document what needs DB fixtures and
 * are wired up when the project's integration-test harness exists.
 */

import { describe, expect, it } from "vitest";
import {
  APPORTIONMENT_CSV_MAX_ROWS,
  csvField,
  encodeApportionmentCursor,
  parseApportionmentCursor,
  parseApportionmentQuery,
  parseApportionmentTab,
} from "../apportionment-helpers.js";

// ─── parseApportionmentQuery ──────────────────────────────────────────

describe("parseApportionmentQuery — empty / whitespace", () => {
  it("returns none for undefined", () => {
    expect(parseApportionmentQuery(undefined)).toEqual({ kind: "none" });
  });
  it("returns none for null", () => {
    expect(parseApportionmentQuery(null)).toEqual({ kind: "none" });
  });
  it("returns none for non-string types", () => {
    expect(parseApportionmentQuery(42)).toEqual({ kind: "none" });
    expect(parseApportionmentQuery({})).toEqual({ kind: "none" });
    expect(parseApportionmentQuery([])).toEqual({ kind: "none" });
  });
  it("returns none for the empty string", () => {
    expect(parseApportionmentQuery("")).toEqual({ kind: "none" });
  });
  it("returns none for whitespace-only input", () => {
    expect(parseApportionmentQuery("   ")).toEqual({ kind: "none" });
    expect(parseApportionmentQuery("\t\n  ")).toEqual({ kind: "none" });
  });
});

describe("parseApportionmentQuery — numeric / line_no", () => {
  it("matches a single digit line number", () => {
    expect(parseApportionmentQuery("1")).toEqual({ kind: "line_no", value: 1 });
    expect(parseApportionmentQuery("5")).toEqual({ kind: "line_no", value: 5 });
  });
  it("matches a multi-digit line number", () => {
    expect(parseApportionmentQuery("247")).toEqual({ kind: "line_no", value: 247 });
  });
  it("matches the upper smallint bound (32767)", () => {
    expect(parseApportionmentQuery("32767")).toEqual({ kind: "line_no", value: 32767 });
  });
  it("trims surrounding whitespace before matching digits", () => {
    expect(parseApportionmentQuery("  42  ")).toEqual({ kind: "line_no", value: 42 });
  });
  it("returns none for 0 (line_no >= 1)", () => {
    expect(parseApportionmentQuery("0")).toEqual({ kind: "none" });
  });
  it("returns none for smallint overflow (>32767)", () => {
    expect(parseApportionmentQuery("32768")).toEqual({ kind: "none" });
    expect(parseApportionmentQuery("99999")).toEqual({ kind: "none" });
    expect(parseApportionmentQuery("1000000")).toEqual({ kind: "none" });
  });
  it("does NOT treat '-1' as line_no (leading minus → non-numeric pattern)", () => {
    // `-1` fails the /^\d+$/ test and is 2 chars → text branch + escape
    expect(parseApportionmentQuery("-1")).toEqual({ kind: "text", value: "-1" });
  });
});

describe("parseApportionmentQuery — text / description", () => {
  it("matches ≥ 2-char text input", () => {
    expect(parseApportionmentQuery("ab")).toEqual({ kind: "text", value: "ab" });
    expect(parseApportionmentQuery("Laptop")).toEqual({ kind: "text", value: "Laptop" });
    expect(parseApportionmentQuery("Service contract")).toEqual({
      kind: "text", value: "Service contract",
    });
  });
  it("trims surrounding whitespace before length check", () => {
    expect(parseApportionmentQuery("  Laptop  ")).toEqual({ kind: "text", value: "Laptop" });
  });
  it("returns none for single non-numeric char (avoids broad LIKE %a% scan)", () => {
    expect(parseApportionmentQuery("a")).toEqual({ kind: "none" });
    expect(parseApportionmentQuery("Z")).toEqual({ kind: "none" });
    expect(parseApportionmentQuery("$")).toEqual({ kind: "none" });
  });
  it("returns none for single char after trim", () => {
    expect(parseApportionmentQuery("  q  ")).toEqual({ kind: "none" });
  });
});

describe("parseApportionmentQuery — wildcard escape (security-critical)", () => {
  it("escapes % so q=100% matches literal '100%' (not 'any value containing 100')", () => {
    expect(parseApportionmentQuery("100%")).toEqual({ kind: "text", value: "100\\%" });
  });
  it("escapes _ so q=50_off matches literal underscore (not 'any single char')", () => {
    expect(parseApportionmentQuery("50_off")).toEqual({ kind: "text", value: "50\\_off" });
  });
  it("escapes \\ so q=back\\slash is literal", () => {
    expect(parseApportionmentQuery("back\\slash")).toEqual({
      kind: "text", value: "back\\\\slash",
    });
  });
  it("escapes multiple wildcards in one input", () => {
    expect(parseApportionmentQuery("100%_off\\")).toEqual({
      kind: "text", value: "100\\%\\_off\\\\",
    });
  });
  it("does NOT escape other special chars (single quote, semicolon)", () => {
    // These are safe under parameterized SQL binding — only LIKE wildcards
    // need escaping. Single quotes can't end a string in a bound parameter.
    expect(parseApportionmentQuery("O'Brien")).toEqual({ kind: "text", value: "O'Brien" });
    expect(parseApportionmentQuery("a;DROP")).toEqual({ kind: "text", value: "a;DROP" });
  });
});

// ─── parseApportionmentTab ────────────────────────────────────────────

describe("parseApportionmentTab", () => {
  it("returns 'all' for undefined / non-string", () => {
    expect(parseApportionmentTab(undefined)).toBe("all");
    expect(parseApportionmentTab(null)).toBe("all");
    expect(parseApportionmentTab(42)).toBe("all");
  });
  it("returns the value when it matches an allowed tab", () => {
    expect(parseApportionmentTab("all")).toBe("all");
    expect(parseApportionmentTab("overrides")).toBe("overrides");
    expect(parseApportionmentTab("top")).toBe("top");
  });
  it("falls back to 'all' for unknown strings (no error)", () => {
    expect(parseApportionmentTab("nope")).toBe("all");
    expect(parseApportionmentTab("")).toBe("all");
    expect(parseApportionmentTab("ALL")).toBe("all"); // case-sensitive enum
    expect(parseApportionmentTab("TOP")).toBe("all"); // case-sensitive
  });
});

// ─── parseApportionmentCursor + encodeApportionmentCursor ─────────────

describe("parseApportionmentCursor — common failure modes", () => {
  it("returns null for undefined / empty", () => {
    expect(parseApportionmentCursor(undefined)).toBeNull();
    expect(parseApportionmentCursor("")).toBeNull();
  });
  it("returns null for malformed base64", () => {
    expect(parseApportionmentCursor("not-base64-!@#$")).toBeNull();
  });
  it("returns null when pil_id is missing or not a valid UUID", () => {
    const bad1 = Buffer.from(JSON.stringify({ line_no: 1 }), "utf-8").toString("base64url");
    const bad2 = Buffer.from(JSON.stringify({ line_no: 1, pil_id: "not-a-uuid" }), "utf-8").toString("base64url");
    expect(parseApportionmentCursor(bad1)).toBeNull();
    expect(parseApportionmentCursor(bad2)).toBeNull();
  });
  it("returns null for unknown cursor kind", () => {
    const bad = Buffer.from(
      JSON.stringify({ kind: "future_sort_mode", pil_id: "01900000-0000-7000-8000-000000000001" }),
      "utf-8",
    ).toString("base64url");
    expect(parseApportionmentCursor(bad)).toBeNull();
  });
});

describe("parseApportionmentCursor — line_no_asc variant (all / overrides tabs)", () => {
  it("legacy cursor without `kind` defaults to line_no_asc (Phase 4 compat)", () => {
    const pil = "01900000-0000-7000-8000-000000000001";
    const enc = Buffer.from(JSON.stringify({ line_no: 42, pil_id: pil }), "utf-8")
      .toString("base64url");
    expect(parseApportionmentCursor(enc)).toEqual({
      kind: "line_no_asc", line_no: 42, pil_id: pil,
    });
  });
  it("explicit kind=line_no_asc parses", () => {
    const pil = "01900000-0000-7000-8000-000000000abc";
    const enc = Buffer.from(
      JSON.stringify({ kind: "line_no_asc", line_no: 7, pil_id: pil }),
      "utf-8",
    ).toString("base64url");
    expect(parseApportionmentCursor(enc)).toEqual({
      kind: "line_no_asc", line_no: 7, pil_id: pil,
    });
  });
  it("returns null when line_no is a string instead of number", () => {
    const bad = Buffer.from(
      JSON.stringify({ kind: "line_no_asc", line_no: "1", pil_id: "01900000-0000-7000-8000-000000000001" }),
      "utf-8",
    ).toString("base64url");
    expect(parseApportionmentCursor(bad)).toBeNull();
  });
});

describe("parseApportionmentCursor — basis_desc variant (top tab)", () => {
  it("parses kind=basis_desc with numeric-string basis_value", () => {
    const pil = "01900000-0000-7000-8000-00000000face";
    const enc = Buffer.from(
      JSON.stringify({ kind: "basis_desc", basis_value: "780.00", pil_id: pil }),
      "utf-8",
    ).toString("base64url");
    expect(parseApportionmentCursor(enc)).toEqual({
      kind: "basis_desc", basis_value: "780.00", pil_id: pil,
    });
  });
  it("returns null when basis_value is empty", () => {
    const bad = Buffer.from(
      JSON.stringify({ kind: "basis_desc", basis_value: "", pil_id: "01900000-0000-7000-8000-000000000001" }),
      "utf-8",
    ).toString("base64url");
    expect(parseApportionmentCursor(bad)).toBeNull();
  });
  it("returns null when basis_value is not a parseable number", () => {
    const bad = Buffer.from(
      JSON.stringify({ kind: "basis_desc", basis_value: "not-a-number", pil_id: "01900000-0000-7000-8000-000000000001" }),
      "utf-8",
    ).toString("base64url");
    expect(parseApportionmentCursor(bad)).toBeNull();
  });
  it("accepts scientific-notation numeric strings (preserves precision)", () => {
    const enc = Buffer.from(
      JSON.stringify({ kind: "basis_desc", basis_value: "1.5e3", pil_id: "01900000-0000-7000-8000-000000000001" }),
      "utf-8",
    ).toString("base64url");
    expect(parseApportionmentCursor(enc)?.kind).toBe("basis_desc");
  });
});

describe("encodeApportionmentCursor", () => {
  it("round-trips line_no_asc", () => {
    const pil = "01900000-0000-7000-8000-00000000abcd";
    const enc = encodeApportionmentCursor({ kind: "line_no_asc", line_no: 123, pil_id: pil });
    expect(parseApportionmentCursor(enc)).toEqual({
      kind: "line_no_asc", line_no: 123, pil_id: pil,
    });
  });
  it("round-trips basis_desc", () => {
    const pil = "01900000-0000-7000-8000-00000000c0de";
    const enc = encodeApportionmentCursor({
      kind: "basis_desc", basis_value: "1234.5678", pil_id: pil,
    });
    expect(parseApportionmentCursor(enc)).toEqual({
      kind: "basis_desc", basis_value: "1234.5678", pil_id: pil,
    });
  });
  it("produces a URL-safe (base64url) string", () => {
    const enc = encodeApportionmentCursor({
      kind: "line_no_asc", line_no: 1, pil_id: "01900000-0000-7000-8000-000000000001",
    });
    // base64url uses - and _ but no + or / or =
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

// ─── csvField (RFC 4180 escape) ───────────────────────────────────────

describe("csvField", () => {
  it("returns empty string for null / undefined", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });
  it("passes through plain strings unwrapped", () => {
    expect(csvField("hello")).toBe("hello");
    expect(csvField("Laptop")).toBe("Laptop");
  });
  it("stringifies numbers without wrapping", () => {
    expect(csvField(42)).toBe("42");
    expect(csvField(3.14)).toBe("3.14");
    expect(csvField(0)).toBe("0");
  });
  it("wraps and escapes fields containing commas", () => {
    expect(csvField("a, b, c")).toBe('"a, b, c"');
  });
  it("wraps and escapes fields containing double quotes", () => {
    expect(csvField('she said "hi"')).toBe('"she said ""hi"""');
  });
  it("wraps fields containing CR or LF", () => {
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
    expect(csvField("carriage\rreturn")).toBe('"carriage\rreturn"');
    expect(csvField("CRLF\r\nhere")).toBe('"CRLF\r\nhere"');
  });
});

// ─── Constants ────────────────────────────────────────────────────────

describe("constants", () => {
  it("APPORTIONMENT_CSV_MAX_ROWS matches the records-export cap", () => {
    expect(APPORTIONMENT_CSV_MAX_ROWS).toBe(10_000);
  });
});

// ─── Integration stubs (live DB required) ─────────────────────────────
//
// These cases need a live DB with seeded fixtures: one PI with 3 PILs
// ("Laptop" / "Service contract" / "100% support"), one header PC
// apportioned across all 3, one manual override on the middle line.
// Wire up when the project's integration harness is available — the
// pure helpers above already cover the parsing surface; these test the
// SQL composition + cursor stability under concurrent state.

const LIVE_DATABASE_URL =
  process.env["FINANCE_INTEGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"];
const maybeDescribe = LIVE_DATABASE_URL ? describe : describe.skip;

maybeDescribe("apportionment route — q semantics (live DB)", () => {
  it.todo("?q= empty returns all 3 rows (no LIKE scan in EXPLAIN)");
  it.todo("?q=Laptop returns line 1 only (case-insensitive)");
  it.todo("?q=laptop returns line 1 only (ILIKE confirms case-insensitivity)");
  it.todo("?q=2 returns line 2 only (line_no exact match, ILIKE not run)");
  it.todo("?q=100% returns line 3 only (escape works — does NOT match all rows)");
  it.todo("?q=50_off returns 0 rows (underscore escaped — does NOT match 'NN-off')");
  it.todo("?q=a returns all 3 rows (single-char text rejected → no filter)");
  it.todo("?q=12345 returns 0 rows (line_no out of fixture range, line_no path)");
  it.todo("?q=99999 returns all 3 (smallint overflow → no filter)");

  it.todo("?q=Laptop&tab=overrides returns 0 (line 1 has no override)");
  it.todo("?q=Service&tab=overrides returns 1 (line 2 has override)");

  it.todo("?q=Service with cursor — page 1 + page 2 yield consistent unique slice");
  it.todo("?q=Service&format=csv returns CSV with only line 2's row");
  it.todo("?q=Service&format=csv requires purchase_invoice.export permission");
});
