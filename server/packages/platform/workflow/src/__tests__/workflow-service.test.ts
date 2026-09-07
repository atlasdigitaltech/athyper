import { describe, expect, it, vi } from "vitest";
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

function fixture() {
  const persistence = createInMemoryWorkflowPersistence();
  const events = vi.fn(async (_event: OutboxEventInput) => undefined);
  const audit = vi.fn(async (input: AuditRecordInput) => auditEvent(input, 0));
  const reader = { getEntityDescriptor: vi.fn(async () => descriptor("neon")) };
  const service = createWorkflowService({ ...persistence, metadata: reader, authorizer: { authorize: async () => ({ allowed: true }) }, outbox: { append: events }, audit: { record: audit } });
  const create = { context: context("neon"), workTypeCode: "approval", title: "Review", sourceEntityCode: "business_partner", sourceEntityId: ids.source, assigneePrincipalId: ids.principal };
  return { persistence, events, audit, reader, service, create };
}

describe("workflow route service regressions", () => {
  it("replays concurrent creates and actions exactly once and rejects changed input", async () => {
    const { service, create, events, audit } = fixture();
    const command = { ...create, idempotencyKey: "create-1", payload: { b: 2, a: 1 } };
    const results = await Promise.all([service.create(command), service.create({ ...command, payload: { a: 1, b: 2 } })]);
    expect(results[0]).toEqual(results[1]); expect(events).toHaveBeenCalledTimes(1); expect(audit).toHaveBeenCalledTimes(1);
    expect(await service.create({ ...command, title: "Changed" })).toMatchObject({ kind: "Conflict" });
    const result = results[0]!; if (result.kind !== "Committed") throw new Error("Create failed");
    const action = { context: create.context, workItemId: result.workItem.id, expectedRowVersion: 1, idempotencyKey: "claim-1", action: "claim" };
    const claimed = await service.act(action);
    expect(await service.act(action)).toEqual(claimed);
    expect(events).toHaveBeenCalledTimes(2); expect(audit).toHaveBeenCalledTimes(2);
    expect(await service.act({ ...action, expectedRowVersion: 2 })).toMatchObject({ kind: "Conflict" });
    expect(await service.act({ ...action, context: { ...create.context, principalId: ids.source } })).toMatchObject({ kind: "Conflict" });
  });
  it("rolls back receipts alongside failed mutations so retries can succeed", async () => {
    const { service, create, events } = fixture();
    events.mockRejectedValueOnce(new Error("outbox failed"));
    await expect(service.create({ ...create, idempotencyKey: "retry" })).rejects.toThrow("outbox failed");
    expect(await service.listInbox({ context: create.context })).toMatchObject({ totalCount: 0 });
    expect(await service.create({ ...create, idempotencyKey: "retry" })).toMatchObject({ kind: "Committed" });
    expect(await service.listInbox({ context: create.context })).toMatchObject({ totalCount: 1 });
  });
  it("validates malformed cursors instead of restarting pagination", async () => {
    const { service, create } = fixture();
    for (const cursor of ["garbage", Buffer.from(JSON.stringify({ createdAt: "no date", id: ids.item })).toString("base64url"), Buffer.from(JSON.stringify({ createdAt: "2026-09-06T00:00:00Z", id: "invalid" })).toString("base64url")]) {
      await expect(service.listInbox({ context: create.context, cursor })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    }
  });
  it("paginates without duplicates or a cursor on the final full page", async () => {
    const { service, create } = fixture();
    await service.create(create); await service.create(create);
    const first = await service.listInbox({ context: create.context, limit: 1 });
    expect(first.nextCursor).toBeDefined();
    const second = await service.listInbox({ context: create.context, limit: 1, cursor: first.nextCursor });
    expect(second.data).toHaveLength(1); expect(second.data[0]!.id).not.toBe(first.data[0]!.id); expect(second.nextCursor).toBeUndefined(); expect(second.totalCount).toBe(2);
  });
  it("shows eligible candidates in the inbox and respects exclusive claims", async () => {
    const { service, create } = fixture();
    const created = await service.create({ ...create, assigneePrincipalId: undefined, payload: { eligibility_evidence: { resolverVersion: "1", resolvedAt: new Date().toISOString(), strategy: "group", candidates: [{ principalId: ids.principal, source: "group" }, { principalId: ids.source, source: "group" }], fallbackPath: [] } } });
    if (created.kind !== "Committed") throw new Error("Create failed");
    expect(await service.listInbox({ context: create.context })).toMatchObject({ totalCount: 1 });
    await service.claim({ context: create.context, workItemId: created.workItem.id });
    const other = { ...create.context, principalId: ids.source };
    expect(await service.complete({ context: other, workItemId: created.workItem.id })).toMatchObject({ kind: "Conflict" });
    expect(await service.cancel({ context: other, workItemId: created.workItem.id })).toMatchObject({ kind: "Conflict" });
    expect(await service.listInbox({ context: other })).toMatchObject({ totalCount: 0 });
  });
  it("does not complete work before its availability", async () => {
    const { service, create } = fixture();
    const created = await service.create({ ...create, availableAt: "2099-01-01T00:00:00Z" });
    if (created.kind !== "Committed") throw new Error("Create failed");
    expect(await service.complete({ context: create.context, workItemId: created.workItem.id })).toMatchObject({ kind: "Conflict" });
  });
  it("distinguishes unsupported request context persistence from a missing request", async () => {
    const { service, create } = fixture();
    await expect(service.getRequestContext(create.context, ids.item)).rejects.toMatchObject({ statusCode: 503 });
  });
  it.each(["enforce", "observe"] as const)("honors %s action policy bindings and pinned versions", async enforcement => {
    const { persistence, create, reader, events, audit } = fixture();
    const policyId = ids.item;
    const policy = { evaluate: vi.fn(async () => ({ action: "deny" as const, permitted: false, outcomes: [{ policyId, policyVersionNo: 2, policyName: "Approval", ruleId: ids.source, action: "deny" as const, actionConfig: {} }], evaluatedPolicyIds: [policyId], evaluatedPolicies: [{ id: policyId, versionNo: 2 }] })) };
    const service = createWorkflowService({ ...persistence, metadata: reader, authorizer: { authorize: async () => ({ allowed: true }) }, outbox: { append: events }, audit: { record: audit }, policy });
    const created = await service.create(create); if (created.kind !== "Committed") throw new Error("Create failed");
    reader.getEntityDescriptor.mockResolvedValue({ ...descriptor("neon"), policyBindings: [{ key: "approval", policyDefinitionId: policyId, policyVersionNo: 2, stage: "precondition", enforcement, priority: 1, operationCode: "complete", inputMapping: {} }] });
    const command = { context: create.context, workItemId: created.workItem.id };
    policy.evaluate.mockResolvedValueOnce({ action: "deny", permitted: false, outcomes: [], evaluatedPolicyIds: [policyId], evaluatedPolicies: [{ id: policyId, versionNo: 1 }] });
    await expect(service.complete(command)).rejects.toMatchObject({ code: "POLICY_VERSION_UNAVAILABLE" });
    expect(await service.complete(command)).toMatchObject({ kind: enforcement === "enforce" ? "PolicyDenied" : "Committed" });
  });
});
