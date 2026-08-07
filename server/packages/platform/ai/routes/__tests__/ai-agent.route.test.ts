import { EventEmitter } from "node:events";
import type { RequestHandler, Router } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAiAgentRoutes } from "../ai-agent.route.js";

const mocks = vi.hoisted(() => ({
  verifyBearer: vi.fn(),
  extractVerifiedRequestContextHints: vi.fn(),
  resolveVerifiedRequestContext: vi.fn(),
  composeVerifiedRequestContext: vi.fn(),
  ensureEffectivePermissionContext: vi.fn(),
  isPlaneKey: vi.fn(),
  storeVerifiedRequestContext: vi.fn(),
}));

vi.mock("@athyper/svc-shared", () => ({
  verifyBearer: mocks.verifyBearer,
  extractVerifiedRequestContextHints: mocks.extractVerifiedRequestContextHints,
  resolveVerifiedRequestContext: mocks.resolveVerifiedRequestContext,
}));

vi.mock("@athyper/svc-iam", () => {
  class EffectivePermissionContextMismatchError extends Error {
    readonly status = 409;
    readonly code = "EFFECTIVE_PERMISSION_CONTEXT_MISMATCH";
  }

  return {
    composeVerifiedRequestContext: mocks.composeVerifiedRequestContext,
    EffectivePermissionContextMismatchError,
    ensureEffectivePermissionContext: mocks.ensureEffectivePermissionContext,
    isPlaneKey: mocks.isPlaneKey,
    storeVerifiedRequestContext: mocks.storeVerifiedRequestContext,
  };
});

const CLIENT_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const THREAD_ID = "33333333-3333-4333-8333-333333333333";
const MESSAGE_ID = "44444444-4444-4444-8444-444444444444";

const requestBody = {
  client_request_id: CLIENT_REQUEST_ID,
  plane: "neon",
  model_id: "atlas-fast",
  policy_revision: "policy-1",
  message: "Summarize the Atlas base.",
};

const resolvedIdentity = {
  tenantId: "tenant-a-id",
  tenantCode: "tenant-a",
  companyCode: "COMPANY-A",
  realmKey: "realm-a",
  principalId: "principal-1",
  subject: "subject-1",
  correlationId: "correlation-from-identity",
};

const effectivePermissions = {
  tenantId: "tenant-a-id",
  principalId: "principal-1",
  planeKey: "neon",
  authEpoch: 7,
  profileHash: "profile-hash",
  allowed: new Set(["ai.agent.use"]),
  denied: new Set<string>(),
  planLocked: new Set<string>(),
  planeExcluded: new Set<string>(),
  entries: new Map(),
  authorizationScopes: new Map(),
};

function terminalEnvelope() {
  return {
    schema_version: "1" as const,
    run_id: RUN_ID,
    thread_id: THREAD_ID,
    message_id: MESSAGE_ID,
    sequence: 0,
    client_request_id: CLIENT_REQUEST_ID,
    event: {
      type: "run.completed" as const,
      finish_reason: "stop",
      model_used: "atlas-fast",
      usage: {
        input_tokens: 12,
        output_tokens: 4,
      },
    },
  };
}

async function* terminalStream() {
  yield terminalEnvelope();
}

class FakeResponse extends EventEmitter {
  statusCode = 200;
  headersSent = false;
  writableEnded = false;
  readonly bodies: unknown[] = [];
  readonly writes: string[] = [];
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
    this.headers.set(name.toLowerCase(), String(value));
    return this;
  });

  readonly flushHeaders = vi.fn(() => {
    this.headersSent = true;
  });

  readonly write = vi.fn((chunk: unknown) => {
    this.writes.push(String(chunk));
    return true;
  });

  readonly end = vi.fn(() => {
    this.writableEnded = true;
    return this;
  });

  body(): unknown {
    return this.bodies.at(-1);
  }
}

function fakeRequest(options: {
  body?: unknown;
  plane?: string;
  authorization?: string;
  headers?: Record<string, string>;
} = {}) {
  const plane = options.plane === undefined ? "neon" : options.plane;
  return {
    body: options.body ?? requestBody,
    headers: {
      ...(options.authorization === ""
        ? {}
        : { authorization: options.authorization ?? "Bearer test" }),
      ...(plane ? { "x-plane-key": plane } : {}),
      "x-request-id": "request-1",
      "x-correlation-id": "correlation-1",
      ...options.headers,
    },
  };
}

