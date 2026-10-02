import { expect, it } from "vitest";
import { parseEntityKeyReference } from "./key-reference.js";
const valid = {
  targetEntity: "region",
  labelField: "name",
  fields: [
    { source: "nation", target: "nation" },
    { source: "parent_code", target: "code" },
  ],
};
it("accepts declared composite field keys", () =>
  expect(parseEntityKeyReference(valid, "parent_code")).toEqual(valid));
it.each([
  { ...valid, query: "SELECT *" },
  { ...valid, targetEntity: "shared.region" },
  { ...valid, fields: [] },
  { ...valid, fields: [...valid.fields, valid.fields[0]] },
  {
    ...valid,
    fields: [{ source: "parent_code", target: "code", sql: "code" }],
  },
  { ...valid, fields: [{ source: "nation", target: "nation" }] },
])(
  "rejects unqualified, executable or incomplete reference metadata",
  (value) =>
    expect(() => parseEntityKeyReference(value, "parent_code")).toThrow(
      "ENTITY_KEY_REFERENCE_INVALID",
    ),
);
