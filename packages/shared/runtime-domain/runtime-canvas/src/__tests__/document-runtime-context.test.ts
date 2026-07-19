import { describe, expect, it } from "vitest";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import { canUseDocumentEditCoordinator } from "../document-runtime/document-runtime-context";

function descriptor(overrides: Partial<MetaEntityRuntimeDescriptor> = {}): MetaEntityRuntimeDescriptor {
  return {
    capabilities: { canEdit: true, isReadOnly: false } as MetaEntityRuntimeDescriptor["capabilities"],
    identity: { status: { field: "status" } } as MetaEntityRuntimeDescriptor["identity"],
    lifecycleStateMasks: [],
    editRuntime: {} as MetaEntityRuntimeDescriptor["editRuntime"],
    ...overrides,
  } as MetaEntityRuntimeDescriptor;
}

describe("document edit coordinator lifecycle gate", () => {
  it("keeps the coordinator off for a locked record while allowing a draft", () => {
    const contract = descriptor({
      lifecycleStateMasks: [
        { recordStatus: "posted", canEdit: false, canDelete: false, disabledReason: "posted_locked" },
      ],
    });

    expect(canUseDocumentEditCoordinator(contract, { status: "posted" })).toBe(false);
    expect(canUseDocumentEditCoordinator(contract, { status: "draft" })).toBe(true);
  });

  it("fails closed when the entity is read-only", () => {
    const contract = descriptor({
      capabilities: { canEdit: false, isReadOnly: true } as MetaEntityRuntimeDescriptor["capabilities"],
    });

    expect(canUseDocumentEditCoordinator(contract, { status: "draft" })).toBe(false);
  });
});
