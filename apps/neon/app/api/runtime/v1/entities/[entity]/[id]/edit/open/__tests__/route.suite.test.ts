import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import { resolveDocumentOpenRollout } from "@/lib/server/document-runtime-feature-flags";
import { loadDocumentChildCompiledProjections, loadDocumentRuleProjection } from "@/lib/server/document-open-projections";
import { buildDocumentEditCorePayload, buildDocumentEditSectionBatch } from "@/lib/server/document-edit-runtime-data";
import { getMetaEntityRuntimeDescriptorCacheState } from "@/lib/server/meta-entity-runtime";
import { loadDocumentEditRuntimeRouteContext } from "@/lib/server/document-edit-runtime-route-context";
import { recordDocumentEditMetric } from "@/lib/server/document-edit-observability";
import {
  resolveDocumentEditPlanHash,
  resolveDocumentEditWorkspaceProfile,
} from "@/lib/server/document-edit-workspace-validation";
import { buildDocumentEditCoordinatorIdentity } from "@/lib/server/document-edit-coordinator-identity";
import { mintDocumentEditWorkspaceToken } from "@/lib/server/document-edit-workspace-token";
import { getMetaEntityProcessRuntimeState } from "@/lib/server/meta-entity-process-state";

vi.mock("@/lib/server/document-runtime-feature-flags");
vi.mock("@/lib/server/document-open-projections");
vi.mock("@/lib/server/document-edit-observability", () => ({
  recordDocumentEditMetric: vi.fn(),
  documentEditMetricTenant: vi.fn(() => "tenant-1"),
}));
vi.mock("@/lib/server/document-edit-runtime-route-context");
vi.mock("@/lib/server/document-edit-runtime-data");
vi.mock("@/lib/server/document-edit-workspace-validation");
vi.mock("@/lib/server/document-edit-coordinator-identity");
vi.mock("@/lib/server/document-edit-workspace-token");
vi.mock("@/lib/server/meta-entity-runtime");
vi.mock("@/lib/server/meta-entity-process-state", () => ({
  getMetaEntityProcessRuntimeState: vi.fn(),
}));

const defaultDescriptor = {
  entityCode: "purchase_order",
  createMode: "STANDARD",
  planHash: "plan-v1",
  editRuntime: {
    schemaVersion: "document-edit-runtime/v6.0",
    planHash: "plan-v1",
    submitPolicy: { saveAndTransitionEnabled: true },
    sections: [
      { key: "details", accessible: true, loadPolicy: "core" },
      { key: "lines", accessible: true, loadPolicy: "eager_parallel" },
    ],
    childCollections: [{ key: "lines", sectionKey: "lines", entityCode: "commitment_line" }],
  },
  renderer: "document",
  capabilities: { canEdit: true, isReadOnly: false },
  lifecycleStateMasks: [],
  fields: [],
  relations: [],
};

const sectionBatchResponse = { sections: [{ key: "details", status: "ok", version: "v1", data: { section: { key: "details" } }, timing: { serverMs: 4 } }] };

function buildContext(): { ok: true; context: any } {
  return {
    ok: true,
    context: {
      session: {
        userId: "principal-1",
        activeOrg: "org-1",
        organizations: { "org-1": { tenantId: "tenant-1" } },
        planeKey: "neon",
        realmKey: "athyper",
      },
      entityCode: "purchase_order",
      recordId: "PO-1",
      descriptor: defaultDescriptor,
      editRuntime: defaultDescriptor.editRuntime,
      record: { id: "REC-1", data: { is_provisional: false } },
      timings: { sessionMs: 10, descriptorMs: 10, recordMs: 10, permissionValidationMs: 1 },
    },
  };
}

function buildRequest() {
  return new Request("https://neon.local/api/runtime/v1/entities/purchase_order/PO-1/edit/open", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveDocumentOpenRollout).mockReturnValue({
    stage: "full",
    cohort: "control",
    bucket: 0,
    openRulesBootstrap: true,
    openChildMetadataBootstrap: true,
    openDescriptorCacheV2: false,
    guard: { disabled: false, reason: null, disabledUntil: 0 },
  });
  vi.mocked(loadDocumentEditRuntimeRouteContext).mockResolvedValue(buildContext() as never);
  vi.mocked(loadDocumentRuleProjection).mockResolvedValue({ entity: "purchase_order", field_rules: {}, action_rules: {} } as never);
  vi.mocked(loadDocumentChildCompiledProjections).mockResolvedValue({ commitment_line: { compiledHash: "x" } } as never);
  vi.mocked(buildDocumentEditSectionBatch).mockResolvedValue(sectionBatchResponse as never);
  vi.mocked(buildDocumentEditCorePayload).mockResolvedValue({ entityCode: "purchase_order", recordId: "REC-1" } as never);
  vi.mocked(resolveDocumentEditPlanHash).mockReturnValue("plan-v1");
  vi.mocked(resolveDocumentEditWorkspaceProfile).mockReturnValue("edit");
  vi.mocked(buildDocumentEditCoordinatorIdentity).mockReturnValue({ tenantId: "tenant-1", effectivePrincipal: "principal-1", permissionStamp: "stamp-1" } as never);
  vi.mocked(mintDocumentEditWorkspaceToken).mockReturnValue("workspace-token" as never);
  vi.mocked(getMetaEntityProcessRuntimeState).mockResolvedValue(null as never);
  vi.mocked(getMetaEntityRuntimeDescriptorCacheState).mockReturnValue("warm");
});

describe("document-open suites (load/concurrency/browser/invalidation)", () => {
  it("collects load-critical route state and projection headers for first-open path", async () => {
    const response = await POST(buildRequest(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.core.rules).toBeDefined();
    expect(payload.core.compiledEntities).toBeDefined();
    expect(response.headers.get("X-Document-Open-Rules")).toBe("included");
    expect(response.headers.get("X-Document-Open-Child-Metadata")).toBe("included");
    expect(response.headers.get("Server-Timing")).toContain("session");
    expect(payload.sections.sections).toHaveLength(1);
  });

  it("serves concurrent OPEN requests without shared mutable state across invocations", async () => {
    const [a, b, c] = await Promise.all([
      POST(buildRequest(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-1" }) }),
      POST(buildRequest(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-2" }) }),
      POST(buildRequest(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-3" }) }),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(200);
    expect(loadDocumentEditRuntimeRouteContext).toHaveBeenCalledTimes(3);
  });

  it("records browser-facing invariants in response and seeding headers", async () => {
    const response = await POST(buildRequest(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-1" }) });

    expect(response.headers.get("X-Document-Edit-Lifecycle")).toBe("open");
    expect(response.headers.get("X-Document-Edit-Cache-State")).toBe("warm");
    expect(response.headers.get("X-Document-Open-Rollout-Stage")).toBe("full");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("captures projection validation telemetry for invalid child capability payloads", async () => {
    vi.mocked(loadDocumentChildCompiledProjections).mockResolvedValue({} as never);
    vi.mocked(buildDocumentEditCorePayload).mockResolvedValue({
      entityCode: "purchase_order",
      recordId: "REC-1",
      processState: undefined,
    } as never);
    await POST(buildRequest(), { params: Promise.resolve({ entity: "purchase_order", id: "PO-1" }) });

    expect(vi.mocked(recordDocumentEditMetric)).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "workspace_projection_validation",
        outcome: "failure",
      }),
    );
  });
});
