import { describe, it, expect } from "vitest";
import { renderHook } from "../utils/render-hook";
import { useDocumentDirtyMap } from "../../object-page/use-document-dirty-map";
import type { DocumentSectionDescriptor } from "../../object-page/types";

const sections: DocumentSectionDescriptor[] = [
  { id: "__overview",      label: "Overview",   kind: "overview",      loadPolicy: "eager" },
  { id: "__lines",         label: "Lines",      kind: "lines",         loadPolicy: "nearViewport" },
  { id: "__distributions", label: "Accounting", kind: "distributions", loadPolicy: "nearViewport" },
];

describe("use-document-dirty-map", () => {
  it("default fieldToSection buckets every dirty field into the first section", () => {
    const { result } = renderHook(() => useDocumentDirtyMap({
      sections,
      pendingPatch: { supplier_id: "S1", description: "Updated" },
      fieldErrors: {},
    }));

    expect(result.current.dirtySectionIds.has("__overview")).toBe(true);
    expect(result.current.dirtySectionIds.has("__lines")).toBe(false);
    expect(result.current.dirtyCountBySection["__overview"]).toBe(2);
  });

  it("custom fieldToSection routes line:<id>:<field> errors to the Items tab", () => {
    const { result } = renderHook(() => useDocumentDirtyMap({
      sections,
      pendingPatch: {},
      fieldErrors: {
        "line:abc-123:quantity": "must be positive",
        "supplier_id":           "required",
      },
      fieldToSection: (name) =>
        name.startsWith("line:") ? "__lines" : "__overview",
    }));

    expect(result.current.errorSectionIds.has("__lines")).toBe(true);
    expect(result.current.errorSectionIds.has("__overview")).toBe(true);
    expect(result.current.errorCountBySection["__lines"]).toBe(1);
    expect(result.current.errorCountBySection["__overview"]).toBe(1);
  });

  it("firstErrorSectionId matches the declared `sections` order, not error insertion order", () => {
    const { result } = renderHook(() => useDocumentDirtyMap({
      sections,
      pendingPatch: {},
      fieldErrors: {
        // Errors keyed on different sections, intentionally not in section order.
        "line:abc:qty":  "x",
        "supplier_id":   "y",
      },
      fieldToSection: (name) =>
        name.startsWith("line:") ? "__lines" : "__overview",
    }));

    // __overview comes before __lines in `sections`, so it wins regardless
    // of which error was inserted first.
    expect(result.current.firstErrorSectionId).toBe("__overview");
    expect(result.current.firstErrorFieldName).toBe("supplier_id");
  });

  it("empty pending + empty errors → empty sets, null firstError", () => {
    const { result } = renderHook(() => useDocumentDirtyMap({
      sections,
      pendingPatch: {},
      fieldErrors: {},
    }));

    expect(result.current.dirtySectionIds.size).toBe(0);
    expect(result.current.errorSectionIds.size).toBe(0);
    expect(result.current.firstErrorSectionId).toBeNull();
    expect(result.current.firstErrorFieldName).toBeNull();
  });

  it("fieldToSection returning an unknown section ID is filtered out (defensive)", () => {
    const { result } = renderHook(() => useDocumentDirtyMap({
      sections,
      pendingPatch: { weird_field: "x" },
      fieldErrors: {},
      fieldToSection: () => "__nonexistent",
    }));

    // The unknown section ID is dropped — no badge would appear for it.
    expect(result.current.dirtySectionIds.size).toBe(0);
    expect(result.current.dirtyCountBySection["__nonexistent"]).toBeUndefined();
  });

  it("counts accumulate when multiple fields target the same section", () => {
    const { result } = renderHook(() => useDocumentDirtyMap({
      sections,
      pendingPatch: { a: 1, b: 2, c: 3 },
      fieldErrors: { a: "err1", b: "err2" },
    }));

    expect(result.current.dirtyCountBySection["__overview"]).toBe(3);
    expect(result.current.errorCountBySection["__overview"]).toBe(2);
  });
});
