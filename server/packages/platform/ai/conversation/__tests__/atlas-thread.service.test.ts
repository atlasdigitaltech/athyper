import type { VerifiedRequestContext } from "@athyper/svc-iam";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AtlasThreadService,
  FixedAtlasRetentionPolicyResolver,
  createPrincipalPrivateAtlasThreadAuthorizers,
} from "../atlas-thread.service.js";
import type {
  AtlasMessageRecord,
  AtlasRunRecord,
  AtlasThreadMaintenanceAuthority,
  AtlasThreadRecord,
  AtlasThreadRepository,
} from "../atlas-thread.types.js";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_PRINCIPAL_ID = "20000000-0000-4000-8000-000000000002";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const RUN_ID = "40000000-0000-4000-8000-000000000001";
const CLIENT_REQUEST_ID = "50000000-0000-4000-8000-000000000001";
const INPUT_MESSAGE_ID = "60000000-0000-4000-8000-000000000001";
const OUTPUT_MESSAGE_ID = "60000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-07-23T10:00:00.000Z");

function context(
  allowed: readonly string[] = [
    "ai.agent.use",
    "ai.agent.history.read",
    "ai.agent.history.manage",
    "ai.agent.history.delete",
    "ai.agent.history.export",
  ],
  principalId = PRINCIPAL_ID,
): VerifiedRequestContext {
  const permissions = {
    tenantId: TENANT_ID,
    principalId,
    planeKey: "neon" as const,
    authEpoch: 4,
    profileHash: "profile-hash",
    allowed: new Set(allowed),
    denied: new Set<string>(),
    planLocked: new Set<string>(),
    planeExcluded: new Set<string>(),
    entries: new Map(),
    authorizationScopes: new Map(),
  };
  return Object.freeze({
    tenantId: TENANT_ID,
    principalId,
    planeKey: "neon" as const,
    realmKey: "athyper",
    requestId: "request-1",
    authEpoch: 4,
    profileHash: "profile-hash",
    permissions,
  });
}

function thread(
  overrides: Partial<AtlasThreadRecord> = {},
): AtlasThreadRecord {
  return {
    threadId: THREAD_ID,
    tenantId: TENANT_ID,
    plane: "neon",
    ownerPrincipalId: PRINCIPAL_ID,
    title: null,
    status: "active",
    rowVersion: "1",
    lastMessageSequence: "0",
    retention: {
      policyId: "atlas-default-30d-v1",
      expiresAt: new Date("2026-08-22T10:00:00.000Z"),
      purgeAfter: null,
      legalHold: false,
    },
    summaryVersion: 0,
    createdAt: NOW,
    updatedAt: null,
    access: {
      participantRole: "owner",
      owner: true,
    },
    ...overrides,
  };
}

function run(
  overrides: Partial<AtlasRunRecord> = {},
): AtlasRunRecord {
  return {
    runId: RUN_ID,
    threadId: THREAD_ID,
    plane: "neon",
    principalId: PRINCIPAL_ID,
    clientRequestId: CLIENT_REQUEST_ID,
    inputMessageId: INPUT_MESSAGE_ID,
    outputMessageId: OUTPUT_MESSAGE_ID,
    status: "started",
    cancellationRequestedAt: null,
    terminalAt: null,
    terminalErrorClass: null,
    meteringRunId: null,
    startedAt: NOW,
    ...overrides,
  };
}

function message(input: {
  id: string;
  sequence: string;
  role: "user" | "assistant";
  text: string;
  status?: "completed" | "failed" | "cancelled";
}): AtlasMessageRecord {
  return {
    messageId: input.id,
    threadId: THREAD_ID,
    plane: "neon",
    sequence: input.sequence,
    role: input.role,
    status: input.status ?? "completed",
    contentBlocks: [{ type: "text", text: input.text }],
    runId: RUN_ID,
    parentMessageId: null,
    resultCards: [],
    citationRefs: [],
    toolRefs: [],
    terminalErrorClass: input.status === "failed" ? "provider_error" : null,
    createdAt: NOW,
    terminalAt: NOW,
  };
}

