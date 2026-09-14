import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateDataInput,
  parseValidationMessages,
  DataValidationError,
} from "../../packages/contracts/platform/entity-runtime/src/validation-messages";
import { dataSurfaceValues } from "../../packages/contracts/platform/entity-runtime/src/intake-data-values";
const field = {
  control: "input" as const,
  key: "name",
  valueKey: "name",
  label: "Registered name",
  required: true,
  widget: "text" as const,
  maxLength: 100,
  columnSpan: 3,
};
test("required takes priority; length uses Unicode code points and metadata parameters", () => {
  assert.equal(validateDataInput(field, "   ")?.code, "required");
  assert.equal(validateDataInput(field, "a".repeat(100)), undefined);
  assert.equal(validateDataInput(field, "😀".repeat(100)), undefined);
  assert.deepEqual(validateDataInput(field, "a".repeat(101)), {
    fieldPath: "name",
    code: "maxLength",
    messageKey: "validation.maxLength",
    params: { field: "Registered name", max: 100 },
  });
});
test("field message overrides entity defaults; keys reject invalid metadata", () => {
  assert.equal(
    validateDataInput(field, "", { required: "bp.required" })?.messageKey,
    "bp.required",
  );
  assert.equal(
    validateDataInput(
      { ...field, validationMessages: { required: "bp.name.required" } },
      "",
      { required: "bp.required" },
    )?.messageKey,
    "bp.name.required",
  );
  assert.throws(() => parseValidationMessages({ required: "<script>" }));
  assert.throws(() => parseValidationMessages({ execute: "arbitrary.code" }));
});
test("shared value boundary returns structured errors and ignores hidden fields", () => {
  const surface = {
    schemaVersion: 1 as const,
    key: "details",
    title: "Details",
    columns: 1 as const,
    validationMessages: { maxLength: "bp.name.length" },
    sections: [{ key: "identity", fields: [field] }],
  };
  assert.throws(
    () => dataSurfaceValues(surface, [surface], { name: "a".repeat(101) }),
    (e) =>
      e instanceof DataValidationError &&
      e.issues[0]?.messageKey === "bp.name.length",
  );
  assert.deepEqual(dataSurfaceValues(surface, [surface], { name: " Good " }), {
    name: "Good",
  });
});
