import assert from "node:assert/strict";
import test from "node:test";
import {
  isUntouchedOptionalCreateField,
  normalizeFieldValue,
} from "../../packages/platform/entity/runtime/form-detail/src/form-values";

const field = (kind: string, required = false) => ({ kind, required }) as never;

test("clears an empty optional field with null", () => {
  for (const kind of ["text", "integer", "decimal", "money", "date"]) {
    assert.equal(normalizeFieldValue("", field(kind)), null);
    assert.equal(normalizeFieldValue(undefined, field(kind)), null);
  }
});

test("omits an untouched optional field only during create", () => {
  assert.equal(isUntouchedOptionalCreateField(undefined, field("text")), true);
  assert.equal(isUntouchedOptionalCreateField("", field("text")), false);
  assert.equal(
    isUntouchedOptionalCreateField(undefined, field("text", true)),
    false,
  );
});

test("never coerces an empty required number to zero", () => {
  for (const kind of ["integer", "decimal", "money"]) {
    assert.equal(normalizeFieldValue("", field(kind, true)), "");
    assert.equal(normalizeFieldValue("   ", field(kind, true)), "   ");
    assert.equal(normalizeFieldValue(undefined, field(kind, true)), undefined);
  }
});

test("parses numeric strings", () => {
  assert.equal(normalizeFieldValue("42", field("integer", true)), 42);
  assert.equal(normalizeFieldValue("-1.5", field("decimal")), -1.5);
  assert.equal(normalizeFieldValue("0", field("money", true)), 0);
});

test("leaves non-numeric input unchanged for the server to reject", () => {
  assert.equal(normalizeFieldValue("abc", field("integer", true)), "abc");
  assert.equal(normalizeFieldValue("1e999", field("decimal")), "1e999");
});

test("passes non-number kinds through", () => {
  assert.equal(normalizeFieldValue("Norway", field("text", true)), "Norway");
  assert.equal(normalizeFieldValue(true, field("boolean", true)), true);
  assert.equal(normalizeFieldValue("", field("text", true)), "");
});
