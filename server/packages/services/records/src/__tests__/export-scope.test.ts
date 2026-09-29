import { expect, it } from "vitest";
import { assertSelectedExportScope } from "../transfer/export-scope.js";

it("rejects selected exports without an explicit nonempty record set", () => {
  for (const filter of [
    { _transfer: { scope: "selected" } },
    { _transfer: { scope: "selected" }, recordIds: [] },
    { _transfer: { scope: "selected" }, recordIds: [null] },
  ])
    expect(() => assertSelectedExportScope(filter)).toThrow("Selected export requires explicit record IDs");
  expect(() => assertSelectedExportScope({ _transfer: { scope: "selected" }, recordIds: ["record"] })).not.toThrow();
  expect(() => assertSelectedExportScope({ _transfer: { scope: "filtered" } })).not.toThrow();
});