function buildDeps(overrides: Record<string, unknown> = {}) {
  const agentRuntime = {
    available: true,
    run: vi.fn(() => terminalStream()),
  };
  const catalogResolver = {
    resolve: vi.fn(),
    resolveCatalog: vi.fn(() => ({
      default_model_id: "atlas-fast",
      policy_revision: "policy-1",
      models: [
        {
          provider_id: "atlas",
          model_id: "atlas-fast",
          display_name: "Atlas Fast",
          icon_key: "atlas",
          tier: "fast",
          status: "available",
          capabilities: {
            streaming: true,
            tools: false,
            vision: false,
            max_context_tokens: 200_000,
            max_output_tokens: 8_192,
          },
          cost: null,
        },
      ],
    })),
    hasAnyOperationalBinding: vi.fn(() => true),
  };
  const rateLimiter = {
    check: vi.fn(async () => ({
      allowed: true,
      retryAfterSeconds: 0,
    })),
  };
  const featureFlags = {
    isEnabled: vi.fn(async () => true),
  };
  const planePolicyResolver = {
    resolve: vi.fn(async (session: { plane: string }) => ({
      plane: session.plane,
      chatAllowed: true,
      persistenceAllowed: false,
      readToolsAllowed: false,
      mutationsAllowed: false,
      allowedPublicModelIds: ["atlas-fast"],
      policyRevision: `phase0:${session.plane}:chat`,
    })),
    resolveBindingPolicy: vi.fn(),
  };
  const onVerifiedContext = vi.fn();

  return {
    db: {},
    auth: { verifyToken: vi.fn() },
    agentRuntime,
    catalogResolver,
    rateLimiter,
    featureFlags,
    planePolicyResolver,
    permissionResolverRegistry: {},
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
    envEnabled: true,
    onVerifiedContext,
    ...overrides,
  };
}

function captureHandlers(deps = buildDeps()) {
  const get = vi.fn();
  const post = vi.fn();
  registerAiAgentRoutes(
    {
      get,
      post,
    } as unknown as Router,
    deps as never,
  );

  const models = get.mock.calls.find(([path]) => path === "/ai/agent/models")?.[1];
  const runs = post.mock.calls.find(([path]) => path === "/ai/agent/runs")?.[1];
  expect(models).toBeTypeOf("function");
  expect(runs).toBeTypeOf("function");
  return {
    models: models as RequestHandler,
    runs: runs as RequestHandler,
  };
}

