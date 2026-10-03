import { expect, it } from "vitest";
import {
  parseStructuredProjection,
  validateStructuredProjectionValue,
} from "./structured-projection.js";
const field = { key: "target", type: "uuid", nullable: true };
it.each([
  { kind: "object_array", maxItems: 0, fields: [field] },
  { kind: "object_array", maxItems: 1001, fields: [field] },
  { kind: "object_array", maxItems: 1, fields: [field, field] },
  { kind: "object_array", maxItems: 1, fields: [{ ...field, type: "json" }] },
  { kind: "object_array", maxItems: 1, fields: [field], lookup: "arbitrary" },
])(
  "rejects unsupported or unbounded published nested declarations",
  (value) => {
    expect(() => parseStructuredProjection(value)).toThrow();
  },
);
it("validates nullable technical references without authorizing target lookup", () => {
  const schema = parseStructuredProjection({
    kind: "object_array",
    maxItems: 2,
    fields: [field],
  });
  expect(() =>
    validateStructuredProjectionValue(
      [{ target: null }, { target: "11111111-1111-4111-8111-111111111111" }],
      schema,
    ),
  ).not.toThrow();
  expect(() =>
    validateStructuredProjectionValue([{ target: "secret-raw-text" }], schema),
  ).toThrow();
  expect(() => validateStructuredProjectionValue([{}], schema)).toThrow();
});
