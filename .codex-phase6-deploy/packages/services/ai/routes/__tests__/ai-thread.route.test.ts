import { EventEmitter } from "node:events";
import type { RequestHandler, Router } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAgentPlaneAdmission: vi.fn(),
  resolveAgentRequestContext: vi.fn(),
}));

vi.mock("../ai-agent.route.js", () => ({
  resolveAgentPlaneAdmission: mocks.resolveAgentPlaneAdmission,
  resolveAgentRequestContext: mocks.resolveAgentRequestContext,
}));

import { registerAiThreadRoutes } from "../ai-thread.route.js";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL_ID = "20000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const RUN_ID = "40000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "50000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-23T10:00:00.000Z");

class FakeResponse extends EventEmitter {
  statusCode = 200;
  headersSent = false;
  writableEnded = false;
  readonly bodies: unknown[] = [];
  readonly headers = new Map<string, string>();

  readonly status = vi.fn((code: number) => {
    this.statusCode = code;
    return this;
  });

  readonly json = vi.fn((body: unknown) => {
    this.bodies.push(body);
    this.headersSent = true;
    this.writableEnded = true;
    return this;
  });

  readonly setHeader = vi.fn((name: string, value: string) => {
    this.headers.set(name.toLowerCase(), value);
    return this;
  });

  readonly end = vi.fn(() => {
    this.headersSent = true;
    this.writableEnded = true;
    return this;
  });

  body(): unknown {
    return this.bodies.at(-1);
  }
}

function storedThread() {
  return {
    threadId: THREAD_ID,
    tenantId: TENANT_ID,
    plane: "neon" as const,
    ownerPrincipalId: PRINCIPAL_ID,
    title: null,
    status: "active" as const,
    rowVersion: "7",
    lastMessageSequence: "9007199254740993",
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
      participantRole: "owner" as const,
      owner: true,
    },
  };
}

function storedMessage() {
  return {
    messageId: MESSAGE_ID,
    threadId: THREAD_ID,
    plane: "neon" as const,
    sequence: "9007199254740993",
    role: "assistant" as const,
    status: "completed" as const,
    contentBlocks: [{ type: "text", text: " exact\ntext " }],
    runId: RUN_ID,
    parentMessageId: null,
    resultCards: [],
    citationRefs: [],
    toolRefs: [],
    terminalErrorClass: null,
    createdAt: NOW,
    terminalAt: NOW,
  };
}

function buildDeps(overrides: Record<string, unknown> = {}) {
  const threadService = {
    createThread: vi.fn(async () => storedThread()),
    listThreads: vi.fn(async () => ({
      items: [storedThread()],
      nextCursor: null,
    })),
    getThread: vi.fn(async () => storedThread()),
    listMessages: vi.fn(async () => ({
      items: [storedMessage()],
      nextCursor: null,
    })),
    exportTranscript: vi.fn(async () => ({
      format: "atlas-thread-transcript/v1" as const,
      exportedAt: NOW,
      thread: storedThread(),
      messages: [storedMessage()],
    })),
    renameThread: vi.fn(async () => ({
      ...storedThread(),
      title: "Renamed",
      rowVersion: "8",
      updatedAt: new Date("2026-07-23T10:01:00.000Z"),
    })),
    archiveThread: vi.fn(async () => ({
      ...storedThread(),
      status: "archived" as const,
      rowVersion: "8",
    })),
    deleteThread: vi.fn(async () => undefined),
    getEffectiveRetentionPolicy: vi.fn(async () => ({
      policyId: "atlas-tenant-test-r3-14d-v1",
      retentionDays: 14,
      expiresAt: new Date("2026-08-06T10:00:00.000Z"),
      displayText:
        "Atlas conversations are retained for 14 days under atlas-tenant-test-r3-14d-v1; legal holds suspend expiry and purge.",
    })),
  };
  return {
    db: {},
    auth: { verifyToken: vi.fn() },
    featureFlags: {
      isEnabled: vi.fn(async (code: string) =>
        code === "atlas_conversation_persistence_enabled"
        || code === "atlas_agent_enabled"),
    },
    planePolicyResolver: {
      resolve: vi.fn(async () => ({
        plane: "neon",
        chatAllowed: true,
        persistenceAllowed: true,
        readToolsAllowed: false,
        mutationsAllowed: false,
        allowedPublicModelIds: ["atlas-fast"],
        policyRevision: "thread-test-policy",
      })),
      resolveBindingPolicy: vi.fn(),
    },
    permissionResolverRegistry: {},
    envEnabled: true,
    persistenceEnvEnabled: true,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    metrics: {
      writeFailed: vi.fn(),
      recordAgentThreadOperation: vi.fn(),
    },
    threadService,
    ...overrides,
  };
}