async function invokeAndWait(
  handler: RequestHandler,
  req: ReturnType<typeof fakeRequest>,
  res = new FakeResponse(),
): Promise<FakeResponse> {
  handler(req as never, res as never, vi.fn());
  await vi.waitFor(() => {
    expect(res.writableEnded).toBe(true);
  });
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyBearer.mockResolvedValue({ sub: "subject-1" });
  mocks.extractVerifiedRequestContextHints.mockReturnValue({});
  mocks.resolveVerifiedRequestContext.mockResolvedValue({
    ok: true,
    context: resolvedIdentity,
  });
  mocks.ensureEffectivePermissionContext.mockResolvedValue(effectivePermissions);
  mocks.composeVerifiedRequestContext.mockImplementation(
    (input: { planeKey: string; requestId?: string; correlationId?: string }) => ({
      ok: true,
      context: Object.freeze({
        ...resolvedIdentity,
        ...effectivePermissions,
        planeKey: input.planeKey,
        requestId: input.requestId,
        correlationId: input.correlationId,
      }),
    }),
  );
  mocks.isPlaneKey.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Atlas agent prerequisite gates", () => {
  it("fails closed at both endpoints when the environment kill switch is off", async () => {
    const deps = buildDeps({ envEnabled: false });
    const handlers = captureHandlers(deps);

    const modelsResponse = await invokeAndWait(handlers.models, fakeRequest());
    const runResponse = await invokeAndWait(handlers.runs, fakeRequest());

    expect(modelsResponse.statusCode).toBe(404);
    expect(modelsResponse.body()).toEqual({ error: "not_found" });
    expect(runResponse.statusCode).toBe(404);
    expect(runResponse.body()).toEqual({ error: "not_found" });
    expect(mocks.verifyBearer).not.toHaveBeenCalled();
    expect(deps.agentRuntime.run).not.toHaveBeenCalled();
  });

  it("stops when bearer authentication does not establish an identity", async () => {
    mocks.verifyBearer.mockImplementationOnce(
      async (_authorization: string, _auth: unknown, res: FakeResponse) => {
        res.status(401).json({ error: "unauthorized" });
        return null;
      },
    );
    const deps = buildDeps();
    const { runs } = captureHandlers(deps);

    const res = await invokeAndWait(runs, fakeRequest());

    expect(res.statusCode).toBe(401);
    expect(mocks.resolveVerifiedRequestContext).not.toHaveBeenCalled();
    expect(deps.agentRuntime.run).not.toHaveBeenCalled();
  });

  it("fails closed when the canonical tenant/principal identity cannot be resolved", async () => {
    mocks.resolveVerifiedRequestContext.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "TENANT_CONTEXT_UNRESOLVED",
      message: "Tenant context could not be verified.",
    });
    const deps = buildDeps();
    const { runs } = captureHandlers(deps);

    const res = await invokeAndWait(runs, fakeRequest());

    expect(res.statusCode).toBe(403);
    expect(res.body()).toEqual({
      error: "TENANT_CONTEXT_UNRESOLVED",
      message: "Tenant context could not be verified.",
    });
    expect(mocks.ensureEffectivePermissionContext).not.toHaveBeenCalled();
    expect(deps.agentRuntime.run).not.toHaveBeenCalled();
  });

  it("requires an authenticated product-plane header", async () => {
    const deps = buildDeps();
    const { runs } = captureHandlers(deps);

    const res = await invokeAndWait(runs, fakeRequest({ plane: "" }));

    expect(res.statusCode).toBe(403);
    expect(res.body()).toMatchObject({ error: "PLANE_CONTEXT_REQUIRED" });
    expect(mocks.ensureEffectivePermissionContext).not.toHaveBeenCalled();
    expect(deps.agentRuntime.run).not.toHaveBeenCalled();
  });

  it("rejects an invalid product-plane header before provider invocation", async () => {
    const deps = buildDeps();
    const { runs } = captureHandlers(deps);

    const res = await invokeAndWait(runs, fakeRequest({ plane: "invalid" }));

    expect(res.statusCode).toBe(403);
    expect(res.body()).toMatchObject({ error: "PLANE_CONTEXT_REQUIRED" });
    expect(deps.planePolicyResolver.resolve).not.toHaveBeenCalled();
    expect(deps.agentRuntime.run).not.toHaveBeenCalled();
  });

  it("rejects a request body whose plane differs from the canonical plane", async () => {
    const deps = buildDeps();
    const { runs } = captureHandlers(deps);

    const res = await invokeAndWait(runs, fakeRequest({ plane: "mesh" }));

    expect(res.statusCode).toBe(400);
    expect(res.body()).toEqual({ error: "plane_context_mismatch" });
    expect(deps.rateLimiter.check).not.toHaveBeenCalled();
    expect(deps.agentRuntime.run).not.toHaveBeenCalled();
  });

  it("rejects client presentation profiles instead of treating them as policy", async () => {
    const deps = buildDeps();
    const { runs } = captureHandlers(deps);

    const res = await invokeAndWait(runs, fakeRequest({
      body: {
        ...requestBody,
        profile: {
          plane: "admin",
          tools_enabled: true,
        },
      },
    }));

    expect(res.statusCode).toBe(400);
    expect(res.body()).toMatchObject({ error: "invalid_request" });
    expect(deps.planePolicyResolver.resolve).not.toHaveBeenCalled();
    expect(deps.agentRuntime.run).not.toHaveBeenCalled();
  });

  it("rejects every Admin target-tenant header before catalog or provider access", async () => {
    for (const header of [
      "x-atlas-target-tenant-id",
      "x-support-target-tenant-id",
      "x-target-tenant-id",
    ]) {
      const deps = buildDeps();
      const { models, runs } = captureHandlers(deps);
      const request = fakeRequest({
        plane: "admin",
        body: { ...requestBody, plane: "admin" },
        headers: { [header]: "attacker-selected-tenant" },
      });

      const catalogResponse = await invokeAndWait(models, request);
      const runResponse = await invokeAndWait(runs, request);

      expect(catalogResponse.statusCode).toBe(400);
      expect(runResponse.statusCode).toBe(400);
      expect(catalogResponse.body()).toEqual({
        error: "untrusted_support_target",
      });
      expect(deps.catalogResolver.resolveCatalog).not.toHaveBeenCalled();
      expect(deps.agentRuntime.run).not.toHaveBeenCalled();
    }
  });

  it("hides Atlas when the tenant feature flag is disabled", async () => {
    const deps = buildDeps({
      featureFlags: {
        isEnabled: vi.fn(async () => false),
      },
    });
    const { models } = captureHandlers(deps);

    const res = await invokeAndWait(models, fakeRequest());

    expect(res.statusCode).toBe(404);
    expect(res.body()).toEqual({ error: "not_found" });
    expect(deps.catalogResolver.resolveCatalog).not.toHaveBeenCalled();
  });

  it.each(["mesh", "admin"] as const)(
    "hides the catalog and run when the %s plane policy is disabled",
    async (plane) => {
      const planePolicyResolver = {
        resolve: vi.fn(async () => ({
          plane,
          chatAllowed: false,
          persistenceAllowed: false,
          readToolsAllowed: false,
          mutationsAllowed: false,
          allowedPublicModelIds: [],
          policyRevision: `phase0:${plane}:disabled`,
          reasonCode: "plane_not_enabled",
        })),
        resolveBindingPolicy: vi.fn(),
      };
      const deps = buildDeps({ planePolicyResolver });
      const { models, runs } = captureHandlers(deps);
      const request = fakeRequest({
        body: { ...requestBody, plane },
        plane,
      });

      const modelsResponse = await invokeAndWait(models, request);
      const runResponse = await invokeAndWait(runs, request);

      expect(modelsResponse.statusCode).toBe(404);
      expect(runResponse.statusCode).toBe(404);
      expect(deps.catalogResolver.resolveCatalog).not.toHaveBeenCalled();
      expect(deps.agentRuntime.run).not.toHaveBeenCalled();
      expect(planePolicyResolver.resolve).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    {
      reason: "explicitly denied",
      permissions: {
        ...effectivePermissions,
        allowed: new Set<string>(),
        denied: new Set(["ai.agent.use"]),
      },
    },
    {
      reason: "not granted",
      permissions: {
        ...effectivePermissions,
        allowed: new Set<string>(),
      },
    },
    {
      reason: "locked by plan",
      permissions: {
        ...effectivePermissions,
        allowed: new Set(["ai.agent.use"]),
        planLocked: new Set(["ai.agent.use"]),
      },
    },
    {
      reason: "excluded from the plane",
      permissions: {
        ...effectivePermissions,
        allowed: new Set(["ai.agent.use"]),
        planeExcluded: new Set(["ai.agent.use"]),
      },
    },
  ])(
    "does not store or forward context when ai.agent.use is $reason",
    async ({ permissions }) => {
      mocks.ensureEffectivePermissionContext.mockResolvedValueOnce(permissions);
      const deps = buildDeps();
      const { runs } = captureHandlers(deps);

      const res = await invokeAndWait(runs, fakeRequest());

      expect(res.statusCode).toBe(403);
      expect(res.body()).toEqual({ error: "permission_denied" });
      expect(mocks.storeVerifiedRequestContext).not.toHaveBeenCalled();
      expect(deps.onVerifiedContext).not.toHaveBeenCalled();
      expect(deps.agentRuntime.run).not.toHaveBeenCalled();
    },
  );

  it("returns a truthful unavailable response when no provider binding is eligible", async () => {
    const agentRuntime = {
      available: false,
      run: vi.fn(() => terminalStream()),
    };
    const deps = buildDeps({ agentRuntime });
    const { runs } = captureHandlers(deps);

    const res = await invokeAndWait(runs, fakeRequest());

    expect(res.statusCode).toBe(503);
    expect(res.body()).toEqual({ error: "atlas_agent_provider_unavailable" });
    expect(deps.rateLimiter.check).not.toHaveBeenCalled();
    expect(agentRuntime.run).not.toHaveBeenCalled();
  });

  it.each(["user", "tenant"] as const)(
    "returns Retry-After for a %s-scoped rate limit",
    async (scope) => {
      const rateLimiter = {
        check: vi.fn(async () => ({
          allowed: false,
          retryAfterSeconds: 37,
          scope,
        })),
      };
      const deps = buildDeps({ rateLimiter });
      const { runs } = captureHandlers(deps);

      const res = await invokeAndWait(runs, fakeRequest());

      expect(res.statusCode).toBe(429);
      expect(res.body()).toEqual({ error: "rate_limited", scope });
      expect(res.headers.get("retry-after")).toBe("37");
      expect(rateLimiter.check).toHaveBeenCalledWith({
        tenantId: "tenant-a-id",
        principalId: "principal-1",
      });
      expect(deps.agentRuntime.run).not.toHaveBeenCalled();
    },
  );
});

