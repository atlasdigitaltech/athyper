import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { RuntimeControlCommand } from "@athyper/server-contract-control-admin";
import { describe, expect, it, vi } from "vitest";
import {
  createRuntimeCommandService,
  InMemoryRuntimeCommandStore,
  type RuntimeCommandExecutor,
} from "./runtime-command-service.js";

const requester = {
  tenantId: "tenant-1",
  principalId: "requester-1",
  planeKey: "neon",
} as VerifiedRequestContext;
const reviewer = { ...requester, principalId: "reviewer-1" };
const allow: Authorizer = {
  async authorize() {
    return { allowed: true };
  },
};

describe("runtime control commands", () => {
  it("returns a deterministic structural dry-run diff", async () => {
    const service = createService();
    await expect(
      service.preview(requester, command("feature.override.set")),
    ).resolves.toMatchObject({
      approvalRequired: false,
      diff: [
        { operation: "replace", path: "/enabled", before: false, after: true },
        { operation: "add", path: "/reason", after: "controlled rollout" },
      ],
    });
  });

  it("applies medium-risk commands once and returns idempotent replays", async () => {
    const apply = vi.fn(
      async ({ preview }: Parameters<RuntimeCommandExecutor["apply"]>[0]) =>
        preview.proposed,
    );
    const store = new InMemoryRuntimeCommandStore();
    const service = createService({ apply, store });
    const input = command("feature.override.set");
    await expect(service.submit(requester, input)).resolves.toMatchObject({
      outcome: "applied",
    });
    await expect(service.submit(requester, input)).resolves.toMatchObject({
      outcome: "replayed",
    });
    expect(apply).toHaveBeenCalledOnce();
    const history = await service.history(requester);
    expect(history.map((entry) => entry.event)).toEqual([
      "applied",
      "submitted",
    ]);
    expect(history[0]?.previousHash).toBe(history[1]?.entryHash);
    expect(
      history.every((entry) => /^[a-f0-9]{64}$/.test(entry.entryHash)),
    ).toBe(true);
  });

  it("claims the idempotency key before applying concurrent submissions", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const apply = vi.fn(
      async ({ preview }: Parameters<RuntimeCommandExecutor["apply"]>[0]) => {
        await gate;
        return preview.proposed;
      },
    );
    const service = createService({ apply });
    const input = command("feature.override.set");
    const first = service.submit(requester, input);
    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
    const second = service.submit(requester, input);
    release();
    await expect(second).resolves.toMatchObject({ outcome: "replayed" });
    await expect(first).resolves.toMatchObject({ outcome: "applied" });
    expect(apply).toHaveBeenCalledOnce();
  });

  it("requires two-person approval before a high-risk command can apply", async () => {
    const apply = vi.fn(
      async ({ preview }: Parameters<RuntimeCommandExecutor["apply"]>[0]) =>
        preview.proposed,
    );
    const service = createService({ apply });
    const input = command("connector.activate");
    const submitted = await service.submit(requester, input);
    expect(submitted).toMatchObject({
      outcome: "approval_required",
      approval: { status: "pending" },
    });
    const approvalId = submitted.approval!.approvalId;
    await expect(
      service.decideApproval(requester, approvalId, "approved", "self approve"),
    ).rejects.toMatchObject({ code: "CONTROL_ADMIN_SELF_APPROVAL_FORBIDDEN" });
    await expect(
      service.decideApproval(
        reviewer,
        approvalId,
        "approved",
        "reviewed change plan",
      ),
    ).resolves.toMatchObject({
      status: "approved",
      decidedBy: reviewer.principalId,
    });
    await expect(
      service.submit(requester, { ...input, approvalId }),
    ).resolves.toMatchObject({ outcome: "applied" });
    expect(apply).toHaveBeenCalledOnce();
  });

  it("rejects changed payloads under an existing idempotency key", async () => {
    const service = createService();
    const input = command("feature.override.set");
    await service.submit(requester, input);
    await expect(
      service.submit(requester, { ...input, payload: { enabled: false } }),
    ).rejects.toMatchObject({ code: "CONTROL_ADMIN_IDEMPOTENCY_CONFLICT" });
  });

  it("keeps rejected approvals immutable and prevents application", async () => {
    const apply = vi.fn(
      async ({ preview }: Parameters<RuntimeCommandExecutor["apply"]>[0]) =>
        preview.proposed,
    );
    const service = createService({ apply });
    const input = command("bank_rule.publish");
    const pending = await service.submit(requester, input);
    const approvalId = pending.approval!.approvalId;
    await service.decideApproval(
      reviewer,
      approvalId,
      "rejected",
      "insufficient rollback evidence",
    );
    await expect(
      service.submit(requester, { ...input, approvalId }),
    ).rejects.toMatchObject({ code: "CONTROL_ADMIN_APPROVAL_INVALID" });
    await expect(service.submit(requester, input)).resolves.toMatchObject({
      outcome: "approval_required",
      approval: {
        status: "rejected",
        decisionReason: "insufficient rollback evidence",
      },
    });
    expect(apply).not.toHaveBeenCalled();
  });
});

