import { expect, it } from "vitest";
import { assertExportFieldAdmission } from "./export-admission.js";

const descriptor = {
  fields: [
    { key: "code", classification: "public" },
    { key: "name", classification: "internal" },
    { key: "tax_id", classification: "sensitive_pii" },
    { key: "unclassified" },
  ],
} as never;

it("allows only explicitly classified ordinary-disclosure fields", () => {
  expect(() =>
    assertExportFieldAdmission(descriptor, ["code", "name"]),
  ).not.toThrow();
  for (const [fields, code] of [
    [["tax_id"], "EXPORT_FIELD_CLASSIFICATION_FORBIDDEN"],
    [["unclassified"], "EXPORT_FIELD_CLASSIFICATION_REQUIRED"],
    [["unknown"], "EXPORT_FIELD_UNREGISTERED"],
  ] as const)
    expect(() => assertExportFieldAdmission(descriptor, fields)).toThrow(
      expect.objectContaining({ code }),
    );
});