function fakeRepository() {
  const repository = {
    create: vi.fn(async (_scope, input) => thread({
      threadId: input.threadId,
      title: input.title,
      retention: {
        policyId: input.retentionPolicyId,
        expiresAt: input.expiresAt,
        purgeAfter: null,
        legalHold: false,
      },
    })),
    list: vi.fn(async () => ({ items: [thread()], nextCursor: null })),
    get: vi.fn(async () => thread()),
    listMessages: vi.fn(async () => ({ items: [], nextCursor: null })),
    rename: vi.fn(async (_scope, input) => thread({
      title: input.title,
      rowVersion: "2",
    })),
    archive: vi.fn(async () => thread({
      status: "archived",
      rowVersion: "2",
    })),
    softDelete: vi.fn(async () => true),
    createThreadAndBeginRun: vi.fn(async (_scope, input) => ({
      replayed: false,
      run: run({
        threadId: input.threadId,
        runId: input.runId,
        clientRequestId: input.clientRequestId,
        inputMessageId: input.inputMessageId,
        outputMessageId: input.outputMessageId,
      }),
      inputSequence: "5",
      outputSequence: "6",
    })),
    beginRun: vi.fn(async (_scope, input) => ({
      replayed: false,
      run: run({
        threadId: input.threadId,
        runId: input.runId,
        clientRequestId: input.clientRequestId,
        inputMessageId: input.inputMessageId,
        outputMessageId: input.outputMessageId,
      }),
      inputSequence: "5",
      outputSequence: "6",
    })),
    completeRun: vi.fn(async (_scope, input) => run({
      runId: input.runId,
      status: "completed",
      terminalAt: input.terminalAt,
      meteringRunId: input.meteringRunId ?? null,
    })),
    failRun: vi.fn(async (_scope, input) => run({
      runId: input.runId,
      status: "failed",
      terminalAt: input.terminalAt,
      terminalErrorClass: input.terminalErrorClass,
    })),
    cancelRun: vi.fn(async (_scope, input) => run({
      runId: input.runId,
      status: "cancelled",
      terminalAt: input.terminalAt,
      terminalErrorClass: "cancelled",
    })),
  } satisfies Record<keyof AtlasThreadRepository, unknown>;
  return repository as unknown as AtlasThreadRepository & typeof repository;
}

