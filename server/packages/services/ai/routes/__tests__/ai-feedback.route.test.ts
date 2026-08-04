import type { RequestHandler, Router } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAiRoutes } from "../ai.route.js";

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  extractOrgHeaders: vi.fn(),
  requireAllow: vi.fn(),
  resolvePrincipalIdOrNull: vi.fn(),
  resolveTenantId: vi.fn(),
  verifyBearer: vi.fn(),
}));

vi.mock("@athyper/svc-iam", () => ({
  checkPermission: mocks.checkPermission,
  requireAllow: mocks.requireAllow,
}));

vi.mock("@athyper/svc-shared", () => ({
  extractOrgHeaders: mocks.extractOrgHeaders,
  resolvePrincipalIdOrNull: mocks.resolvePrincipalIdOrNull,
  resolveTenantId: mocks.resolveTenantId,
  verifyBearer: mocks.verifyBearer,
}));

const TENANT_ID = "tenant-1";
const PRINCIPAL_ID = "principal-1";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_RUN_ID = "33333333-3333-4333-8333-333333333333";
const MESSAGE_ID = "44444444-4444-4444-8444-444444444444";

const atlasFeedbackBody = {
  feedback_type: "atlas_agent",
  target_id: RUN_ID,
  verdict: "correct",
  detail: {
    agent_run_id: RUN_ID,
    message_id: MESSAGE_ID,
  },
};

class FakeResponse {
  statusCode = 200;
  writableEnded = false;
  readonly bodies: unknown[] = [];

  readonly status = vi.fn((code: number) => {
    this.statusCode = code;
    return this;
  });

  readonly json = vi.fn((body: unknown) => {
    this.bodies.push(body);
    this.writableEnded = true;
    return this;
  });

  body(): unknown {
    return this.bodies.at(-1);
  }
}

function createDb(ownedRun: { id: string } | undefined) {
  const executeTakeFirst = vi.fn(async () => ownedRun);
  const where = vi.fn();
  const query = {
    select: vi.fn(),
    where,
    executeTakeFirst,
  };
  query.select.mockReturnValue(query);
  where.mockReturnValue(query);

  const selectFrom = vi.fn(() => query);
  return {
    db: { selectFrom },
    executeTakeFirst,
    selectFrom,
    where,
  };
}

function buildDeps(options: {
  ownedRun?: { id: string } | undefined;
} = {}) {
  const database = createDb(
    Object.prototype.hasOwnProperty.call(options, "ownedRun")
      ? options.ownedRun
      : { id: RUN_ID },
  );
  const feedbackLogWriter = {
    write: vi.fn(async () => undefined),
  };

  return {
    deps: {
      db: database.db,
      auth: { verifyToken: vi.fn() },
      aiRuntime: { runAction: vi.fn() },
      autonomyResolver: {
        resolve: vi.fn(),
        upsert: vi.fn(),
      },
      confidenceResolver: {
        resolve: vi.fn(),
        upsert: vi.fn(),
      },
      feedbackLogWriter,
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      },
    },
    feedbackLogWriter,
    ...database,
  };
}

function captureFeedbackHandler(deps: ReturnType<typeof buildDeps>["deps"]) {
  const get = vi.fn();
  const post = vi.fn();
  const put = vi.fn();

  registerAiRoutes(
    { get, post, put } as unknown as Router,
    deps as never,
  );

  const handler = post.mock.calls.find(
    ([path]) => path === "/ai/feedback",
  )?.[1];
  expect(handler).toBeTypeOf("function");
  return handler as RequestHandler;
}

async function invoke(
  handler: RequestHandler,
  body: unknown,
): Promise<FakeResponse> {
  const res = new FakeResponse();
  handler(
    {
      body,
      headers: {
        authorization: "Bearer test-token",
        "x-org": "tenant-code",
        "x-realm": "realm-1",
      },
    } as never,
    res as never,
    vi.fn(),
  );
  await vi.waitFor(() => {
    expect(res.writableEnded).toBe(true);
  });
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyBearer.mockResolvedValue({ sub: "subject-1" });
  mocks.extractOrgHeaders.mockReturnValue({
    xOrg: "tenant-code",
    xRealm: "realm-1",
  });
  mocks.resolveTenantId.mockResolvedValue(TENANT_ID);
  mocks.resolvePrincipalIdOrNull.mockResolvedValue(PRINCIPAL_ID);
  mocks.checkPermission.mockResolvedValue({ decision: "allow" });
  mocks.requireAllow.mockReturnValue(true);
});