describe("Atlas agent catalog and verified execution context", () => {
  it("uses the injected effective catalog resolver with the canonical request session", async () => {
    const deps = buildDeps();
    const { models } = captureHandlers(deps);

    const res = await invokeAndWait(models, fakeRequest());
    const canonicalContext = deps.onVerifiedContext.mock.calls[0]?.[0];

    expect(res.statusCode).toBe(200);
    expect(deps.catalogResolver.resolveCatalog).toHaveBeenCalledOnce();
    expect(deps.planePolicyResolver.resolve).toHaveBeenCalledWith({
      tenantId: "tenant-a-id",
      principalId: "principal-1",
      plane: "neon",
      verifiedRequestContext: canonicalContext,
    });
    expect(deps.catalogResolver.resolveCatalog).toHaveBeenCalledWith({
      tenantId: "tenant-a-id",
      principalId: "principal-1",
      plane: "neon",
      verifiedRequestContext: canonicalContext,
    });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toBe(
      "Authorization, X-Tenant-Id, X-Plane-Key",
    );
    expect(res.body()).toMatchObject({
      default_model_id: "atlas-fast",
      policy_revision: "policy-1",
    });
  });

  it("supplies the same canonical session to the shared catalog and run resolver", async () => {
    const deps = buildDeps();
    deps.catalogResolver.resolve.mockReturnValue({
      catalog: {
        default_model_id: "atlas-fast",
        policy_revision: "policy-1",
        models: [],
      },
      bindings: [],
      policyRevision: "policy-1",
    });
    deps.agentRuntime.run.mockImplementation(
      (_request: unknown, context: {
        tenantId: string;
        principalId: string;
        plane: string;
      }) => {
        deps.catalogResolver.resolve(context);
        return terminalStream();
      },
    );
    const { models, runs } = captureHandlers(deps);

    await invokeAndWait(models, fakeRequest());
    await invokeAndWait(runs, fakeRequest());

    const session = {
      tenantId: "tenant-a-id",
      principalId: "principal-1",
      plane: "neon",
    };
    expect(deps.catalogResolver.resolveCatalog).toHaveBeenCalledWith({
      ...session,
      verifiedRequestContext: expect.any(Object),
    });
    expect(deps.catalogResolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining(session),
    );
  });

  it("passes the exact immutable VerifiedRequestContext reference into AgentRuntime", async () => {
    const exactContext = Object.freeze({
      ...resolvedIdentity,
      ...effectivePermissions,
      planeKey: "neon",
      requestId: "request-1",
      correlationId: "correlation-1",
    });
    mocks.composeVerifiedRequestContext.mockReturnValueOnce({
      ok: true,
      context: exactContext,
    });
    const deps = buildDeps();
    const { runs } = captureHandlers(deps);

    await invokeAndWait(runs, fakeRequest());

    expect(mocks.storeVerifiedRequestContext).toHaveBeenCalledWith(
      expect.any(FakeResponse),
      exactContext,
    );
    expect(deps.onVerifiedContext).toHaveBeenCalledWith(exactContext);
    expect(deps.agentRuntime.run).toHaveBeenCalledOnce();
    const [parsedRequest, runtimeContext, signal] =
      deps.agentRuntime.run.mock.calls[0] as unknown as [
        Record<string, unknown>,
        {
          tenantId: string;
          principalId: string;
          plane: string;
          verifiedRequestContext: unknown;
        },
        AbortSignal,
      ];
    expect(parsedRequest).toMatchObject({
      model_id: "atlas-fast",
      policy_revision: "policy-1",
      history: [],
    });
    expect(runtimeContext).toMatchObject({
      tenantId: "tenant-a-id",
      principalId: "principal-1",
      plane: "neon",
    });
    expect(runtimeContext.verifiedRequestContext).toBe(exactContext);
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("enables governed tools only when both environment and tenant gates allow them", async () => {
    const featureFlags = {
      isEnabled: vi.fn(async (code: string) =>
        code === "atlas_agent_enabled"
        || code === "atlas_conversation_persistence_enabled"
        || code === "atlas_agent_tools_enabled"),
    };
    const deps = buildDeps({
      persistenceEnvEnabled: true,
      toolsEnvEnabled: true,
      featureFlags,
      planePolicyResolver: {
        resolve: vi.fn(async () => ({
          plane: "neon",
          chatAllowed: true,
          persistenceAllowed: true,
          readToolsAllowed: true,
          mutationsAllowed: false,
          allowedPublicModelIds: ["atlas-fast"],
          policyRevision: "phase0-test-tools",
        })),
        resolveBindingPolicy: vi.fn(),
      },
    });
    const { runs } = captureHandlers(deps);

    await invokeAndWait(runs, fakeRequest());

    const runtimeContext = deps.agentRuntime.run.mock.calls[0]?.[1] as {
      toolExecutionEnabled?: boolean;
    };
    expect(runtimeContext.toolExecutionEnabled).toBe(true);
    expect(featureFlags.isEnabled).toHaveBeenCalledWith(
      "atlas_agent_tools_enabled",
      "tenant-a-id",
    );
  });

  it("does not resolve the tenant tool gate while the environment gate is off", async () => {
    const featureFlags = {
      isEnabled: vi.fn(async (code: string) => code === "atlas_agent_enabled"),
    };
    const deps = buildDeps({
      toolsEnvEnabled: false,
      featureFlags,
    });
    const { runs } = captureHandlers(deps);

    await invokeAndWait(runs, fakeRequest());

    const runtimeContext = deps.agentRuntime.run.mock.calls[0]?.[1] as {
      toolExecutionEnabled?: boolean;
    };
    expect(runtimeContext.toolExecutionEnabled).toBe(false);
    expect(featureFlags.isEnabled).not.toHaveBeenCalledWith(
      "atlas_agent_tools_enabled",
      expect.any(String),
    );
  });
});

describe("Atlas agent SSE lifecycle", () => {
  it("aborts the runtime signal when the client disconnects", async () => {
    let runtimeSignal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const agentRuntime = {
      available: true,
      run: vi.fn(
        (
          _request: unknown,
          _context: unknown,
          signal: AbortSignal,
        ): AsyncIterable<ReturnType<typeof terminalEnvelope>> => ({
          async *[Symbol.asyncIterator]() {
            runtimeSignal = signal;
            markStarted?.();
            await new Promise<void>((resolve) => {
              if (signal.aborted) resolve();
              else signal.addEventListener("abort", () => resolve(), { once: true });
            });
          },
        }),
      ),
    };
    const deps = buildDeps({ agentRuntime });
    const { runs } = captureHandlers(deps);
    const res = new FakeResponse();

    runs(fakeRequest() as never, res as never, vi.fn());
    await started;
    res.emit("close");
    await vi.waitFor(() => {
      expect(res.writableEnded).toBe(true);
    });

    expect(runtimeSignal?.aborted).toBe(true);
    expect(runtimeSignal?.reason).toBeInstanceOf(Error);
    expect((runtimeSignal?.reason as Error).message).toBe("client_disconnected");
    expect(res.writes).toEqual([]);
  });

  it("writes heartbeat comments while open, serializes a terminal event, and closes", async () => {
    let heartbeat: (() => void) | undefined;
    const setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation(((handler: () => void) => {
        heartbeat = handler;
        return 99 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval);
    const clearIntervalSpy = vi
      .spyOn(globalThis, "clearInterval")
      .mockImplementation(() => undefined);

    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const agentRuntime = {
      available: true,
      run: vi.fn((): AsyncIterable<ReturnType<typeof terminalEnvelope>> => ({
        async *[Symbol.asyncIterator]() {
          await gate;
          yield terminalEnvelope();
        },
      })),
    };
    const deps = buildDeps({ agentRuntime });
    const { runs } = captureHandlers(deps);
    const res = new FakeResponse();

    runs(fakeRequest() as never, res as never, vi.fn());
    await vi.waitFor(() => {
      expect(agentRuntime.run).toHaveBeenCalledOnce();
      expect(heartbeat).toBeTypeOf("function");
    });

    heartbeat?.();
    expect(res.writes).toContain(": heartbeat\n\n");

    release?.();
    await vi.waitFor(() => {
      expect(res.writableEnded).toBe(true);
    });

    expect(res.writes.some((chunk) => chunk.includes("event: run.completed"))).toBe(true);
    expect(res.writes.some((chunk) => chunk.includes(`"run_id":"${RUN_ID}"`))).toBe(true);
    expect(res.end).toHaveBeenCalledOnce();
    expect(clearIntervalSpy).toHaveBeenCalledWith(99);
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
