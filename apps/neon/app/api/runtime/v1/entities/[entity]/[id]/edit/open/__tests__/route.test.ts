import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import { resolveDocumentOpenRollout } from "@/lib/server/document-runtime-feature-flags";
import { loadDocumentChildCompiledProjections, loadDocumentRuleProjection } from "@/lib/server/document-open-projections";
import { getMetaEntityRuntimeDescriptorCacheState } from "@/lib/server/meta-entity-runtime";
import { loadDocumentEditRuntimeRouteContext } from "@/lib/server/document-edit-runtime-route-context";
import { buildDocumentEditSectionBatch, buildDocumentEditCorePayload } from "@/lib/server/document-edit-runtime-data";
import { buildDocumentEditCoordinatorIdentity } from "@/lib/server/document-edit-coordinator-identity";
import { mintDocumentEditWorkspaceToken } from "@/lib/server/document-edit-workspace-token";
import { recordDocumentEditMetric, documentEditMetricTenant } from "@/lib/server/document-edit-observability";
import {
  resolveDocumentEditPlanHash,
  resolveDocumentEditWorkspaceProfile,
} from "@/lib/server/document-edit-workspace-validation";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";

vi.mock("@/lib/server/document-runtime-feature-flags");
vi.mock("@/lib/server/document-open-projections");
vi.mock("@/lib/server/meta-entity-runtime");
vi.mock("@/lib/server/document-edit-runtime-route-context");
vi.mock("@/lib/server/document-edit-runtime-data", () => ({
  buildDocumentEditCorePayload: vi.fn(),
  buildDocumentEditSectionBatch: vi.fn(),
}));
vi.mock("@/lib/server/document-edit-coordinator-identity");
vi.mock("@/lib/server/document-edit-workspace-token");
vi.mock("@/lib/server/document-edit-observability", () => ({
  recordDocumentEditMetric: vi.fn(),
  documentEditMetricTenant: vi.fn(() => "tenant-1"),
}));
vi.mock("@/lib/server/document-edit-workspace-validation");
vi.mock("@/lib/server/meta-entity-process-state", () => ({
  getMetaEntityProcessRuntimeState: vi.fn(),
}));

function baseContext(overrides: { isProvisional?: boolean; recordId?: string } = {}) {
  const descriptor = {
    entityCode: "purchase_order",
    createMode: overrides.isProvisional ? "EARLY_DRAFT" : "STANDARD",
    capabilities: { canEdit: true, isReadOnly: false },
    lifecycleStateMasks: [],
    fields: [],
    editRuntime: {
      schemaVersion: "document-edit-runtime/v6.0",
      planHash: "purchase-order-plan-v1",
      submitPolicy: { saveAndTransitionEnabled: true },
      sections: [
        { key: "details", accessible: true, loadPolicy: "core", cacheTtlMs: 100 },
        { key: "lines", accessible: true, loadPolicy: "eager_parallel", cacheTtlMs: 100 },
      ],
      childCollections: [
        { key: "lines", sectionKey: "lines", entityCode: "commitment_line" },
      ],
    },
    relations: [{ targetEntity: "commitment_line" }],
    renderer: "document",
  } as never;

  return {
    ok: true,
    context: {
      session: {
        userId: "principal-1",
        activeOrg: "org-1",
        organizations: {
          "org-1": { tenantId: "tenant-1", tenantCode: "tenant-1", workspaceId: "ws-1", roles: ["buyer"] },
        },
        planeKey: "neon",
        realmKey: "athyper",
      },
      entityCode: "purchase_order",
      recordId: overrides.recordId ?? "PO-1",
      descriptor,
    editRuntime: {
      schemaVersion: "document-edit-runtime/v6.0",
      planHash: "purchase-order-plan-v1",
      submitPolicy: { saveAndTransitionEnabled: true },
      sections: [
        { key: "details", accessible: true, loadPolicy: "core", cacheTtlMs: 100 },
        { key: "lines", accessible: true, loadPolicy: "eager_parallel", cacheTtlMs: 100 },
      ],
        childCollections: [{ key: "lines", sectionKey: "lines", entityCode: "commitment_line" }],
      },
      record: {
        id: "REC-1",
        data: {
          is_provisional: overrides.isProvisional ?? false,
          workflow_request_id: null,
          process_instance_id: null,
        },
      },
      timings: { sessionMs: 1, descriptorMs: 1, recordMs: 1, permissionValidationMs: 1 },
    },
  };
}

const sectionBatchResponse = {
  sections: [
    {
      key: "details",
      status: "ok",
      version: "v1",
      data: { section: { key: "details", loadPolicy: "core" } },
      timing: { serverMs: 2, cacheHit: "none" },
    },
    {
      key: "lines",
      status: "ok",
      version: "v2",
      data: {
        section: { key: "lines", loadPolicy: "eager_parallel" },
        childCollections: [{ pagination: { total: 0 } }],
      },
      timing: { serverMs: 2, cacheHit: "none" },
    },
  ],
};

