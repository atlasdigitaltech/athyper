import type { HttpClient } from "@athyper/platform-api-client";
import { describe, expect, it } from "vitest";
import { createBusinessPartnerClient } from "./client";

const governedCase = {
  schema: "athyper.governed-case-view/1",
  id: "10000000-0000-4000-8000-000000000001",
  kind: "new_partner",
  status: "pending_approval",
  rowVersion: 4,
  definition: {
    id: "20000000-0000-4000-8000-000000000002",
    version: 1,
    contentHash: "a".repeat(64),
  },
  subject: { type: "business_partner", displayName: "Acme" },
  ownership: {
    requesterId: "30000000-0000-4000-8000-000000000003",
    assigneeId: "40000000-0000-4000-8000-000000000004",
  },
  progress: { completed: 3, required: 4, blockers: 0 },
  sections: [],
  allowedActions: [{ id: "approve", label: "Approve" }],
  evidenceSummary: { active: 0, scanning: 0, quarantined: 0, missing: 0 },
  timestamps: {
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T01:00:00.000Z",
  },
};

function clientFor(body: unknown) {
  return createBusinessPartnerClient({
    async request(operation: { readonly parse?: (value: unknown) => unknown }) {
      return operation.parse?.(body) as never;
    },
  } as unknown as HttpClient);
}

describe("Business Partner case client", () => {
  it("parses the pinned onboarding cycle and linked subjects", async () => {
    const view = await clientFor({case:governedCase,request:{id:governedCase.id},validationFindings:[],onboardingCycle:{runId:"80000000-0000-4000-8000-000000000008",code:"BPONB-BPR-1",name:"Supplier onboarding BPR-1",status:"running",template:{code:"BP_SUPPLIER_ONBOARDING",version:1,hash:"c".repeat(64),releaseId:"90000000-0000-4000-8000-000000000009"},tasks:[{id:"a0000000-0000-4000-8000-00000000000a",code:"INVITATION",name:"Invitation",status:"completed",completionMode:"system",completionEvidence:{eventCode:"business_partner.case.created"}}],subjects:[{role:"onboarding_case",primary:true,entityCaseId:governedCase.id}]}}).view(governedCase.id);
    expect(view.onboardingCycle).toMatchObject({status:"running",template:{code:"BP_SUPPLIER_ONBOARDING",version:1},tasks:[{code:"INVITATION",status:"completed"}],subjects:[{role:"onboarding_case",primary:true}]});
  });

  it("parses exact current workflow task authority coordinates", async () => {
    const view = await clientFor({
      case: governedCase,
      request: { id: governedCase.id },
      validationFindings: [],
      workflow: {
        requestId: "50000000-0000-4000-8000-000000000005",
        stageId: "60000000-0000-4000-8000-000000000006",
        workItemId: "70000000-0000-4000-8000-000000000007",
        workItemVersion: 3,
        workItemStatus: "claimed",
        ownerPrincipalId: "40000000-0000-4000-8000-000000000004",
        definition: { code: "bp.review", version: 1, hash: "b".repeat(64) },
      },
    }).view(governedCase.id);
    expect(view.workflow).toMatchObject({
      workItemVersion: 3,
      workItemStatus: "claimed",
      ownerPrincipalId: "40000000-0000-4000-8000-000000000004",
    });
  });

  it("rejects a workflow projection without a task owner", async () => {
    await expect(
      clientFor({
        case: governedCase,
        request: { id: governedCase.id },
        validationFindings: [],
        workflow: {
          requestId: "50000000-0000-4000-8000-000000000005",
          stageId: "60000000-0000-4000-8000-000000000006",
          workItemId: "70000000-0000-4000-8000-000000000007",
          workItemVersion: 3,
          workItemStatus: "open",
          definition: {
            code: "bp.review",
            version: 1,
            hash: "b".repeat(64),
          },
        },
      }).view(governedCase.id),
    ).rejects.toThrow(/string is required/);
  });

  it("parses a bounded materialization proof without accepting raw snapshot payloads", async () => {
    const proof = {
      schema: "athyper.business-partner-materialization-proof/1", materializationId: "materialization-1", attemptNo: 1, status: "succeeded", resultCode: "BUSINESS_PARTNER_CREATED",
      sourceSnapshot: { snapshotId: "source-1", entityType: "business_partner_case", entityId: governedCase.id, version: 4, payloadHash: "a".repeat(64), capturedAt: "2026-09-04T00:00:00Z" },
      resultSnapshot: { snapshotId: "result-1", entityType: "business_partner", entityId: "partner-1", version: 1, payloadHash: "b".repeat(64), capturedAt: "2026-09-04T01:00:00Z" },
      materializer: { code: "neon.internal_business_partner", version: "1" }, applicationFingerprint: "c".repeat(64), completedAt: "2026-09-04T01:00:00Z", completedBy: "principal-1",
      result: { businessPartnerId: "partner-1", partnerRole: "supplier", roleId: "supplier-1" }, lineage: [],
    };
    const view = await clientFor({ case: governedCase, request: { id: governedCase.id }, validationFindings: [], materializationProof: { ...proof, payload: { taxId: "restricted" } } }).view(governedCase.id);
    expect(view.materializationProof).toMatchObject({ materializationId: "materialization-1", result: { businessPartnerId: "partner-1" }, lineage: [] });
    expect(view.materializationProof).not.toHaveProperty("payload");
    await expect(clientFor({ case: governedCase, request: { id: governedCase.id }, validationFindings: [], materializationProof: { ...proof, lineage: Array.from({ length: 26 }, () => ({})) } }).view(governedCase.id)).rejects.toThrow(/contract is invalid/);
  });
});


it("accepts a submission receipt while document-gated approval work is absent", async () => {
  const process = { cycleRunId: governedCase.id, attemptId: governedCase.id, attemptNumber: 1, selectionId: governedCase.id, profile: "simple", reviewPackJobId: governedCase.id, documentStatus: "pending" };
  const result = await clientFor({ case: { ...governedCase, allowedActions: [] }, request: { id: governedCase.id }, process, replayed: false }).submit(governedCase.id, 3, "p2-client-submit-001");
  expect(result.workflow).toBeUndefined(); expect(result.process).toEqual(process); expect(result.case.allowedActions).toEqual([]);
});