describe("POST /ai/feedback Atlas Agent feedback", () => {
  it("requires the Atlas feedback permission and verifies run ownership before writing", async () => {
    const fixture = buildDeps();
    const handler = captureFeedbackHandler(fixture.deps);

    const res = await invoke(handler, atlasFeedbackBody);

    expect(res.statusCode).toBe(201);
    expect(res.body()).toEqual({ ok: true });
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      fixture.db,
      TENANT_ID,
      PRINCIPAL_ID,
      "ai.agent.feedback.submit",
    );
    expect(fixture.selectFrom).toHaveBeenCalledWith("ai.ai_agent_run");
    expect(fixture.where.mock.calls).toEqual([
      ["tenant_id", "=", TENANT_ID],
      ["principal_id", "=", PRINCIPAL_ID],
      ["id", "=", RUN_ID],
      ["response_message_id", "=", MESSAGE_ID],
    ]);
    expect(fixture.executeTakeFirst).toHaveBeenCalledOnce();
    expect(fixture.feedbackLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        principalId: PRINCIPAL_ID,
        feedbackType: "atlas_agent",
        targetId: RUN_ID,
        verdict: "correct",
        detail: {
          agent_run_id: RUN_ID,
          message_id: MESSAGE_ID,
        },
      }),
    );
  });

  it("fails closed when ai.agent.feedback.submit is denied", async () => {
    mocks.checkPermission.mockResolvedValueOnce({ decision: "deny" });
    mocks.requireAllow.mockImplementationOnce(
      (_result: unknown, res: FakeResponse) => {
        res.status(403).json({ error: "permission_denied" });
        return false;
      },
    );
    const fixture = buildDeps();
    const handler = captureFeedbackHandler(fixture.deps);

    const res = await invoke(handler, atlasFeedbackBody);

    expect(res.statusCode).toBe(403);
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      fixture.db,
      TENANT_ID,
      PRINCIPAL_ID,
      "ai.agent.feedback.submit",
    );
    expect(fixture.selectFrom).not.toHaveBeenCalled();
    expect(fixture.feedbackLogWriter.write).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "detail is missing",
      body: {
        ...atlasFeedbackBody,
        detail: undefined,
      },
    },
    {
      name: "detail contains an unrecognized field",
      body: {
        ...atlasFeedbackBody,
        detail: {
          ...atlasFeedbackBody.detail,
          provider_id: "anthropic",
        },
      },
    },
    {
      name: "generic evidence content is supplied",
      body: {
        ...atlasFeedbackBody,
        evidence_snapshot: {
          prompt: "must never enter the Atlas operational feedback log",
        },
      },
    },
    {
      name: "message_id is not a UUID",
      body: {
        ...atlasFeedbackBody,
        detail: {
          ...atlasFeedbackBody.detail,
          message_id: "message-1",
        },
      },
    },
    {
      name: "target_id does not match agent_run_id",
      body: {
        ...atlasFeedbackBody,
        target_id: OTHER_RUN_ID,
      },
    },
    {
      name: "target_id is missing",
      body: {
        feedback_type: "atlas_agent",
        verdict: "correct",
        detail: atlasFeedbackBody.detail,
      },
    },
  ])("rejects Atlas feedback when $name", async ({ body }) => {
    const fixture = buildDeps();
    const handler = captureFeedbackHandler(fixture.deps);

    const res = await invoke(handler, body);

    expect(res.statusCode).toBe(400);
    expect(res.body()).toEqual({
      error: "invalid_atlas_agent_feedback_target",
    });
    expect(fixture.selectFrom).not.toHaveBeenCalled();
    expect(fixture.feedbackLogWriter.write).not.toHaveBeenCalled();
  });

  it("returns 404 without disclosing whether a foreign or missing run exists", async () => {
    const fixture = buildDeps({ ownedRun: undefined });
    const handler = captureFeedbackHandler(fixture.deps);

    const res = await invoke(handler, atlasFeedbackBody);

    expect(res.statusCode).toBe(404);
    expect(res.body()).toEqual({ error: "atlas_agent_run_not_found" });
    expect(fixture.where.mock.calls).toEqual([
      ["tenant_id", "=", TENANT_ID],
      ["principal_id", "=", PRINCIPAL_ID],
      ["id", "=", RUN_ID],
      ["response_message_id", "=", MESSAGE_ID],
    ]);
    expect(fixture.feedbackLogWriter.write).not.toHaveBeenCalled();
  });
});

describe("POST /ai/feedback legacy feedback", () => {
  it("continues to require ai.review_ai_output without querying agent runs", async () => {
    const fixture = buildDeps();
    const handler = captureFeedbackHandler(fixture.deps);
    const legacyBody = {
      feedback_type: "classification",
      target_id: RUN_ID,
      verdict: "partial",
      detail: {
        corrected_label: "invoice",
      },
    };

    const res = await invoke(handler, legacyBody);

    expect(res.statusCode).toBe(201);
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      fixture.db,
      TENANT_ID,
      PRINCIPAL_ID,
      "ai.review_ai_output",
    );
    expect(fixture.selectFrom).not.toHaveBeenCalled();
    expect(fixture.feedbackLogWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        feedbackType: "classification",
        targetId: RUN_ID,
        verdict: "partial",
      }),
    );
  });
});
