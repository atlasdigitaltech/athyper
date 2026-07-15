import { describe, expect, it } from "vitest";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { resolveMetaEntityEditRoute } from "../meta-entity-edit-routing";

function descriptor(renderer: MetaEntityRuntimeDescriptor["renderer"]): MetaEntityRuntimeDescriptor {
  return {
    renderer,
    capabilities: { isReadOnly: renderer === "ledger" },
    ...(renderer === "document" ? { editRuntime: {} } : {}),
  } as MetaEntityRuntimeDescriptor;
}

describe("meta-entity edit route", () => {
  it.each([
    ["master", "classic"],
    ["simple", "classic"],
    ["document", "document"],
    ["ledger", "reject"],
  ] as const)("routes %s to %s", (renderer, expected) => {
    expect(resolveMetaEntityEditRoute(descriptor(renderer)).kind).toBe(expected);
  });

  it("fails closed when a document has no edit runtime", () => {
    const value = descriptor("document");
    delete value.editRuntime;
    expect(resolveMetaEntityEditRoute(value)).toEqual({
      kind: "configuration_error",
      reason: "DOCUMENT_EDIT_RUNTIME_MISSING",
    });
  });

  it("rejects read-only master entities", () => {
    const value = descriptor("master");
    value.capabilities.isReadOnly = true;
    expect(resolveMetaEntityEditRoute(value)).toEqual({ kind: "reject", reason: "ENTITY_READ_ONLY" });
  });
});
