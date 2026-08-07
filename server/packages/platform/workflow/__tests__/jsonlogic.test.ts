/**
 * evaluateJsonLogic — pure unit tests.
 *
 * No mocks required — the function has zero dependencies.
 * Covers every operator that workflow / policy conditions use.
 */

import { evaluateJsonLogic } from "../jsonlogic.js";

describe("evaluateJsonLogic", () => {

  // ── Trivial cases ────────────────────────────────────────────────────────────

  it("null rule → always true", () => {
    expect(evaluateJsonLogic(null, {})).toBe(true);
  });

  it("undefined rule → always true", () => {
    expect(evaluateJsonLogic(undefined, {})).toBe(true);
  });

  it("true literal → true", () => {
    expect(evaluateJsonLogic(true, {})).toBe(true);
  });

  it("false literal → false", () => {
    expect(evaluateJsonLogic(false, {})).toBe(false);
  });

  // ── var ──────────────────────────────────────────────────────────────────────

  it("var: resolves top-level field", () => {
    expect(evaluateJsonLogic({ var: "status" }, { status: "active" })).toBe(true);
    expect(evaluateJsonLogic({ var: "status" }, { status: "" })).toBe(false);
  });

  it("var: resolves nested dot-path", () => {
    expect(
      evaluateJsonLogic({ var: "order.amount" }, { order: { amount: 500 } }),
    ).toBe(true);
    expect(
      evaluateJsonLogic({ var: "order.amount" }, { order: { amount: 0 } }),
    ).toBe(false);
  });

  it("var: returns default when path is missing", () => {
    expect(
      evaluateJsonLogic({ var: ["missing_field", false] }, {}),
    ).toBe(false);
  });

  // ── Equality operators ───────────────────────────────────────────────────────

  it("==  performs loose equality", () => {
    expect(evaluateJsonLogic({ "==": [{ var: "n" }, "1"] }, { n: 1 })).toBe(true);
    expect(evaluateJsonLogic({ "==": [{ var: "n" }, "2"] }, { n: 1 })).toBe(false);
  });

  it("=== performs strict equality", () => {
    expect(evaluateJsonLogic({ "===": [{ var: "n" }, 1] }, { n: 1 })).toBe(true);
    expect(evaluateJsonLogic({ "===": [{ var: "n" }, "1"] }, { n: 1 })).toBe(false);
  });

  it("!=  performs loose inequality", () => {
    expect(evaluateJsonLogic({ "!=": [{ var: "x" }, null] }, { x: "value" })).toBe(true);
    expect(evaluateJsonLogic({ "!=": [{ var: "x" }, null] }, { x: null })).toBe(false);
  });

  it("!== performs strict inequality", () => {
    expect(evaluateJsonLogic({ "!==": [{ var: "x" }, 0] }, { x: "0" })).toBe(true);
    expect(evaluateJsonLogic({ "!==": [{ var: "x" }, 0] }, { x: 0 })).toBe(false);
  });

  // ── Comparison operators ─────────────────────────────────────────────────────

  it(">  greater than", () => {
    expect(evaluateJsonLogic({ ">": [{ var: "amount" }, 100] }, { amount: 200 })).toBe(true);
    expect(evaluateJsonLogic({ ">": [{ var: "amount" }, 100] }, { amount: 100 })).toBe(false);
  });

  it(">= greater than or equal", () => {
    expect(evaluateJsonLogic({ ">=": [{ var: "amount" }, 100] }, { amount: 100 })).toBe(true);
    expect(evaluateJsonLogic({ ">=": [{ var: "amount" }, 100] }, { amount: 99 })).toBe(false);
  });

  it("<  less than", () => {
    expect(evaluateJsonLogic({ "<": [{ var: "n" }, 10] }, { n: 5 })).toBe(true);
    expect(evaluateJsonLogic({ "<": [{ var: "n" }, 10] }, { n: 10 })).toBe(false);
  });

  it("<  three-operand range check", () => {
    // 1 < n < 10
    expect(evaluateJsonLogic({ "<": [1, { var: "n" }, 10] }, { n: 5 })).toBe(true);
    expect(evaluateJsonLogic({ "<": [1, { var: "n" }, 10] }, { n: 0 })).toBe(false);
    expect(evaluateJsonLogic({ "<": [1, { var: "n" }, 10] }, { n: 10 })).toBe(false);
  });

  it("<= less than or equal, three-operand", () => {
    expect(evaluateJsonLogic({ "<=": [1, { var: "n" }, 10] }, { n: 1 })).toBe(true);
    expect(evaluateJsonLogic({ "<=": [1, { var: "n" }, 10] }, { n: 10 })).toBe(true);
    expect(evaluateJsonLogic({ "<=": [1, { var: "n" }, 10] }, { n: 11 })).toBe(false);
  });

  // ── Logical operators ────────────────────────────────────────────────────────

  it("and: all must be true", () => {
    expect(evaluateJsonLogic(
      { and: [{ "===": [{ var: "a" }, 1] }, { "===": [{ var: "b" }, 2] }] },
      { a: 1, b: 2 },
    )).toBe(true);
    expect(evaluateJsonLogic(
      { and: [{ "===": [{ var: "a" }, 1] }, { "===": [{ var: "b" }, 2] }] },
      { a: 1, b: 3 },
    )).toBe(false);
  });

  it("or: any must be true", () => {
    expect(evaluateJsonLogic(
      { or: [{ "===": [{ var: "a" }, 1] }, { "===": [{ var: "b" }, 2] }] },
      { a: 0, b: 2 },
    )).toBe(true);
    expect(evaluateJsonLogic(
      { or: [{ "===": [{ var: "a" }, 1] }, { "===": [{ var: "b" }, 2] }] },
      { a: 0, b: 0 },
    )).toBe(false);
  });

  it("not / ! negates", () => {
    expect(evaluateJsonLogic({ not: [{ "===": [{ var: "x" }, 1] }] }, { x: 2 })).toBe(true);
    expect(evaluateJsonLogic({ "!": [{ "===": [{ var: "x" }, 1] }] }, { x: 1 })).toBe(false);
  });

  // ── in ───────────────────────────────────────────────────────────────────────

  it("in: value in array", () => {
    expect(
      evaluateJsonLogic({ in: [{ var: "role" }, ["admin", "manager"]] }, { role: "admin" }),
    ).toBe(true);
    expect(
      evaluateJsonLogic({ in: [{ var: "role" }, ["admin", "manager"]] }, { role: "viewer" }),
    ).toBe(false);
  });

  it("in: substring in string", () => {
    expect(
      evaluateJsonLogic({ in: ["@company.com", { var: "email" }] }, { email: "user@company.com" }),
    ).toBe(true);
  });

  // ── missing / missing_some ───────────────────────────────────────────────────

  it("missing: true when any listed key is absent", () => {
    expect(evaluateJsonLogic({ missing: ["a", "b"] }, { a: 1 })).toBe(true);
    expect(evaluateJsonLogic({ missing: ["a", "b"] }, { a: 1, b: 2 })).toBe(false);
  });

  it("missing_some: true when fewer than required keys are present", () => {
    // require 2 of [a, b, c] — only a is present → true
    expect(evaluateJsonLogic({ missing_some: [2, ["a", "b", "c"]] }, { a: 1 })).toBe(true);
    // a and b present → false
    expect(evaluateJsonLogic({ missing_some: [2, ["a", "b", "c"]] }, { a: 1, b: 2 })).toBe(false);
  });

  // ── Nested conditions ────────────────────────────────────────────────────────

  it("complex nested: amount > 1000 AND status == 'pending'", () => {
    const rule = {
      and: [
        { ">": [{ var: "amount" }, 1000] },
        { "===": [{ var: "status" }, "pending"] },
      ],
    };
    expect(evaluateJsonLogic(rule, { amount: 1500, status: "pending" })).toBe(true);
    expect(evaluateJsonLogic(rule, { amount: 500, status: "pending" })).toBe(false);
    expect(evaluateJsonLogic(rule, { amount: 1500, status: "approved" })).toBe(false);
  });

  it("unknown operator: fails closed", () => {
    expect(() => evaluateJsonLogic({ someUnknownOp: ["x"] }, {})).toThrow(
      /JSONLOGIC_UNKNOWN_OPERATOR/,
    );
  });

  it("unknown nested operator: fails closed", () => {
    expect(() =>
      evaluateJsonLogic(
        { and: [{ "===": [{ var: "status" }, "pending"] }, { typo: [true] }] },
        { status: "pending" },
      ),
    ).toThrow(/JSONLOGIC_UNKNOWN_OPERATOR/);
  });
});
