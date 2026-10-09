import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDecimals, averageDecimals, compareDecimals, exactAggregate, isExactDecimal } from "../../packages/contracts/platform/entity-list/src/decimal";

// Exact decimal arithmetic for group aggregates (Entity list Tree blueprint A2).
describe("exact decimals", () => {
  it("adds without a floating-point round trip", () => {
    assert.equal(addDecimals(["12345678901234.56", "0.01"]), "12345678901234.57");
    assert.equal(addDecimals([0.1, 0.2]), "0.3");
    assert.equal(addDecimals(["-5.5", "5.50"]), "0");
    assert.equal(addDecimals(["100", 250.5, "-0.25"]), "350.25");
  });

  it("compares and averages exactly", () => {
    assert.equal(compareDecimals("12345678901234.57", "12345678901234.56"), 1);
    assert.equal(compareDecimals("2.50", 2.5), 0);
    assert.equal(compareDecimals("-1", "0"), -1);
    assert.equal(averageDecimals(["1", "2"]), "1.5");
    assert.equal(averageDecimals(["10", "10", "11"], 4), "10.3333");
  });

  it("keeps a value as a number only when that is exact", () => {
    assert.equal(exactAggregate("1705000.00"), 1705000);
    assert.equal(exactAggregate("12.50"), 12.5);
    assert.equal(exactAggregate("12345678901234567890.12"), "12345678901234567890.12");
    assert.equal(isExactDecimal("1.5e3"), false);
    assert.equal(isExactDecimal("0012"), false);
    assert.equal(isExactDecimal(Number.NaN), false);
  });
});
