import { expect, it } from "vitest";
import { assertBoundedExportScope } from "../transfer/export-scope.js";

it("rejects record-bounded exports without an explicit nonempty record set", () => {
  for (const filter of [
    { _transfer: { scope: "selected" } },
    { _transfer: { scope: "selected" }, recordIds: [] },
    { _transfer: { scope: "selected" }, recordIds: [null] },
    { _transfer: { scope: "page" } },
    { _transfer: { scope: "page" }, recordIds: [] },
  ])
    expect(() => assertBoundedExportScope(filter)).toThrow("exports require explicit record IDs");
  expect(() => assertBoundedExportScope({ _transfer: { scope: "selected" }, recordIds: ["record"] })).not.toThrow();
  expect(() => assertBoundedExportScope({ _transfer: { scope: "page" }, recordIds: ["record"] })).not.toThrow();
  expect(() => assertBoundedExportScope({ _transfer: { scope: "filtered" } })).not.toThrow();
});
