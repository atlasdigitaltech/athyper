import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { RuntimeControlCommand } from "@athyper/server-contract-control-admin";
import { describe, expect, it, vi } from "vitest";
import { createRuntimeCommandService, InMemoryRuntimeCommandStore, type RuntimeCommandExecutor } from "./runtime-command-service.js";

const requester = { tenantId: "tenant-1", principalId: "requester-1", planeKey: "neon" } as VerifiedRequestContext;
const reviewer = { ...requester, principalId: "reviewer-1" };
const allow: Authorizer = { async authorize() { return { allowed: true }; } };

describe("runtime control commands", () => {
  it("returns a deterministic structural dry-run diff", async () => {
    const service = createService();
    await expect(service.preview(requester, command("feature.override.set"))).resolves.toMatchObject({
      approvalRequired: false,
      diff: [
        { operation: "replace", path: "/enabled", before: false, after: true },
        { operation: "add", path: "/reason", after: "controlled rollout" },
      ],
    });
  });

  it("applies medium-risk commands once and returns idempotent replays", async () => {
    const apply = vi.fn(async ({ preview }: Parameters<RuntimeCommandExecutor["apply"]>[0]) => preview.proposed);
    const store = new InMemoryRuntimeCommandStore();
    const service = createService({ apply, store });
    const input = command("feature.override.set");
    await expect(service.submit(requester, input)).resolves.toMatchObject({ outcome: "applied" });
    await expect(service.submit(requester, input)).resolves.toMatchObject({ outcome: "replayed" });
    expect(apply).toHaveBeenCalledOnce();
    const history = await service.history(requester);
    expect(history.map((entry) => entry.event)).toEqual(["applied", "submitted"]);
    expect(history[0]?.previousHash).toBe(history[1]?.entryHash);
    expect(history.every((entry) => /^[a-f0-9]{64}$/.test(entry.entryHash))).toBe(true);
  });

  it("claims the idempotency key before applying concurrent submissions", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const apply = vi.fn(async ({ preview }: Parameters<RuntimeCommandExecutor["apply"]>[0]) => { await gate; return preview.proposed; });
    const service = createService({ apply });
    const input = command("feature.override.set");
    const first = service.submit(requester, input);
    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
    await expect(service.submit(requester, input)).resolves.toMatchObject({ outcome: "pending" });
    release();
    await expect(first).resolves.toMatchObject({ outcome: "applied" });
    expect(apply).toHaveBeenCalledOnce();
  });

  it("requires two-person approval before a high-risk command can apply", async () => {
    const apply = vi.fn(async ({ preview }: Parameters<RuntimeCommandExecutor["apply"]>[0]) => preview.proposed);
    const service = createService({ apply });
    const input = command("connector.activate");
    const submitted = await service.submit(requester, input);
    expect(submitted).toMatchObject({ outcome: "approval_required", approval: { status: "pending" } });
    const approvalId = submitted.approval!.approvalId;
    await expect(service.decideApproval(requester, approvalId, "approved", "self approve"))
      .rejects.toMatchObject({ code: "CONTROL_ADMIN_SELF_APPROVAL_FORBIDDEN" });
    await expect(service.decideApproval(reviewer, approvalId, "approved", "reviewed change plan"))
      .resolves.toMatchObject({ status: "approved", decidedBy: reviewer.principalId });
    await expect(service.submit(requester, { ...input, approvalId })).resolves.toMatchObject({ outcome: "applied" });
    expect(apply).toHaveBeenCalledOnce();
  });

  it("rejects changed payloads under an existing idempotency key", async () => {
    const service = createService();
    const input = command("feature.override.set");
    await service.submit(requester, input);
    await expect(service.submit(requester, { ...input, payload: { enabled: false } }))
      .rejects.toMatchObject({ code: "CONTROL_ADMIN_IDEMPOTENCY_CONFLICT" });
  });

  it("keeps rejected approvals immutable and prevents application", async () => {
    const apply = vi.fn(async ({ preview }: Parameters<RuntimeCommandExecutor["apply"]>[0]) => preview.proposed);
    const service = createService({ apply });
    const input = command("bank_rule.publish");
    const pending = await service.submit(requester, input);
    const approvalId = pending.approval!.approvalId;
    await service.decideApproval(reviewer, approvalId, "rejected", "insufficient rollback evidence");
    await expect(service.submit(requester, { ...input, approvalId }))
      .rejects.toMatchObject({ code: "CONTROL_ADMIN_APPROVAL_INVALID" });
    await expect(service.submit(requester, input)).resolves.toMatchObject({
      outcome: "approval_required",
      approval: { status: "rejected", decisionReason: "insufficient rollback evidence" },
    });
    expect(apply).not.toHaveBeenCalled();
  });
});

function createService(overrides: {
  readonly apply?: RuntimeCommandExecutor["apply"];
  readonly store?: InMemoryRuntimeCommandStore;
} = {}) {
  return createRuntimeCommandService({
    authorizer: allow,
    store: overrides.store ?? new InMemoryRuntimeCommandStore(),
    executor: {
      preview: async ({ command: input }) => ({
        current: { enabled: false },
        proposed: { ...input.payload, reason: "controlled rollout" },
      }),
      apply: overrides.apply ?? vi.fn(async ({ preview }) => preview.proposed),
    },
    now: () => new Date("2026-08-12T00:00:00.000Z"),
  });
}

function command(kind: string): RuntimeControlCommand {
  return {
    commandId: "command-1",
    idempotencyKey: "tenant-1:command-1",
    kind,
    reason: "Operator requested rollout",
    payload: { enabled: true },
    expectedVersion: 3,
  };
}
