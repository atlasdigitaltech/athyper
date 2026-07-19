import { describe, expect, it } from "vitest";
import type { EffectiveRecordWorkspaceManifest } from "@athyper/runtime-contracts";
import {
  isRecordWorkspaceProcessSurfaceSupported,
  isProcessTabId,
  resolveProcessSurfaceId,
  suppressLifecycleDuplicateStages,
} from "./runtime-process-surface";

function manifest(
  resources: EffectiveRecordWorkspaceManifest["resources"],
  surfaces: EffectiveRecordWorkspaceManifest["surfaces"] = [],
): EffectiveRecordWorkspaceManifest {
  return {
    schemaVersion: "record-workspace-manifest/v1",
    definitionVersion: "record-workspace/v1",
    entityCode: "journal_entry",
    recordId: "record-1",
    renderer: "ledger",
    initialSurfaceKey: null,
    cacheScope: {
      kind: "principal_record",
      key: "scope-a",
      variesBy: ["tenant", "principal", "permission_stamp", "descriptor", "entity", "record", "record_state"],
    },
    recordState: {
      lifecycleState: "posted",
      terminal: false,
      allowedTransitions: [],
      workflowStatus: null,
      pendingWorkflowTasks: 0,
    },
    surfaces,
    resources,
    operations: [],
  };
}

describe("process surface routing", () => {
  it("routes approvals and legacy workflow URLs to the approvals surface", () => {
    expect(resolveProcessSurfaceId("approvals")).toBe("approvals");
    expect(resolveProcessSurfaceId("workflow")).toBe("approvals");
    expect(resolveProcessSurfaceId("process")).toBe("approvals");
  });

  it("keeps lifecycle separate from approvals", () => {
    expect(resolveProcessSurfaceId("lifecycle")).toBe("lifecycle");
    expect(isProcessTabId("approvals")).toBe(true);
  });

  it("keeps snapshot history support separate from lifecycle timeline support", () => {
    const snapshotsOnly = manifest([{ key: "snapshots" }]);
    expect(isRecordWorkspaceProcessSurfaceSupported(snapshotsOnly, "versions")).toBe(true);
    expect(isRecordWorkspaceProcessSurfaceSupported(snapshotsOnly, "lifecycle")).toBe(false);
  });

  it("fails closed when the effective manifest excludes a process resource", () => {
    const approvalsOnly = manifest([{ key: "approvals" }]);
    expect(isRecordWorkspaceProcessSurfaceSupported(approvalsOnly, "approvals")).toBe(true);
    expect(isRecordWorkspaceProcessSurfaceSupported(approvalsOnly, "lifecycle")).toBe(false);
    expect(isRecordWorkspaceProcessSurfaceSupported(approvalsOnly, "versions")).toBe(false);
    expect(isRecordWorkspaceProcessSurfaceSupported(approvalsOnly, "audit")).toBe(false);
  });

  it("authorizes Audit from its effective surface rather than a naming fallback", () => {
    const audit = manifest([], [{
      key: "audit",
      kind: "audit_trail",
      placement: "main",
      order: 10,
      enabled: true,
    }]);
    expect(isRecordWorkspaceProcessSurfaceSupported(audit, "audit")).toBe(true);
  });
});

describe("approval stage fallback", () => {
  const lifecycle = [
    "Draft",
    "Pending Approval",
    "Approved",
    "Active",
    "Partially Fulfilled",
    "Fully Fulfilled",
  ];

  it("suppresses a stage route made entirely from lifecycle states", () => {
    expect(suppressLifecycleDuplicateStages(lifecycle, lifecycle)).toEqual([]);
    expect(suppressLifecycleDuplicateStages(["Pending Approval", "Approved"], lifecycle)).toEqual([]);
  });

  it("preserves genuine approval stages", () => {
    expect(suppressLifecycleDuplicateStages(
      ["Manager Approval", "Finance Approval"],
      lifecycle,
    )).toEqual(["Manager Approval", "Finance Approval"]);
  });
});
