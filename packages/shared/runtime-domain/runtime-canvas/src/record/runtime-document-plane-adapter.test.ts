import { describe, expect, it, vi } from "vitest";
import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import {
  applyRuntimeDocumentPlanePolicy,
  resolveRuntimeObjectPageRenderer,
  type RuntimeDocumentPlaneAdapter,
} from "./runtime-document-plane-adapter";

const descriptor = {
  renderer: "document",
  fields: [
    { key: "number", name: "number" },
    { key: "amount", name: "amount" },
    { key: "internal_note", name: "internal_note" },
  ],
  operations: [
    { key: "edit", enabled: true, actionGroup: "record" },
    { key: "submit", enabled: true, actionGroup: "workflow_task" },
    { key: "print", enabled: true, actionGroup: "general" },
  ],
  capabilities: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canCreateReason: null,
    canEditReason: null,
    canDeleteReason: null,
    hasAttachments: true,
    hasComments: true,
    hasWorkflow: true,
    isReadOnly: false,
  },
} as unknown as MetaEntityRuntimeDescriptor;

const record: RuntimeRecordRow = {
  id: "doc-1",
  data: { number: "PI-100", amount: 42, internal_note: "tenant only" },
};

describe("runtime document plane adapter", () => {
  it("selects document chrome solely from the shared descriptor renderer", () => {
    expect(resolveRuntimeObjectPageRenderer(descriptor)).toBe("document");
    expect(resolveRuntimeObjectPageRenderer({ ...descriptor, renderer: "master" })).toBe("record");
  });

  it("preserves identical field layout for equivalent Neon and Mesh projections", () => {
    const neon = applyRuntimeDocumentPlanePolicy(descriptor, record, adapter("neon", "full"));
    const mesh = applyRuntimeDocumentPlanePolicy(descriptor, record, {
      ...adapter("mesh", "delegated-submit"),
      partnerSafeFieldNames: ["number", "amount", "internal_note"],
    });
    expect(mesh.descriptor.fields.map((field) => field.key))
      .toEqual(neon.descriptor.fields.map((field) => field.key));
  });

  it("enforces Mesh partner projection and delegated-submit behavior", () => {
    const mesh = applyRuntimeDocumentPlanePolicy(descriptor, record, {
      ...adapter("mesh", "delegated-submit"),
      partnerSafeFieldNames: ["number", "amount"],
      permittedOperationKeys: ["submit"],
      print: false,
    });
    expect(mesh.descriptor.fields.map((field) => field.name)).toEqual(["number", "amount"]);
    expect(mesh.record.data).toEqual({ number: "PI-100", amount: 42 });
    expect(mesh.descriptor.capabilities.canEdit).toBe(false);
    expect(mesh.descriptor.capabilities.isReadOnly).toBe(true);
    expect(mesh.descriptor.operations.map((operation) => operation.key)).toEqual(["submit"]);
  });
});

function adapter(
  plane: "neon" | "mesh",
  mutationMode: RuntimeDocumentPlaneAdapter["mutationMode"],
): RuntimeDocumentPlaneAdapter {
  return {
    plane,
    transport: vi.fn(),
    mutationMode,
    workflowActions: true,
    attachments: true,
    comments: true,
    print: true,
    export: true,
    refresh: vi.fn(),
    replace: vi.fn(),
    resolveDeepLink: ({ entityCode, recordId, destination }) =>
      destination === "list" ? `/app/${entityCode}` : `/app/${entityCode}/${recordId}`,
  };
}
