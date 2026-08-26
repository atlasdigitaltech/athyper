import { describe, expect, it } from "vitest";
import type { AuditEvent, AuditRecordInput } from "@athyper/server-contract-audit";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OutboxEventInput } from "@athyper/server-contract-events";
import type { EntityRuntimeDescriptor, MetadataReader } from "@athyper/server-contract-metadata";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { createInMemoryWorkflowPersistence, createWorkflowService } from "../index.js";

const ids = {
  tenant: "11111111-1111-4111-8111-111111111111", principal: "22222222-2222-4222-8222-222222222222",
  source: "33333333-3333-4333-8333-333333333333", item: "44444444-4444-4444-8444-444444444444",
};
const permissionCodes = ["create", "read", "claim", "complete", "cancel"].map((action) => `workflow.work_item.${action}`);

describe("descriptor-governed workflow work items", () => {
  for (const planeKey of ["studio", "neon", "mesh"] as const) {
    it(`runs the universal create, inbox, claim, and complete flow on ${planeKey}`, async () => {
      const events: OutboxEventInput[] = [];
      const audit: AuditEvent[] = [];
      const persistence = createInMemoryWorkflowPersistence({ createId: () => ids.item, now: () => new Date("2026-08-09T00:00:00.000Z") });
      const service = createWorkflowService({
        metadata: metadata(planeKey), authorizer: { authorize: async ({ context, permissionCode }) => context.permissions.allowed.includes(permissionCode) ? { allowed: true } : { allowed: false, reason: "missing_permission" } },
        repository: persistence.repository, transactions: persistence.transactions,
        outbox: { append: async (event) => { events.push(event); } },
        audit: { record: async (input) => { const event = auditEvent(input, audit.length); audit.push(event); return event; } },
      });
      const request = context(planeKey);
      const created = await service.create({ context: request, workTypeCode: "approval", title: "Approve supplier", sourceEntityCode: "business_partner", sourceEntityId: ids.source, sourceActionCode: "activate", assigneePrincipalId: ids.principal });
      expect(created).toMatchObject({ kind: "Committed", workItem: { status: "open", sourceActionCode: "activate" } });
      await expect(service.listInbox({ context: request })).resolves.toMatchObject({ data: [{ id: ids.item, status: "open" }] });
      await expect(service.claim({ context: request, workItemId: ids.item })).resolves.toMatchObject({ kind: "Committed", workItem: { status: "claimed" } });
      await expect(service.complete({ context: request, workItemId: ids.item, outcome: { decision: "approved" } })).resolves.toMatchObject({ kind: "Committed", workItem: { status: "completed", outcome: { decision: "approved" } } });
      expect(events.map((event) => event.eventType)).toEqual(["workflow.work_item.created", "workflow.work_item.claimed", "workflow.work_item.completed"]);
      expect(audit).toHaveLength(3);
    });
  }

  it("rejects an action absent from the active entity descriptor", async () => {
    const persistence = createInMemoryWorkflowPersistence({ createId: () => ids.item });
    const service = createWorkflowService({ metadata: metadata("neon"), authorizer: { authorize: async () => ({ allowed: true }) }, repository: persistence.repository, transactions: persistence.transactions, outbox: { append: async () => undefined }, audit: { record: async (input) => auditEvent(input, 0) } });
    await expect(service.create({ context: context("neon"), workTypeCode: "approval", title: "Invalid", sourceEntityCode: "business_partner", sourceEntityId: ids.source, sourceActionCode: "invented" })).rejects.toMatchObject({ code: "SOURCE_ACTION_NOT_PUBLISHED" });
  });

  it("rolls back a new work item when durable event persistence fails", async () => {
    const persistence = createInMemoryWorkflowPersistence({ createId: () => ids.item });
    const service = createWorkflowService({ metadata: metadata("mesh"), authorizer: { authorize: async () => ({ allowed: true }) }, repository: persistence.repository, transactions: persistence.transactions, outbox: { append: async () => { throw new Error("outbox unavailable"); } }, audit: { record: async (input) => auditEvent(input, 0) } });
    await expect(service.create({ context: context("mesh"), workTypeCode: "approval", title: "Rollback", sourceEntityCode: "business_partner", sourceEntityId: ids.source, assigneePrincipalId: ids.principal })).rejects.toThrow("outbox unavailable");
    await expect(service.listInbox({ context: context("mesh") })).resolves.toEqual({ data: [], totalCount: 0 });
  });

  it("enforces a published entity policy binding in the workflow transaction", async () => {
    const policyId = "55555555-5555-4555-8555-555555555555";
    const persistence = createInMemoryWorkflowPersistence({ createId: () => ids.item });
    const governed = { ...descriptor("athyper"), policyBindings: [{ key: "supplier_activation", policyDefinitionId: policyId, policyVersionNo: 2, stage: "precondition", enforcement: "enforce", priority: 10, operationCode: "activate", inputMapping: {} }] } satisfies EntityRuntimeDescriptor;
    const service = createWorkflowService({
      metadata: { getEntityDescriptor: async () => governed }, authorizer: { authorize: async () => ({ allowed: true }) },
      repository: persistence.repository, transactions: persistence.transactions,
      policy: { evaluate: async () => ({ action: "deny", permitted: false, outcomes: [{ policyId, policyVersionNo: 2, policyName: "Supplier activation", ruleId: "66666666-6666-4666-8666-666666666666", action: "deny", actionConfig: {}, explanation: "Supplier risk is blocked" }], winning: { policyId, policyVersionNo: 2, policyName: "Supplier activation", ruleId: "66666666-6666-4666-8666-666666666666", action: "deny", actionConfig: {}, explanation: "Supplier risk is blocked" }, evaluatedPolicyIds: [policyId], evaluatedPolicies: [{ id: policyId, versionNo: 2 }] }) },
      outbox: { append: async () => undefined }, audit: { record: async (input) => auditEvent(input, 0) },
    });
    await expect(service.create({ context: context("athyper"), workTypeCode: "approval", title: "Activate supplier", sourceEntityCode: "business_partner", sourceEntityId: ids.source, sourceActionCode: "activate" })).resolves.toEqual({ kind: "PolicyDenied", policyIds: [policyId], reason: "Supplier risk is blocked" });
    await expect(service.listInbox({ context: context("athyper") })).resolves.toEqual({ data: [], totalCount: 0 });
  });

  it("fails closed when a published policy revision is unavailable", async () => {
    const policyId = "55555555-5555-4555-8555-555555555555";
    const persistence = createInMemoryWorkflowPersistence({ createId: () => ids.item });
    const governed = { ...descriptor("mesh"), policyBindings: [{ key: "supplier_activation", policyDefinitionId: policyId, policyVersionNo: 2, stage: "validation", enforcement: "enforce", priority: 10, operationCode: "activate", inputMapping: {} }] } satisfies EntityRuntimeDescriptor;
    const service = createWorkflowService({
      metadata: { getEntityDescriptor: async () => governed }, authorizer: { authorize: async () => ({ allowed: true }) }, repository: persistence.repository, transactions: persistence.transactions,
      policy: { evaluate: async () => ({ action: "allow", permitted: true, outcomes: [], evaluatedPolicyIds: [policyId], evaluatedPolicies: [{ id: policyId, versionNo: 1 }] }) },
      outbox: { append: async () => undefined }, audit: { record: async (input) => auditEvent(input, 0) },
    });
    await expect(service.create({ context: context("mesh"), workTypeCode: "approval", title: "Activate supplier", sourceEntityCode: "business_partner", sourceEntityId: ids.source, sourceActionCode: "activate" })).rejects.toMatchObject({ code: "POLICY_VERSION_UNAVAILABLE", statusCode: 503 });
  });
});

function context(planeKey: PlaneKey): VerifiedRequestContext {
  return { planeKey, realmKey: "athyper", tenantId: ids.tenant, principalId: ids.principal, authEpoch: 1, profileHash: "profile", requestId: "request-1", permissions: { planeKey, tenantId: ids.tenant, principalId: ids.principal, principalFingerprint: "fingerprint", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: permissionCodes, denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } };
}
function metadata(planeKey: PlaneKey): MetadataReader { return { getEntityDescriptor: async () => descriptor(planeKey) }; }
function descriptor(planeKey: PlaneKey): EntityRuntimeDescriptor { return { schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "business_partner", planeKey, releaseId: "release-1", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64), storage: { schema: "master", object: "business_partner", idField: "id", statusField: "status" }, fields: [], operations: { read: { code: "read", permissionCode: "master.business_partner.read" } }, lifecycle: { transitions: [{ code: "activate", from: ["draft"], to: "active", permissionCode: "master.business_partner.activate" }] } }; }
function auditEvent(input: AuditRecordInput, sequence: number): AuditEvent { return { ...input, id: `audit-${sequence}`, occurredAt: "2026-08-09T00:00:00.000Z", severity: input.severity ?? "info" }; }