function request() {
  return new Request("https://neon.local/api/runtime/v1/entities/purchase_order/PO-1/edit/open", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(resolveDocumentOpenRollout).mockReturnValue({
    stage: "off",
    cohort: "control",
    bucket: 0,
    openRulesBootstrap: false,
    openChildMetadataBootstrap: false,
    openDescriptorCacheV2: false,
    guard: { disabled: false, reason: null, disabledUntil: 0 },
  });
  vi.mocked(buildDocumentEditCorePayload as never).mockResolvedValue({
    ok: true,
    entityCode: "purchase_order",
    recordId: "REC-1",
    record: { id: "REC-1" },
    descriptor: { fields: [] },
    editRuntime: { schemaVersion: "document-edit-runtime/v6.0", sections: [], childCollections: [] },
    processState: undefined,
    selectedAddressSummaries: {},
    selectedOptionLabels: {},
    sectionManifest: [],
  } as never);
  vi.mocked(buildDocumentEditSectionBatch as never).mockResolvedValue(sectionBatchResponse as never);
  vi.mocked(loadDocumentEditRuntimeRouteContext).mockResolvedValue(baseContext() as never);
  vi.mocked(buildDocumentEditCoordinatorIdentity as never).mockReturnValue({ tenantId: "tenant-1", effectivePrincipal: "principal-1", permissionStamp: "stamp-1" } as never);
  vi.mocked(resolveDocumentEditWorkspaceProfile as never).mockReturnValue("edit");
  vi.mocked(resolveDocumentEditPlanHash as never).mockReturnValue("purchase-order-plan-v1");
  vi.mocked(mintDocumentEditWorkspaceToken).mockReturnValue("token-1");
  vi.mocked(getMetaEntityProcessRuntimeState as never).mockResolvedValue(null as never);
  vi.mocked(getMetaEntityRuntimeDescriptorCacheState as never).mockReturnValue("cold");
  vi.mocked(loadDocumentRuleProjection as never).mockResolvedValue({ entity: "purchase_order", field_rules: {}, action_rules: {}, version: "v1" } as never);
  vi.mocked(loadDocumentChildCompiledProjections as never).mockResolvedValue({ commitment_line: { fields: [] } } as never);
});

describe("POST /api/runtime/v1/entities/[entity]/[id]/edit/open", () => {
  it("returns one-shot OPEN bootstrap without rules/child metadata when rollout is off", async () => {
    const response = await POST(request(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Document-Open-Rules")).toBe("disabled");
    expect(response.headers.get("X-Document-Open-Child-Metadata")).toBe("disabled");
    expect(payload.core).toBeDefined();
    expect(loadDocumentRuleProjection).not.toHaveBeenCalled();
    expect(loadDocumentChildCompiledProjections).not.toHaveBeenCalled();
  });

  it("loads rules and child metadata projections when rollout is fully enabled", async () => {
    vi.mocked(resolveDocumentOpenRollout).mockReturnValue({
      stage: "full",
      cohort: "internal",
      bucket: 1,
      openRulesBootstrap: true,
      openChildMetadataBootstrap: true,
      openDescriptorCacheV2: true,
      guard: { disabled: false, reason: null, disabledUntil: 0 },
    });

    const response = await POST(request(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Document-Open-Rules")).toBe("included");
    expect(response.headers.get("X-Document-Open-Child-Metadata")).toBe("included");
    expect(loadDocumentRuleProjection).toHaveBeenCalledTimes(1);
    expect(loadDocumentChildCompiledProjections).toHaveBeenCalledTimes(1);
    expect(payload.core).toBeDefined();
  });

  it("records compatibility fallback outcome when projections fail", async () => {
    vi.mocked(resolveDocumentOpenRollout).mockReturnValue({
      stage: "full",
      cohort: "internal",
      bucket: 1,
      openRulesBootstrap: true,
      openChildMetadataBootstrap: true,
      openDescriptorCacheV2: true,
      guard: { disabled: false, reason: null, disabledUntil: 0 },
    });
    vi.mocked(loadDocumentRuleProjection as never).mockRejectedValueOnce(new Error("rules-down"));
    vi.mocked(loadDocumentChildCompiledProjections as never).mockRejectedValueOnce(new Error("child-down"));

    const response = await POST(request(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-1" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Document-Open-Rules")).toBe("fallback");
    expect(response.headers.get("X-Document-Open-Child-Metadata")).toBe("fallback");
    expect(recordDocumentEditMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "workspace_compatibility_fetch",
        outcome: "fallback",
      }),
    );
  });

  it("handles concurrent OPEN requests without shared mutable state", async () => {
    const [first, second] = await Promise.all([
      POST(request(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-1" }) }),
      POST(request(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-2" }) }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(loadDocumentEditRuntimeRouteContext).toHaveBeenCalledTimes(2);
    expect(vi.mocked(resolveDocumentOpenRollout).mock.calls).toHaveLength(2);
  });

  it("hydrates provisional-draft line bootstrap without forcing additional sections", async () => {
    vi.mocked(loadDocumentEditRuntimeRouteContext).mockResolvedValue(baseContext({ isProvisional: true }) as never);
    vi.mocked(resolveDocumentOpenRollout).mockReturnValue({
      stage: "full",
      cohort: "internal",
      bucket: 1,
      openRulesBootstrap: false,
      openChildMetadataBootstrap: false,
      openDescriptorCacheV2: true,
      guard: { disabled: false, reason: null, disabledUntil: 0 },
    });
    vi.mocked(buildDocumentEditSectionBatch as never).mockImplementation(async (input: { requestedKeys: string[] }) => {
      expect(input.requestedKeys).toContain("lines");
      return sectionBatchResponse as never;
    });

    const response = await POST(request(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sections.sections.some((section: { key: string }) => section.key === "lines")).toBe(true);
  });

  it("records section and open metrics for each request", async () => {
    await POST(request(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-1" }) });

    expect(recordDocumentEditMetric).toHaveBeenCalledWith(
      expect.objectContaining({ event: "workspace_section", outcome: "ok" }),
    );
    expect(recordDocumentEditMetric).toHaveBeenCalledWith(
      expect.objectContaining({ event: "workspace_open", outcome: "success" }),
    );
    expect(documentEditMetricTenant).toHaveBeenCalled();
  });
});