function createService(
  overrides: {
    readonly apply?: RuntimeCommandExecutor["apply"];
    readonly store?: InMemoryRuntimeCommandStore;
  } = {},
) {
  return createRuntimeCommandService({
    authorizer: allow,
    store: overrides.store ?? new InMemoryRuntimeCommandStore(),
    executor: {
      effects: "transactional",
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

function advanced(risk: "low" | "high" = "high") {
  const store = new InMemoryRuntimeCommandStore();
  const preview = vi.fn(async () => ({
    current: { version: 1 },
    proposed: { version: 2 },
    risk,
  }));
  const apply = vi.fn(async () => ({ done: true }));
  const service = createRuntimeCommandService({
    authorizer: allow,
    store,
    executor: { effects: "transactional", preview, apply },
  });
  return { store, preview, apply, service };
}
describe("runtime command boundary guarantees", () => {
  it("rejects cross-principal replay before preview or execution", async () => {
    const f = advanced("low"),
      input = command("feature.set");
    await f.service.submit(requester, input);
    f.preview.mockClear();
    await expect(f.service.submit(reviewer, input)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(f.preview).not.toHaveBeenCalled();
    expect(f.apply).toHaveBeenCalledOnce();
  });
  it("replays persisted success even when preview is no longer available", async () => {
    const f = advanced("low"),
      input = command("feature.set");
    await f.service.submit(requester, input);
    f.preview.mockRejectedValueOnce(new Error("unavailable"));
    await expect(f.service.submit(requester, input)).resolves.toMatchObject({
      outcome: "replayed",
    });
    expect(f.preview).toHaveBeenCalledOnce();
  });
  it("does not execute merely because approval was granted", async () => {
    const f = advanced(),
      input = command("feature.activate");
    const pending = await f.service.submit(requester, input);
    await f.service.decideApproval(
      reviewer,
      pending.approval!.approvalId,
      "approved",
      "Reviewed",
    );
    expect(f.apply).not.toHaveBeenCalled();
    await f.service.submit(requester, {
      ...input,
      approvalId: pending.approval!.approvalId,
    });
    expect(f.apply).toHaveBeenCalledOnce();
  });
  it("binds approval to the current and proposed values", async () => {
    const f = advanced(),
      input = command("feature.activate");
    const pending = await f.service.submit(requester, input);
    await f.service.decideApproval(
      reviewer,
      pending.approval!.approvalId,
      "approved",
      "Reviewed",
    );
    f.preview.mockResolvedValueOnce({
      current: { version: 9 },
      proposed: { version: 2 },
      risk: "high",
    });
    await expect(
      f.service.submit(requester, {
        ...input,
        approvalId: pending.approval!.approvalId,
      }),
    ).rejects.toMatchObject({
      code: "CONTROL_ADMIN_APPROVAL_PREVIEW_CHANGED",
      statusCode: 409,
    });
    expect(f.apply).not.toHaveBeenCalled();
  });
  it("does not bypass pending approval if executor risk falls", async () => {
    const f = advanced(),
      input = command("feature.activate");
    await f.service.submit(requester, input);
    f.preview.mockResolvedValueOnce({
      current: { version: 1 },
      proposed: { version: 2 },
      risk: "low",
    });
    await expect(f.service.submit(requester, input)).resolves.toMatchObject({
      outcome: "approval_required",
    });
    expect(f.apply).not.toHaveBeenCalled();
  });
  it("handles concurrent identical approval requests idempotently", async () => {
    const f = advanced(),
      input = command("feature.activate");
    const results = await Promise.all([
      f.service.submit(requester, input),
      f.service.submit(requester, input),
    ]);
    expect(results[0]?.approval?.approvalId).toBe(
      results[1]?.approval?.approvalId,
    );
    expect((await f.service.history(requester)).map((x) => x.event)).toEqual([
      "approval_requested",
      "submitted",
    ]);
  });
  it("hides a foreign approval before checking its status", async () => {
    const f = advanced(),
      pending = await f.service.submit(requester, command("feature.activate"));
    await f.service.decideApproval(
      reviewer,
      pending.approval!.approvalId,
      "rejected",
      "No",
    );
    await expect(
      f.service.decideApproval(
        { ...reviewer, tenantId: "foreign" },
        pending.approval!.approvalId,
        "approved",
        "Yes",
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  it.each([
    undefined,
    null,
    { kind: "!" },
    { payload: { bad: NaN } },
    { payload: { bad: undefined } },
    { payload: { bad: new Date() } },
    { approvalId: 42 },
    { reason: "" },
    { expectedVersion: -1 },
    { expectedVersion: 9007199254740992 },
  ])("rejects malformed direct commands %j", async (patch) => {
    const f = advanced();
    await expect(
      f.service.preview(
        requester,
        patch == null
          ? (patch as never)
          : ({ ...command("feature.set"), ...patch } as RuntimeControlCommand),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(f.preview).not.toHaveBeenCalled();
  });
  it("rejects invalid direct decisions", async () => {
    const f = advanced();
    await expect(
      f.service.decideApproval(reviewer, "id", "bypass" as never, "Reviewed"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("rejects invalid executor risks instead of treating them as low", async () => {
    const f = advanced();
    f.preview.mockResolvedValueOnce({
      current: { version: 1 },
      proposed: { version: 2 },
      risk: "invalid" as never,
    });
    await expect(
      f.service.submit(requester, command("feature.set")),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(f.apply).not.toHaveBeenCalled();
  });
  it("protects nested history and stored replay values from mutation", async () => {
    const f = advanced("low");
    await f.service.submit(requester, command("feature.set"));
    const entries = await f.service.history(requester);
    expect(() => {
      (entries[0]!.detail as Record<string, unknown>)["approvalId"] =
        "tampered";
    }).toThrow();
    expect((await f.service.history(requester))[0]!.detail["approvalId"]).toBe(
      null,
    );
    const saved = await f.store.findSubmission(
      requester.tenantId,
      command("feature.set").idempotencyKey,
    );
    expect(() => {
      (saved!.submission.value as Record<string, unknown>)["done"] = false;
    }).toThrow();
  });
  it("does not automatically retry failed execution", async () => {
    const f = advanced("low");
    f.apply.mockRejectedValueOnce(Error("failed"));
    const input = command("feature.set");
    await expect(f.service.submit(requester, input)).rejects.toThrow("failed");
    expect(f.apply).toHaveBeenCalledOnce();
    expect(
      await f.store.findSubmission(requester.tenantId, input.idempotencyKey),
    ).toBeUndefined();
    expect(await f.service.history(requester)).toEqual([]);
    await expect(f.service.submit(requester, input)).resolves.toMatchObject({
      outcome: "applied",
    });
    expect(f.apply).toHaveBeenCalledTimes(2);
  });
});

it("requires a new review for legacy approvals with no preview evidence", async () => {
  const f = advanced();
  const input = command("feature.activate");
  const planned = await f.service.preview(requester, input);
  await f.store.appendApprovalRequest({
    approvalId: "legacy",
    commandId: input.commandId,
    commandFingerprint: planned.fingerprint,
    kind: input.kind,
    requestedBy: requester.principalId,
    requestedAt: new Date().toISOString(),
    status: "pending",
    planeKey: requester.planeKey,
    tenantId: requester.tenantId,
  });
  await f.service.decideApproval(
    reviewer,
    "legacy",
    "approved",
    "Reviewed legacy",
  );
  await expect(
    f.service.submit(requester, { ...input, approvalId: "legacy" }),
  ).rejects.toMatchObject({
    statusCode: 409,
    code: "CONTROL_ADMIN_APPROVAL_PREVIEW_CHANGED",
  });
  expect(f.apply).not.toHaveBeenCalled();
});

it("rejects executors that do not declare transactional effects", () => {
  expect(() =>
    createRuntimeCommandService({
      store: new InMemoryRuntimeCommandStore(),
      authorizer: allow,
      executor: {
        preview: async () => ({ current: null, proposed: null }),
        apply: async () => null,
      } as unknown as RuntimeCommandExecutor,
    }),
  ).toThrowError(
    expect.objectContaining({
      code: "CONTROL_ADMIN_TRANSACTIONAL_EXECUTOR_REQUIRED",
    }),
  );
});
