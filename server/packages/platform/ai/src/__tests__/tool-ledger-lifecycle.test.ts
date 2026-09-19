import { describe, expect, it, vi } from "vitest";
import type { AtlasDomainCommandBus, AtlasRegisteredTool } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { AtlasToolRegistry, AtlasToolService } from "../index.js";
import { MemoryToolStore } from "./tool-store-fixture.js";

const ids = {
  tenant: "10000000-0000-4000-8000-000000000001", principal: "10000000-0000-4000-8000-000000000002",
  thread: "10000000-0000-4000-8000-000000000003", run: "10000000-0000-4000-8000-000000000004",
  proposal: "10000000-0000-4000-8000-000000000005", command: "10000000-0000-4000-8000-000000000006",
};
const context = (authEpoch = 3): VerifiedRequestContext => ({
  planeKey: "neon", realmKey: "neon", tenantId: ids.tenant, principalId: ids.principal, authEpoch,
  requestId: "request-1", profileHash: `profile-${authEpoch}`,
  permissions: { planeKey: "neon", tenantId: ids.tenant, principalId: ids.principal, principalFingerprint: "principal-hash", profileHash: `profile-${authEpoch}`, schemaHash: "schema-1", resolvedAt: 1, allowed: ["finance.invoice.post"], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] },
});
const mutation: AtlasRegisteredTool = { manifest: { schema: "atlas-tool-manifest/1", toolCode: "invoice_post", version: "1", displayName: "Post invoice", description: "Posts a validated invoice.", access: "mutation", risk: "high", allowedPlanes: ["neon"], requiredPermissions: ["finance.invoice.post"], featureKey: "atlas_tools_mutation_enabled", inputSchema: {}, resultSchema: {}, timeoutMs: 1_000, maxResultBytes: 1_000, commandBinding: "finance.invoice.post", confirmation: "explicit_user" } };

function harness(options: { now?: () => Date; authority?: (input: { phase: "preview" | "execute" }) => Promise<{ allowed: boolean; policyRevision: string }>; commands?: AtlasDomainCommandBus["execute"] } = {}) {
  const store = new MemoryToolStore(); const commands = options.commands ?? vi.fn<AtlasDomainCommandBus["execute"]>(async () => ({ commandId: ids.command, revision: "8", data: { posted: true } }));
  const service = new AtlasToolService({ registry: new AtlasToolRegistry([mutation]), authority: { authorize: options.authority ?? (async () => ({ allowed: true, policyRevision: "policy-1" })) }, proposals: store, records: { query: vi.fn() }, confirmations: { verify: vi.fn(async () => true) }, commands: { execute: commands }, createId: () => ids.proposal, createConfirmationToken: () => "server-signed-confirmation", now: options.now ?? (() => new Date("2026-08-11T00:00:00Z")), proposalTtlMs: 60_000 });
  return { store, service, commands };
}
async function preview(service: AtlasToolService, callId = "provider-call-1") { return service.preview({ context: context(), threadId: ids.thread, runId: ids.run, callId, toolCode: "invoice_post", toolVersion: "1", arguments: { invoiceId: "inv-1", secret: "must-not-persist" }, summary: "Post invoice", affectedEntityType: "finance.invoice", affectedEntityId: ids.command, expectedRowVersion: 7 }); }