function captureHandlers(deps = buildDeps()) {
  const handlers = new Map<string, RequestHandler>();
  const router = {
    post: vi.fn((path: string, handler: RequestHandler) => {
      handlers.set(`POST ${path}`, handler);
    }),
    get: vi.fn((path: string, handler: RequestHandler) => {
      handlers.set(`GET ${path}`, handler);
    }),
    patch: vi.fn((path: string, handler: RequestHandler) => {
      handlers.set(`PATCH ${path}`, handler);
    }),
    delete: vi.fn((path: string, handler: RequestHandler) => {
      handlers.set(`DELETE ${path}`, handler);
    }),
  };
  registerAiThreadRoutes(router as unknown as Router, deps as never);
  return { handlers, deps, router };
}

function request(input: {
  body?: unknown;
  query?: Record<string, string>;
  params?: Record<string, string>;
  ifMatch?: string;
} = {}) {
  return {
    body: input.body ?? {},
    query: input.query ?? {},
    params: input.params ?? {},
    headers: {
      authorization: "Bearer test",
      "x-plane-key": "neon",
      ...(input.ifMatch ? { "if-match": input.ifMatch } : {}),
    },
  };
}

async function invoke(
  handler: RequestHandler,
  req: ReturnType<typeof request>,
): Promise<FakeResponse> {
  const res = new FakeResponse();
  handler(req as never, res as never, vi.fn());
  await vi.waitFor(() => expect(res.writableEnded).toBe(true));
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAgentRequestContext.mockResolvedValue({
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    planeKey: "neon",
  });
  mocks.resolveAgentPlaneAdmission.mockResolvedValue({
    plane: "neon",
    chatAllowed: true,
    persistenceAllowed: true,
    readToolsAllowed: false,
    mutationsAllowed: false,
    allowedPublicModelIds: ["atlas-fast"],
    policyRevision: "thread-test-policy",
  });
});

