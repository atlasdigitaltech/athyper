import { describe, expect, it } from "vitest";
import { createJsonRuleEvaluator, PolicyExpressionError } from "../json-rule-evaluator.js";

describe("bounded JSON rule evaluator", () => {
  const evaluator = createJsonRuleEvaluator();
  it("treats the DDL default empty condition object as an unconditional match", () => { expect(evaluator.evaluate({}, {})).toBe(true); });
  it("evaluates nested comparisons, ranges, membership, and missing facts", () => {
    const facts = { amount: 2_500, supplier: { risk: "high" }, tags: ["strategic"] };
    expect(evaluator.evaluate({ and: [{ ">": [{ var: "amount" }, 1_000] }, { in: ["strategic", { var: "tags" }] }, { "!": { missing: ["supplier.risk"] } }] }, facts)).toBe(true);
  });
  it("returns JSONLogic values for conditional and arithmetic expressions", () => {
    expect(evaluator.evaluate({ if: [{ ">=": [{ var: "score" }, 80] }, { "+": [{ var: "score" }, 5] }, 0] }, { score: 90 })).toBe(95);
  });
  it("fails closed on unknown operators and prototype paths", () => {
    expect(() => evaluator.evaluate({ execute: ["anything"] }, {})).toThrow(PolicyExpressionError);
    expect(evaluator.evaluate({ var: ["__proto__.polluted", "safe"] }, {})).toBe("safe");
  });
  it("enforces depth and node budgets", () => {
    const bounded = createJsonRuleEvaluator({ maxDepth: 2, maxNodes: 5 });
    expect(() => bounded.evaluate({ "!": { "!": { "!": true } } }, {})).toThrow(/depth|node/i);
  });
});

it("treats inherited properties as missing facts", () => {
  const evaluator = createJsonRuleEvaluator();
  expect(evaluator.evaluate({ var: ["toString", "missing"] }, {})).toBe("missing");
  expect(evaluator.evaluate({ missing: ["valueOf", "nested.toString"] }, { nested: {} })).toEqual(["valueOf", "nested.toString"]);
  expect(evaluator.evaluate({ var: "nested.toString" }, { nested: { toString: "own fact" } })).toBe("own fact");
});