function service(
  repository = fakeRepository(),
  maintenanceAuthority?: AtlasThreadMaintenanceAuthority,
  metrics?: { observePurge?: (result: { expiredCount: number; purgedCount: number }) => void; observeThreadOperation?: (operation: "purge", outcome: "success") => void },
) {
  return {
    repository,
    service: new AtlasThreadService({
      repository,
      retentionPolicies: new FixedAtlasRetentionPolicyResolver({
        defaultRetentionDays: 30,
        minimumRetentionDays: 7,
        maximumRetentionDays: 90,
      }),
      authorizers: createPrincipalPrivateAtlasThreadAuthorizers(),
      ...(maintenanceAuthority ? { maintenanceAuthority } : {}),
      ...(metrics ? { metrics } : {}),
      clock: { now: () => new Date(NOW) },
      purgeBatchSize: 50,
      contextMaxMessages: 20,
      contextMaxCharacters: 30,
      staleRunTimeoutMs: 15 * 60_000,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AtlasThreadService", () => {
  it("returns approved copy from the same effective retention resolution used for creation", async () => {
    const target = service();

    const effective = await target.service.getEffectiveRetentionPolicy(
      context(),
    );

    expect(effective).toEqual({
      policyId: "atlas-default-30d-v1",
      retentionDays: 30,
      expiresAt: new Date("2026-08-22T10:00:00.000Z"),
      displayText:
        "Atlas conversations are retained for 30 days under atlas-default-30d-v1; legal holds suspend expiry and purge.",
    });
  });

  it("derives retention on the server and creates an owner-private thread", async () => {
    const target = service();

    const created = await target.service.createThread(context(), {
      title: "  First thread  ",
    });

    expect(created.title).toBe("First thread");
    expect(target.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        principalId: PRINCIPAL_ID,
        plane: "neon",
      }),
      expect.objectContaining({
        title: "First thread",
        retentionPolicyId: "atlas-default-30d-v1",
        expiresAt: new Date("2026-08-22T10:00:00.000Z"),
      }),
    );
  });

  it("exports chronological portable transcript blocks under the dedicated export permission", async () => {
    const target = service();
    target.repository.listMessages.mockResolvedValueOnce({
      items: [
        message({ id: OUTPUT_MESSAGE_ID, sequence: "2", role: "assistant", text: "second" }),
        message({ id: INPUT_MESSAGE_ID, sequence: "1", role: "user", text: "first" }),
      ],
      nextCursor: null,
    });

    const exported = await target.service.exportTranscript(context(), THREAD_ID);

    expect(exported.format).toBe("atlas-thread-transcript/v1");
    expect(exported.messages.map((item) => item.sequence)).toEqual(["1", "2"]);
    expect(target.repository.listMessages).toHaveBeenCalledWith(
      expect.objectContaining({ principalId: PRINCIPAL_ID }),
      expect.objectContaining({ threadId: THREAD_ID, limit: 100, cursor: null }),
    );
  });

  it("does not export history without the dedicated export permission", async () => {
    const target = service();
    await expect(target.service.exportTranscript(context([
      "ai.agent.use",
      "ai.agent.history.read",
    ]), THREAD_ID)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(target.repository.get).not.toHaveBeenCalled();
  });

  it("fails closed for a mismatched verified permission context", async () => {
    const target = service();
    const invalid = context();
    const mismatched = {
      ...invalid,
      permissions: {
        ...invalid.permissions,
        principalId: OTHER_PRINCIPAL_ID,
      },
    } as VerifiedRequestContext;

    await expect(target.service.listThreads(mismatched)).rejects.toMatchObject({
      code: "INVALID_VERIFIED_CONTEXT",
      status: 403,
    });
    expect(target.repository.list).not.toHaveBeenCalled();
  });

  it("does not reveal a same-tenant non-owner thread", async () => {
    const target = service();
    target.repository.get.mockResolvedValueOnce(thread({
      access: { participantRole: "member", owner: false },
    }));

    await expect(
      target.service.renameThread(context([
        "ai.agent.use",
        "ai.agent.history.manage",
      ], OTHER_PRINCIPAL_ID), {
        threadId: THREAD_ID,
        expectedRowVersion: "1",
        title: "No",
      }),
    ).rejects.toMatchObject({ code: "THREAD_NOT_FOUND", status: 404 });
  });

  it("returns bounded authoritative completed history before provider invocation", async () => {
    const target = service();
    target.repository.listMessages.mockResolvedValueOnce({
      items: [
        message({
          id: "60000000-0000-4000-8000-000000000010",
          sequence: "1",
          role: "user",
          text: "too-old-to-fit-after-newer",
        }),
        message({
          id: "60000000-0000-4000-8000-000000000011",
          sequence: "2",
          role: "assistant",
          text: "discarded failure",
          status: "failed",
        }),
        message({
          id: "60000000-0000-4000-8000-000000000012",
          sequence: "3",
          role: "user",
          text: "recent question",
        }),
        message({
          id: "60000000-0000-4000-8000-000000000013",
          sequence: "4",
          role: "assistant",
          text: "recent answer",
        }),
      ],
      nextCursor: null,
    });

    const prepared = await target.service.prepareRun(
      context(["ai.agent.use"]),
      {
        runId: RUN_ID,
        requestedThreadId: THREAD_ID,
        clientRequestId: CLIENT_REQUEST_ID,
        userMessage: "new question",
      },
    );

    expect(prepared).toMatchObject({
      runId: RUN_ID,
      threadId: THREAD_ID,
      inputSequence: "5",
      outputSequence: "6",
      replayed: false,
      authoritativeHistory: [
        { role: "user", content: "recent question" },
        { role: "assistant", content: "recent answer" },
      ],
    });
    expect(target.repository.beginRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        runId: RUN_ID,
        clientRequestId: CLIENT_REQUEST_ID,
        inputContentBlocks: [{ type: "text", text: "new question" }],
        staleBefore: new Date("2026-07-23T09:45:00.000Z"),
      }),
    );
    expect(
      target.repository.createThreadAndBeginRun,
    ).not.toHaveBeenCalled();
    expect(target.repository.listMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        threadId: THREAD_ID,
        cursor: { beforeSequence: "5" },
      }),
    );
  });

  it("delegates initial thread creation or replay to one atomic repository primitive", async () => {
    const target = service();
    target.repository.createThreadAndBeginRun.mockResolvedValueOnce({
      replayed: true,
      run: run({
        status: "completed",
        terminalAt: NOW,
      }),
      inputSequence: "5",
      outputSequence: "6",
    });
    target.repository.listMessages.mockResolvedValueOnce({
      items: [
        message({
          id: "60000000-0000-4000-8000-000000000020",
          sequence: "4",
          role: "assistant",
          text: "authoritative prior answer",
        }),
      ],
      nextCursor: null,
    });

    const replayed = await target.service.prepareRun(
      context(["ai.agent.use"]),
      {
        // A runtime retry can generate a fresh candidate run id. The persisted
        // run remains authoritative.
        runId: "40000000-0000-4000-8000-000000000099",
        clientRequestId: CLIENT_REQUEST_ID,
        userMessage: "same initial question",
      },
    );

    expect(replayed).toMatchObject({
      runId: RUN_ID,
      threadId: THREAD_ID,
      inputMessageId: INPUT_MESSAGE_ID,
      outputMessageId: OUTPUT_MESSAGE_ID,
      inputSequence: "5",
      outputSequence: "6",
      replayed: true,
      runStatus: "completed",
      authoritativeHistory: [{
        role: "assistant",
        content: "authoritative prior answer",
      }],
    });
    expect(target.repository.createThreadAndBeginRun).toHaveBeenCalledWith(
      {
        tenantId: TENANT_ID,
        principalId: PRINCIPAL_ID,
        plane: "neon",
      },
      expect.objectContaining({
        clientRequestId: CLIENT_REQUEST_ID,
        runId: "40000000-0000-4000-8000-000000000099",
        title: null,
        retentionPolicyId: "atlas-default-30d-v1",
        expiresAt: new Date("2026-08-22T10:00:00.000Z"),
        inputContentBlocks: [{
          type: "text",
          text: "same initial question",
        }],
        startedAt: NOW,
        staleBefore: new Date("2026-07-23T09:45:00.000Z"),
      }),
    );
    expect(target.repository.create).not.toHaveBeenCalled();
    expect(target.repository.beginRun).not.toHaveBeenCalled();
    expect(target.repository.listMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        threadId: THREAD_ID,
        cursor: { beforeSequence: "5" },
      }),
    );
  });

  it("preserves exact completed output and discards failed/cancelled partial text", async () => {
    const target = service();

    await target.service.finalizeRun(context(["ai.agent.use"]), {
      runId: RUN_ID,
      outcome: "completed",
      assistantText: "  exact streamed text\n",
    });
    expect(target.repository.completeRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        outputContentBlocks: [{
          type: "text",
          text: "  exact streamed text\n",
        }],
      }),
    );

    await target.service.finalizeRun(context(["ai.agent.use"]), {
      runId: RUN_ID,
      outcome: "failed",
      assistantText: "must not persist",
      safeErrorClass: "provider_timeout",
    });
    expect(target.repository.failRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        terminalErrorClass: "provider_timeout",
      }),
    );
    expect(target.repository.completeRun).toHaveBeenCalledTimes(1);

    await target.service.finalizeRun(context(["ai.agent.use"]), {
      runId: RUN_ID,
      outcome: "cancelled",
      assistantText: "must not persist either",
    });
    expect(target.repository.cancelRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outputContentBlocks: [] }),
    );
  });

  it("blocks legal-hold deletion before invoking the repository mutation", async () => {
    const target = service();
    target.repository.get.mockResolvedValueOnce(thread({
      retention: {
        ...thread().retention,
        legalHold: true,
      },
    }));

    await expect(target.service.deleteThread(context(), {
      threadId: THREAD_ID,
      expectedRowVersion: "1",
    })).rejects.toMatchObject({ code: "LEGAL_HOLD", status: 423 });
    expect(target.repository.softDelete).not.toHaveBeenCalled();
  });

  it("requires an explicit maintenance authority and exposes no tenant selector", async () => {
    const target = service();
    await expect(target.service.purgeEligible({})).rejects.toThrow(
      "maintenance authority is not configured",
    );

    const authority: AtlasThreadMaintenanceAuthority = {
      purgeEligible: vi.fn(async () => ({
        expiredCount: 3,
        purgedCount: 2,
      })),
    };
    const configured = service(fakeRepository(), authority);
    await expect(configured.service.purgeEligible({})).resolves.toEqual({
      expiredCount: 3,
      purgedCount: 2,
    });
    expect(authority.purgeEligible).toHaveBeenCalledWith({
      asOf: NOW,
      batchSize: 50,
    });
  });

  it("reports purge outcomes through content-free operational metrics", async () => {
    const observePurge = vi.fn();
    const observeThreadOperation = vi.fn();
    const authority: AtlasThreadMaintenanceAuthority = {
      purgeEligible: vi.fn(async () => ({ expiredCount: 1, purgedCount: 1 })),
    };
    await service(fakeRepository(), authority, { observePurge, observeThreadOperation }).service.purgeEligible({});
    expect(observePurge).toHaveBeenCalledWith({ expiredCount: 1, purgedCount: 1 });
    expect(observeThreadOperation).toHaveBeenCalledWith("purge", "success");
  });
});
