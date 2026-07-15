import { describe, expect, it } from "vitest";
import { buildDocumentWorkspaceDraftContext } from "../document-workspace-draft-context";

function descriptor(overrides: Record<string, unknown> = {}) {
  return {
    entityCode: "purchase_order",
    capabilities: { canEdit: true, isReadOnly: false },
    lifecycleStateMasks: [],
    fields: [
      { name: "name", isComputed: false, isReadOnly: false },
      { name: "total_amount", isComputed: true, isReadOnly: true },
    ],
    ...overrides,
  } as never;
}

describe("document workspace draft context", () => {
  it("derives etag and writable fields from the OPEN record and descriptor", () => {
    const result = buildDocumentWorkspaceDraftContext({
      descriptor: descriptor(),
      recordId: "route-id",
      record: { id: "physical-id", data: { status: "draft", row_version: 7 } } as never,
    });
    expect(result).toMatchObject({ recordId: "physical-id", status: "draft", etag: "7", canUpdate: true });
    expect(result.fieldMask).toMatchObject({ name: { editable: true }, total_amount: { editable: false, reason: "computed" } });
  });

  it("fails editing closed lifecycle states and locks every field", () => {
    const result = buildDocumentWorkspaceDraftContext({
      descriptor: descriptor({ lifecycleStateMasks: [{ recordStatus: "closed", canEdit: false, canDelete: false, disabledReason: "closed" }] }),
      recordId: "record-id",
      record: { id: "record-id", data: { status: "closed", row_version: 9 } } as never,
    });
    expect(result).toMatchObject({ canUpdate: false, disabledReason: "closed" });
    expect(result.fieldMask.name).toEqual({ editable: false, reason: "status_locked" });
  });
});