describe("durable Atlas tool invocation lifecycle", () => {
  it("confirms, executes once, replays the command receipt, and persists hashes rather than payloads", async () => {
    const { store, service, commands } = harness(); const proposal = await preview(service);
    expect(proposal.confirmationToken).toBe("server-signed-confirmation");
    const first = await service.run({ context: context(), proposalId: proposal.proposalId, arguments: { secret: "must-not-persist", invoiceId: "inv-1" }, confirmationToken: proposal.confirmationToken });
    const replay = await service.run({ context: context(), proposalId: proposal.proposalId, arguments: { invoiceId: "inv-1", secret: "must-not-persist" } });
    expect(first).toMatchObject({ outcome: "completed", commandId: ids.command, resultRevision: "8" }); expect(replay).toMatchObject({ outcome: "completed", replayed: true, commandId: ids.command, resultRevision: "8" }); expect(commands).toHaveBeenCalledOnce();
    const row = store.rows.get(ids.proposal)!; expect(row.status).toBe("completed"); expect(row.argumentHash).toMatch(/^[0-9a-f]{64}$/); expect(row.resultHash).toMatch(/^[0-9a-f]{64}$/);
    const persisted = JSON.stringify(row); expect(persisted).not.toContain("must-not-persist"); expect(persisted).not.toContain("server-signed-confirmation"); expect(persisted).not.toContain('"posted":true');
    const history = await service.history({ context: context() }); expect(history.items).toHaveLength(1); expect(history.items[0]).toMatchObject({ proposalId: ids.proposal, status: "completed", businessTransactionId: ids.command, policyRevision: "policy-1", confirmationRequired: true }); expect(JSON.stringify(history)).not.toContain("must-not-persist"); expect(JSON.stringify(history)).not.toContain("server-signed-confirmation");
    await expect(store.fail({ context: context(), proposalId: row.proposalId, expectedStatuses: ["executing"], errorClass: "late_failure", terminalAt: "2026-08-11T00:01:00Z", durationMs: 60_000 })).resolves.toMatchObject({ kind: "conflict", proposal: { status: "completed" } });
  });

  it("replays duplicate provider call IDs but rejects a changed input", async () => {
    const { service } = harness();
    const first = await preview(service); const duplicate = await preview(service); expect(duplicate).toMatchObject({ proposalId: first.proposalId, replayed: true });
    await expect(service.preview({ context: context(), threadId: ids.thread, runId: ids.run, callId: "provider-call-1", toolCode: "invoice_post", toolVersion: "1", arguments: { invoiceId: "changed" }, summary: "Post invoice", affectedEntityType: "finance.invoice", affectedEntityId: ids.command, expectedRowVersion: 7 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(service.preview({ context: context(), threadId: ids.thread, runId: ids.run, callId: "provider-call-1", toolCode: "invoice_post", toolVersion: "1", arguments: { invoiceId: "inv-1", secret: "must-not-persist" }, summary: "Post invoice", affectedEntityType: "finance.invoice", affectedEntityId: ids.command, expectedRowVersion: 8 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("keeps a proposal open on token mismatch and expires it exactly once", async () => {
    let now = new Date("2026-08-11T00:00:00Z"); const { store, service } = harness({ now: () => now }); const proposal = await preview(service);
    await expect(service.run({ context: context(), proposalId: proposal.proposalId, arguments: { invoiceId: "inv-1", secret: "must-not-persist" }, confirmationToken: "wrong" })).rejects.toMatchObject({ code: "CONFIRMATION_INVALID" });
    expect(store.rows.get(ids.proposal)?.status).toBe("proposed"); now = new Date("2026-08-11T00:01:00Z");
    await expect(service.run({ context: context(), proposalId: proposal.proposalId, arguments: { invoiceId: "inv-1", secret: "must-not-persist" }, confirmationToken: proposal.confirmationToken })).rejects.toMatchObject({ code: "STALE_PROPOSAL" });
    expect(store.rows.get(ids.proposal)?.status).toBe("expired");
  });

  it("denies an authorization epoch/profile change before execution", async () => {
    const { store, service, commands } = harness(); const proposal = await preview(service);
    await expect(service.run({ context: context(4), proposalId: proposal.proposalId, arguments: { invoiceId: "inv-1", secret: "must-not-persist" }, confirmationToken: proposal.confirmationToken })).rejects.toMatchObject({ code: "TOOL_DENIED" });
    expect(store.rows.get(ids.proposal)).toMatchObject({ status: "denied", terminalErrorClass: "authorization_epoch_changed" }); expect(commands).not.toHaveBeenCalled();
  });

  it("records worker cancellation without invoking the downstream command", async () => {
    const { store, service, commands } = harness(); const proposal = await preview(service); const controller = new AbortController(); controller.abort();
    await expect(service.run({ context: context(), proposalId: proposal.proposalId, arguments: { invoiceId: "inv-1", secret: "must-not-persist" }, confirmationToken: proposal.confirmationToken, signal: controller.signal })).resolves.toMatchObject({ outcome: "cancelled" });
    expect(store.rows.get(ids.proposal)).toMatchObject({ status: "cancelled", terminalErrorClass: "worker_cancelled" }); expect(commands).not.toHaveBeenCalled();
  });

  it("rejects authority snapshots that attempt to persist secret or prompt content", async () => {
    const { store, service } = harness({ authority: async () => ({ allowed: true, policyRevision: "policy-1", policySnapshot: { api_key: "forbidden" } } as never) });
    await expect(preview(service)).rejects.toMatchObject({ code: "TOOL_INVALID" }); expect(store.rows.size).toBe(0);
  });
});

it("rejects cancellation during command execution and preserves its completion receipt", async () => {
  let release!: () => void;
  let started!: () => void;
  const running = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { service, store } = harness({ commands: async () => { started(); await gate; return { commandId: ids.command, revision: "8" }; } });
  const proposal = await preview(service);
  const execution = service.run({ context: context(), proposalId: proposal.proposalId, arguments: { invoiceId: "inv-1", secret: "must-not-persist" }, confirmationToken: proposal.confirmationToken });
  await running;
  try {
    await expect(service.cancel({ context: context(), proposalId: proposal.proposalId })).rejects.toMatchObject({ code: "TOOL_IN_PROGRESS" });
    expect(store.rows.get(ids.proposal)?.status).toBe("executing");
  } finally { release(); }
  await expect(execution).resolves.toMatchObject({ outcome: "completed", commandId: ids.command });
  expect(store.rows.get(ids.proposal)?.status).toBe("completed");
});
