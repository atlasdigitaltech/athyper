import { describe, expect, it, vi } from "vitest";
import type { AuditEvent, AuditRecordInput } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OutboxEventInput } from "@athyper/server-contract-events";
import { createProvisioningVertical, type ProvisioningCreateRepository } from "../index.js";

const context: VerifiedRequestContext = {
  planeKey: "studio", realmKey: "athyper", tenantId: "10000000-0000-4000-8000-000000000001",
  principalId: "10000000-0000-4000-8000-000000000002", authEpoch: 1, profileHash: "profile", requestId: "request-1",
  permissions: { planeKey: "studio", tenantId: "10000000-0000-4000-8000-000000000001", principalId: "10000000-0000-4000-8000-000000000002", principalFingerprint: "fp", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: ["iam.provisioning.create"], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
};

class MemoryTransaction {
  readonly commitActions: Array<() => void> = [];
  onCommit(action: () => void): void { this.commitActions.push(action); }
}

function harness(options: { deny?: boolean; failAudit?: boolean } = {}) {
  const requests = new Map<string, Parameters<ProvisioningCreateRepository<MemoryTransaction>["createOrReplay"]>[0]>();
  const outbox: OutboxEventInput[] = [];
  const audit: AuditEvent[] = [];
  const authorizer: Authorizer = { authorize: vi.fn(async () => options.deny ? { allowed: false as const, reason: "missing_permission" } : { allowed: true as const }) };
  const repository: ProvisioningCreateRepository<MemoryTransaction> = {
    async createOrReplay(input, transaction) {
      const existing = [...requests.values()].find((item) => item.tenantId === input.tenantId && (item.idempotencyKey === input.idempotencyKey || item.subjectKey === input.subjectKey));
      if (existing) return existing.requestFingerprint === input.requestFingerprint ? { kind: "replay", request: existing } : { kind: "conflict" };
      transaction.onCommit(() => requests.set(input.idempotencyKey, input));
      return { kind: "created", request: input };
    },
  };
  const run = vi.fn();
  const transactions = { async run<Result>(_actor: { tenantId: string; principalId: string }, work: (transaction: MemoryTransaction) => Promise<Result>): Promise<Result> {
    run(); const transaction = new MemoryTransaction(); const result = await work(transaction);
    transaction.commitActions.forEach((commit) => commit()); return result;
  } };
  const service = createProvisioningVertical({ authorizer, repository, transactions,
    outbox: { append: async (event, transaction) => transaction?.onCommit(() => outbox.push(event)) },
    audit: { record: async (input: AuditRecordInput, transaction?: MemoryTransaction) => {
      if (options.failAudit) throw new Error("audit unavailable");
      const event: AuditEvent = { ...input, id: "audit-1", occurredAt: "2026-08-11T00:00:00.000Z", severity: input.severity ?? "info" };
      transaction?.onCommit(() => audit.push(event)); return event;
    } }, createId: () => "10000000-0000-4000-8000-000000000003" });
  return { service, requests, outbox, audit, run };
}

const command = { context, idempotencyKey: "iam-provision-0001", identifier: " User@Example.COM ", planes: ["neon", "mesh"] } as const;

describe("IAM provisioning vertical", () => {
  it("commits request, outbox, and audit once and replays the response", async () => {
    const test = harness();
    await expect(test.service.request(command)).resolves.toMatchObject({ kind: "Created", request: { normalizedIdentifier: "user@example.com", planes: ["mesh", "neon"] } });
    await expect(test.service.request(command)).resolves.toMatchObject({ kind: "Replayed", request: { id: "10000000-0000-4000-8000-000000000003" } });
    expect(test.requests.size).toBe(1); expect(test.outbox).toHaveLength(1); expect(test.audit).toHaveLength(1);
    expect(test.outbox[0]).toMatchObject({ topic: "iam.provisioning", eventType: "iam.provisioning.requested" });
  });

  it("rejects a reused key or subject with changed semantic input", async () => {
    const test = harness();
    await test.service.request(command);
    await expect(test.service.request({ ...command, planes: ["studio"] })).resolves.toEqual({ kind: "IdempotencyConflict", reason: "reused" });
    await expect(test.service.request({ ...command, idempotencyKey: "iam-provision-0002", planes: ["studio"] })).resolves.toEqual({ kind: "IdempotencyConflict", reason: "reused" });
    expect(test.requests.size).toBe(1); expect(test.outbox).toHaveLength(1); expect(test.audit).toHaveLength(1);
  });

  it("rolls back request and outbox when transaction-bound audit fails", async () => {
    const test = harness({ failAudit: true });
    await expect(test.service.request(command)).rejects.toThrow("audit unavailable");
    expect(test.requests.size).toBe(0); expect(test.outbox).toHaveLength(0); expect(test.audit).toHaveLength(0);
  });

  it("rejects non-Studio authority and cross-realm provisioning before writing", async () => {
    const test = harness();
    await expect(test.service.request({ ...command, context: { ...context, planeKey: "neon" } })).resolves.toMatchObject({ kind: "Forbidden" });
    await expect(test.service.request({ ...command, realmKey: "other-realm" })).resolves.toMatchObject({ kind: "Forbidden" });
    expect(test.run).not.toHaveBeenCalled();
  });

  it("denies before opening a transaction", async () => {
    const test = harness({ deny: true });
    await expect(test.service.request(command)).resolves.toEqual({ kind: "Forbidden", permissionCode: "iam.provisioning.create" });
    expect(test.run).not.toHaveBeenCalled(); expect(test.requests.size).toBe(0);
  });
});