describe("Atlas thread routes", () => {
  it("registers only secured history CRUD and the authenticated export route", () => {
    const { handlers } = captureHandlers();

    expect([...handlers.keys()].sort()).toEqual([
      "DELETE /ai/agent/threads/:threadId",
      "GET /ai/agent/threads",
      "GET /ai/agent/threads/:threadId",
      "GET /ai/agent/threads/:threadId/export",
      "GET /ai/agent/threads/:threadId/messages",
      "PATCH /ai/agent/threads/:threadId",
      "POST /ai/agent/threads",
    ]);
  });

  it("exports a private, portable transcript only after persistence authorization", async () => {
    const target = captureHandlers();
    const handler = target.handlers.get("GET /ai/agent/threads/:threadId/export")!;

    const res = await invoke(handler, request({ params: { threadId: THREAD_ID } }));

    expect(res.statusCode).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-disposition")).toContain(THREAD_ID);
    expect(res.body()).toMatchObject({
      format: "atlas-thread-transcript/v1",
      thread: { thread_id: THREAD_ID },
      messages: [{ message_id: MESSAGE_ID, content_blocks: [{ type: "text", text: " exact\ntext " }] }],
    });
    expect(target.deps.threadService.exportTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
      THREAD_ID,
    );
  });

  it("fails closed before identity resolution when environment persistence is off", async () => {
    const target = captureHandlers(buildDeps({ persistenceEnvEnabled: false }));
    const handler = target.handlers.get("GET /ai/agent/threads")!;

    const res = await invoke(handler, request());

    expect(res.statusCode).toBe(404);
    expect(mocks.resolveAgentRequestContext).not.toHaveBeenCalled();
    expect(target.deps.threadService.listThreads).not.toHaveBeenCalled();
  });

  it("also fails closed when the tenant-effective persistence flag is off", async () => {
    const featureFlags = { isEnabled: vi.fn(async () => false) };
    const target = captureHandlers(buildDeps({ featureFlags }));
    const handler = target.handlers.get("GET /ai/agent/threads")!;

    const res = await invoke(handler, request());

    expect(res.statusCode).toBe(404);
    expect(target.deps.threadService.listThreads).not.toHaveBeenCalled();
  });

  it("creates a wrapped thread using only authenticated plane context", async () => {
    const target = captureHandlers();
    const handler = target.handlers.get("POST /ai/agent/threads")!;

    const res = await invoke(handler, request({
      body: { title: "My thread" },
    }));

    expect(res.statusCode).toBe(201);
    expect(res.headers.get("etag")).toBe('"7"');
    expect(res.body()).toEqual({
      thread: {
        thread_id: THREAD_ID,
        plane: "neon",
        title: "Untitled conversation",
        status: "active",
        message_count: "9007199254740993",
        row_version: "7",
        retention: {
          policy_id: "atlas-default-30d-v1",
          expires_at: "2026-08-22T10:00:00.000Z",
          purge_after: null,
          legal_hold: false,
          display_text:
            "This conversation is retained until 2026-08-22T10:00:00.000Z under atlas-default-30d-v1.",
        },
        created_at: "2026-07-23T10:00:00.000Z",
        updated_at: "2026-07-23T10:00:00.000Z",
      },
    });
    expect(target.deps.threadService.createThread).toHaveBeenCalledWith(
      expect.objectContaining({ planeKey: "neon" }),
      { title: "My thread" },
    );
  });

  it("returns effective tenant retention copy even when a list is empty", async () => {
    const target = captureHandlers();
    target.deps.threadService.listThreads.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });
    const handler = target.handlers.get("GET /ai/agent/threads")!;

    const res = await invoke(handler, request());

    expect(res.body()).toEqual({
      items: [],
      next_cursor: null,
      retention_notice:
        "Atlas conversations are retained for 14 days under atlas-tenant-test-r3-14d-v1; legal holds suspend expiry and purge.",
      retention_policy: {
        policy_id: "atlas-tenant-test-r3-14d-v1",
        retention_days: 14,
      },
    });
    expect(target.deps.threadService.getEffectiveRetentionPolicy)
      .toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID }));
    expect(target.deps.metrics.recordAgentThreadOperation).toHaveBeenCalledWith({
      operation: "list",
      outcome: "success",
    });
  });

  it("keeps bigint sequence strings and maps completed storage status to complete", async () => {
    const target = captureHandlers();
    const handler =
      target.handlers.get("GET /ai/agent/threads/:threadId/messages")!;

    const res = await invoke(handler, request({
      params: { threadId: THREAD_ID },
    }));

    expect(res.body()).toEqual({
      items: [{
        message_id: MESSAGE_ID,
        thread_id: THREAD_ID,
        sequence: "9007199254740993",
        role: "assistant",
        content: " exact\ntext ",
        result_cards: [],
        status: "complete",
        run_id: RUN_ID,
        parent_message_id: null,
        created_at: "2026-07-23T10:00:00.000Z",
        terminal_at: "2026-07-23T10:00:00.000Z",
      }],
      next_cursor: null,
    });
  });

  it("requires a quoted If-Match row version and never accepts a delete body", async () => {
    const target = captureHandlers();
    const handler = target.handlers.get("DELETE /ai/agent/threads/:threadId")!;

    const missing = await invoke(handler, request({
      params: { threadId: THREAD_ID },
      body: { row_version: "7" },
    }));
    expect(missing.statusCode).toBe(428);
    expect(target.deps.threadService.deleteThread).not.toHaveBeenCalled();

    const accepted = await invoke(handler, request({
      params: { threadId: THREAD_ID },
      ifMatch: '"7"',
    }));
    expect(accepted.statusCode).toBe(204);
    expect(target.deps.threadService.deleteThread).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
      {
        threadId: THREAD_ID,
        expectedRowVersion: "7",
      },
    );
  });

  it("rejects ambiguous rename-and-archive PATCH bodies", async () => {
    const target = captureHandlers();
    const handler = target.handlers.get("PATCH /ai/agent/threads/:threadId")!;

    const res = await invoke(handler, request({
      params: { threadId: THREAD_ID },
      body: {
        row_version: "7",
        title: "Renamed",
        status: "archived",
      },
    }));

    expect(res.statusCode).toBe(400);
    expect(target.deps.threadService.renameThread).not.toHaveBeenCalled();
    expect(target.deps.threadService.archiveThread).not.toHaveBeenCalled();
  });
});
