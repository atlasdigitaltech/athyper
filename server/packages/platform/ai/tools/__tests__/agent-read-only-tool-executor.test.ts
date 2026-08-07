import type { VerifiedRequestContext } from "@athyper/svc-iam";
import { describe, expect, it, vi } from "vitest";
import {
  AgentReadOnlyToolExecutor,
} from "../agent-read-only-tool-executor.js";
import {
  AtlasToolRegistry,
  CapabilityRegistryToolImplementationBindingAdapter,
} from "../atlas-tool-registry.js";
import {
  ATLAS_CATALOG_HELP_TOOL_NAME,
  ATLAS_TOOL_READ_ACTION,
  ATLAS_TOOL_READ_PERMISSION,
  atlasCatalogHelpManifest,
  atlasCatalogHelpRegistration,
} from "../catalog-help.tool.js";
import { AtlasToolExecutionError } from "../atlas-tool.types.js";
import type {
  AtlasJsonValue,
  AtlasReadOnlyToolHandler,
  AtlasToolExecutionInput,
  AtlasToolExecutionRecorder,
  AtlasToolGateway,
  AtlasToolManifestV1,
  AtlasToolPolicyDecision,
  AtlasToolRegistration,
} from "../atlas-tool.types.js";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "10000000-0000-4000-8000-000000000002";
const PRINCIPAL_ID = "20000000-0000-4000-8000-000000000001";
const RUN_ID = "30000000-0000-4000-8000-000000000001";
const THREAD_ID = "40000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-24T10:00:00.000Z");

function verifiedContext(
  permissions: readonly string[] = [ATLAS_TOOL_READ_PERMISSION],
  overrides: Partial<VerifiedRequestContext> = {},
): VerifiedRequestContext {
  const allowed = new Set(permissions);
  const permissionContext = {
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    planeKey: "neon" as const,
    principalFingerprint: "principal-v1",
    allowed,
    denied: new Set<string>(),
    planLocked: new Set<string>(),
    planeExcluded: new Set<string>(),
    entries: new Map(),
    authorizationScopes: new Map(),
    profileHash: "profile-v1",
    schemaHash: "schema-v1",
    resolvedAt: NOW.getTime(),
  };
  return {
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    planeKey: "neon",
    realmKey: "athyper",
    requestId: "request-1",
    authEpoch: 7,
    profileHash: "profile-v1",
    permissions: permissionContext,
    ...overrides,
  };
}

function invocation(
  overrides: Partial<AtlasToolExecutionInput> = {},
): AtlasToolExecutionInput {
  return {
    runId: RUN_ID,
    threadId: THREAD_ID,
    callId: "call-1",
    toolName: ATLAS_CATALOG_HELP_TOOL_NAME,
    input: { topic: "overview" },
    runtimeDisposition: "described",
    ...overrides,
  };
}

function allowedPolicy(
  overrides: Partial<AtlasToolPolicyDecision> = {},
): AtlasToolPolicyDecision {
  return {
    allowed: true,
    riskCeiling: "low",
    policyRevision: "policy-v1",
    policySnapshot: {
      autonomyLevel: "auto",
      requiresHumanConfirmation: false,
      confidenceThreshold: 0,
    },
    ...overrides,
  };
}

function recorder() {
  return {
    propose: vi.fn(async () => undefined),
    markExecuting: vi.fn(async () => undefined),
    finalize: vi.fn(async () => undefined),
  } satisfies AtlasToolExecutionRecorder;
}

interface TargetOptions {
  readonly manifest?: AtlasToolManifestV1;
  readonly status?: "enabled" | "disabled";
  readonly handler?: AtlasReadOnlyToolHandler;
  readonly featureEnabled?: boolean;
  readonly policyDecision?: AtlasToolPolicyDecision;
  readonly authorizationCurrent?: boolean;
  readonly toolRecorder?: ReturnType<typeof recorder>;
  readonly dataGateway?: AtlasToolGateway;
  readonly maximumResultBytes?: number;
  readonly auditTimeoutMs?: number;
}

function target(options: TargetOptions = {}) {
  const manifest = options.manifest ?? atlasCatalogHelpManifest;
  const handler = vi.fn(
    options.handler
      ?? atlasCatalogHelpRegistration.handler,
  );
  const registration: AtlasToolRegistration = {
    manifest,
    status: options.status ?? "enabled",
    implementationBinding: manifest.implementation.binding,
    handler,
  };
  const capabilityDeclarations = {
    hasActionCode: vi.fn((code: string) => code === manifest.actionCode),
  };
  const bindings =
    new CapabilityRegistryToolImplementationBindingAdapter(
      capabilityDeclarations,
      [{
        actionCode: manifest.actionCode,
        implementationBinding: manifest.implementation.binding,
        handler,
      }],
    );
  const registry = new AtlasToolRegistry([registration], bindings);
  const toolRecorder = options.toolRecorder ?? recorder();
  const features = {
    isEnabled: vi.fn(async () => options.featureEnabled ?? true),
    isEnabledStrict: vi.fn(
      async () => options.featureEnabled ?? true,
    ),
  };
  const policy = {
    evaluate: vi.fn(async () =>
      options.policyDecision ?? allowedPolicy()
    ),
    evaluateStrict: vi.fn(async () =>
      options.policyDecision ?? allowedPolicy()
    ),
  };
  const authorizationRevalidator = {
    isCurrent: vi.fn(async () => options.authorizationCurrent ?? true),
  };
  const executor = new AgentReadOnlyToolExecutor({
    registry,
    features,
    policy,
    authorizationRevalidator,
    recorder: toolRecorder,
    ...(options.dataGateway ? { dataGateway: options.dataGateway } : {}),
    clock: { now: () => new Date(NOW) },
    maximumTimeoutMs: 1_000,
    maximumResultBytes: options.maximumResultBytes ?? 64_000,
    controlTimeoutMs: 100,
    auditTimeoutMs: options.auditTimeoutMs ?? 100,
  });
  return {
    executor,
    handler,
    features,
    policy,
    authorizationRevalidator,
    recorder: toolRecorder,
  };
}

async function expectDeniedWithoutHandler(
  testTarget: ReturnType<typeof target>,
  context: VerifiedRequestContext,
  request: AtlasToolExecutionInput,
  code: string,
): Promise<void> {
  await expect(
    testTarget.executor.execute(context, request),
  ).rejects.toMatchObject({ code });
  expect(testTarget.handler).not.toHaveBeenCalled();
  expect(testTarget.recorder.propose).toHaveBeenCalledTimes(1);
  expect(testTarget.recorder.markExecuting).not.toHaveBeenCalled();
  expect(testTarget.recorder.finalize).toHaveBeenCalledWith(
    expect.objectContaining({
      outcome: code === "CANCELLED" ? "cancelled" : "denied",
      errorCode: code,
      ...(code === "CANCELLED"
        ? {}
        : {
            resolution: expect.objectContaining({
              autonomyDecision: "denied",
            }),
          }),
    }),
  );
}

describe("AgentReadOnlyToolExecutor", () => {
  it("resolves only the effective provider definition and validates its input", async () => {
    const testTarget = target();

    const definitions = await testTarget.executor.resolveEffective(
      verifiedContext(),
    );

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      name: ATLAS_CATALOG_HELP_TOOL_NAME,
      access: "read_only",
      risk: "low",
      toolVersion: "1.0.0",
    });
    expect(definitions[0]!.validateInput({ topic: "safety" })).toMatchObject({
      ok: true,
    });
    expect(definitions[0]!.validateInput({
      topic: "safety",
      url: "https://attacker.invalid",
    })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({
        keyword: "additionalProperties",
      })]),
    });
  });

  it("executes deterministic catalog help only after durable proposal and executing transitions", async () => {
    const testTarget = target();

    const result = await testTarget.executor.execute(
      verifiedContext(),
      invocation({ input: { topic: "safety" } }),
    );

    expect(result).toMatchObject({
      kind: "tool_data",
      toolName: ATLAS_CATALOG_HELP_TOOL_NAME,
      toolVersion: "1.0.0",
      data: {
        catalogVersion: "1.0.0",
        topic: "safety",
      },
      evidence: [{
        kind: "code",
        sourceId: "atlas.catalog.help",
        sourceVersionId: "1.0.0",
      }],
    });
    expect(result.argumentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.resultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(testTarget.handler).toHaveBeenCalledTimes(1);
    expect(
      testTarget.recorder.propose.mock.invocationCallOrder[0],
    ).toBeLessThan(
      testTarget.recorder.markExecuting.mock.invocationCallOrder[0]!,
    );
    expect(
      testTarget.recorder.markExecuting.mock.invocationCallOrder[0],
    ).toBeLessThan(
      testTarget.recorder.finalize.mock.invocationCallOrder[0]!,
    );
    expect(testTarget.recorder.markExecuting).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          executionId: expect.any(String),
          tenantId: TENANT_ID,
          principalId: PRINCIPAL_ID,
          plane: "neon",
          runId: RUN_ID,
          threadId: THREAD_ID,
          callId: "call-1",
        },
        resolution: expect.objectContaining({
          operationClass: "read",
          riskClass: "low",
          autonomyDecision: "auto",
        }),
      }),
    );
    const auditJson = JSON.stringify({
      proposal: testTarget.recorder.propose.mock.calls,
      executing: testTarget.recorder.markExecuting.mock.calls,
      terminal: testTarget.recorder.finalize.mock.calls,
    });
    expect(auditJson).not.toContain('"topic":"safety"');
    expect(auditJson).not.toContain('"summary"');
  });

  it.each([
    {
      label: "unknown",
      setup: () => target(),
      request: invocation({ toolName: "atlas_unknown" }),
      code: "UNKNOWN_TOOL",
    },
    {
      label: "runtime not-described",
      setup: () => target(),
      request: invocation({ runtimeDisposition: "not_described" }),
      code: "TOOL_NOT_DESCRIBED",
    },
    {
      label: "disabled",
      setup: () => target({ status: "disabled" }),
      request: invocation(),
      code: "TOOL_DISABLED",
    },
    {
      label: "wrong plane",
      setup: () => target({
        manifest: {
          ...atlasCatalogHelpManifest,
          allowedPlanes: ["mesh"],
        },
      }),
      request: invocation(),
      code: "WRONG_PLANE",
    },
    {
      label: "feature disabled",
      setup: () => target({ featureEnabled: false }),
      request: invocation(),
      code: "FEATURE_DISABLED",
    },
    {
      label: "policy denied",
      setup: () => target({
        policyDecision: allowedPolicy({
          allowed: false,
          policySnapshot: {
            autonomyLevel: "disabled",
            requiresHumanConfirmation: true,
            confidenceThreshold: 0,
          },
        }),
      }),
      request: invocation(),
      code: "POLICY_DENIED",
    },
    {
      label: "risk denied",
      setup: () => target({
        policyDecision: allowedPolicy({ riskCeiling: "low" }),
        manifest: {
          ...atlasCatalogHelpManifest,
          risk: "medium",
        },
      }),
      request: invocation(),
      code: "RISK_CEILING_EXCEEDED",
    },
    {
      label: "malformed schema",
      setup: () => target(),
      request: invocation({
        input: {
          topic: "overview",
          command: "DROP TABLE anything",
        },
      }),
      code: "MALFORMED_ARGUMENTS",
    },
    {
      label: "runtime schema-invalid",
      setup: () => target(),
      request: invocation({ runtimeDisposition: "schema_invalid" }),
      code: "MALFORMED_ARGUMENTS",
    },
  ])("$label never invokes a handler", async ({ setup, request, code }) => {
    await expectDeniedWithoutHandler(
      setup(),
      verifiedContext(),
      request,
      code,
    );
  });

  it("treats runtime disposition as a pre-authorization denial signal", async () => {
    for (const runtimeDisposition of [
      "not_described",
      "schema_invalid",
    ] as const) {
      const testTarget = target();
      await expect(
        testTarget.executor.execute(
          verifiedContext(),
          invocation({ runtimeDisposition }),
        ),
      ).rejects.toMatchObject({
        code: runtimeDisposition === "not_described"
          ? "TOOL_NOT_DESCRIBED"
          : "MALFORMED_ARGUMENTS",
      });
      expect(
        testTarget.authorizationRevalidator.isCurrent,
      ).not.toHaveBeenCalled();
      expect(testTarget.features.isEnabled).not.toHaveBeenCalled();
      expect(testTarget.policy.evaluate).not.toHaveBeenCalled();
      expect(testTarget.handler).not.toHaveBeenCalled();
    }
  });

  it("denies missing, explicitly denied and plan-locked permissions before handler invocation", async () => {
    for (const permissionState of ["missing", "denied", "plan_locked"] as const) {
      const base = verifiedContext(
        permissionState === "missing" ? [] : [ATLAS_TOOL_READ_PERMISSION],
      );
      const permissions = {
        ...base.permissions,
        denied: new Set(
          permissionState === "denied" ? [ATLAS_TOOL_READ_PERMISSION] : [],
        ),
        planLocked: new Set(
          permissionState === "plan_locked"
            ? [ATLAS_TOOL_READ_PERMISSION]
            : [],
        ),
      };
      const context = { ...base, permissions };
      await expectDeniedWithoutHandler(
        target(),
        context,
        invocation(),
        "PERMISSION_DENIED",
      );
    }
  });

  it("fails closed for cross-tenant context mismatch without writing or invoking", async () => {
    const testTarget = target();
    const base = verifiedContext();
    const mismatched = {
      ...base,
      tenantId: OTHER_TENANT_ID,
    };

    await expect(
      testTarget.executor.execute(mismatched, invocation()),
    ).rejects.toMatchObject({ code: "INVALID_VERIFIED_CONTEXT" });
    expect(testTarget.handler).not.toHaveBeenCalled();
    expect(testTarget.recorder.propose).not.toHaveBeenCalled();
  });

  it("denies a stale authorization epoch and revalidates again immediately before execution", async () => {
    const stale = target({ authorizationCurrent: false });
    await expectDeniedWithoutHandler(
      stale,
      verifiedContext(),
      invocation(),
      "AUTHORIZATION_STALE",
    );

    const changesAfterFirstCheck = target();
    changesAfterFirstCheck.authorizationRevalidator.isCurrent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expectDeniedWithoutHandler(
      changesAfterFirstCheck,
      verifiedContext(),
      invocation(),
      "AUTHORIZATION_STALE",
    );
    expect(
      changesAfterFirstCheck.authorizationRevalidator.isCurrent,
    ).toHaveBeenCalledTimes(2);
    for (const call of
      changesAfterFirstCheck.authorizationRevalidator.isCurrent.mock.calls) {
      expect(call[1]).toEqual({
        requiredPermissions: [ATLAS_TOOL_READ_PERMISSION],
      });
    }
  });

  it("re-reads feature and policy controls immediately before execution", async () => {
    const featureRevoked = target();
    featureRevoked.features.isEnabledStrict.mockResolvedValueOnce(false);
    await expectDeniedWithoutHandler(
      featureRevoked,
      verifiedContext(),
      invocation(),
      "FEATURE_DISABLED",
    );
    expect(featureRevoked.features.isEnabled).toHaveBeenCalledTimes(1);
    expect(featureRevoked.features.isEnabledStrict).toHaveBeenCalledTimes(1);
    expect(featureRevoked.policy.evaluateStrict).not.toHaveBeenCalled();

    const policyRevoked = target();
    policyRevoked.policy.evaluateStrict.mockResolvedValueOnce(
      allowedPolicy({
        allowed: false,
        policyRevision: "policy-revoked-v2",
        policySnapshot: {
          autonomyLevel: "disabled",
          requiresHumanConfirmation: true,
          confidenceThreshold: 0,
        },
      }),
    );
    await expectDeniedWithoutHandler(
      policyRevoked,
      verifiedContext(),
      invocation(),
      "POLICY_DENIED",
    );
    expect(policyRevoked.recorder.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution: expect.objectContaining({
          policyRevision: "policy-revoked-v2",
        }),
      }),
    );

    const revisionChanged = target();
    revisionChanged.policy.evaluateStrict.mockResolvedValueOnce(
      allowedPolicy({ policyRevision: "policy-fresh-v2" }),
    );
    await revisionChanged.executor.execute(
      verifiedContext(),
      invocation(),
    );
    expect(revisionChanged.recorder.markExecuting).toHaveBeenCalledWith(
      expect.objectContaining({
        resolution: expect.objectContaining({
          policyRevision: "policy-fresh-v2",
        }),
      }),
    );
  });

  it("preserves the unresolved proposal snapshot on pre-policy timeout", async () => {
    const testTarget = target();
    testTarget.features.isEnabled.mockRejectedValueOnce(
      new AtlasToolExecutionError("TIMEOUT", "control timeout"),
    );

    await expect(
      testTarget.executor.execute(verifiedContext(), invocation()),
    ).rejects.toMatchObject({ code: "TIMEOUT" });

    expect(testTarget.handler).not.toHaveBeenCalled();
    expect(testTarget.recorder.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "TIMEOUT",
        resolution: expect.objectContaining({
          operationClass: "unresolved",
          riskClass: "unknown",
          autonomyDecision: "not_evaluated",
          policyRevision: "unresolved",
          permissionSnapshot: expect.objectContaining({
            resolution: "not_evaluated",
            granted: null,
          }),
          policySnapshot: expect.objectContaining({
            resolution: "not_evaluated",
          }),
        }),
      }),
    );
  });

  it("fails closed when proposal or executing persistence fails", async () => {
    const proposalRecorder = recorder();
    proposalRecorder.propose.mockRejectedValueOnce(new Error("db unavailable"));
    const proposalFailure = target({ toolRecorder: proposalRecorder });
    await expect(
      proposalFailure.executor.execute(verifiedContext(), invocation()),
    ).rejects.toMatchObject({ code: "RECORDING_FAILED" });
    expect(proposalFailure.handler).not.toHaveBeenCalled();
    expect(proposalRecorder.markExecuting).not.toHaveBeenCalled();

    const executingRecorder = recorder();
    executingRecorder.markExecuting.mockRejectedValueOnce(
      new Error("transition failed"),
    );
    const executingFailure = target({ toolRecorder: executingRecorder });
    await expect(
      executingFailure.executor.execute(verifiedContext(), invocation()),
    ).rejects.toMatchObject({ code: "RECORDING_FAILED" });
    expect(executingFailure.handler).not.toHaveBeenCalled();

    const hungRecorder = recorder();
    hungRecorder.propose.mockImplementationOnce(
      async () => new Promise<void>(() => undefined),
    );
    const hungProposal = target({
      toolRecorder: hungRecorder,
      auditTimeoutMs: 20,
    });
    await expect(
      hungProposal.executor.execute(verifiedContext(), invocation()),
    ).rejects.toMatchObject({ code: "RECORDING_FAILED" });
    expect(hungProposal.handler).not.toHaveBeenCalled();
  });

  it("retains an observed proposal after an ambiguous executing audit failure", async () => {
    const toolRecorder = recorder();
    toolRecorder.markExecuting.mockRejectedValueOnce(
      new Error("transition unavailable"),
    );
    const testTarget = target({ toolRecorder });
    const context = verifiedContext();
    const observed = await testTarget.executor.observeProposal(
      context,
      invocation(),
    );

    await expect(
      testTarget.executor.executeObserved(context, observed),
    ).rejects.toMatchObject({ code: "RECORDING_FAILED" });
    expect(testTarget.handler).not.toHaveBeenCalled();
    expect(toolRecorder.finalize).not.toHaveBeenCalled();

    await testTarget.executor.finalizeObserved(context, observed, {
      outcome: "failed",
      reason: "provider_failed",
    });
    expect(toolRecorder.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "failed",
        errorCode: "PROVIDER_TERMINATED",
        resolution: expect.objectContaining({
          autonomyDecision: "auto",
          policyRevision: "policy-v1",
        }),
      }),
    );
  });

  it("retries the exact pending terminal transition after an audit failure", async () => {
    const toolRecorder = recorder();
    toolRecorder.finalize.mockRejectedValueOnce(
      new Error("terminal write unavailable"),
    );
    const testTarget = target({
      toolRecorder,
      policyDecision: allowedPolicy({
        allowed: false,
        policySnapshot: {
          autonomyLevel: "disabled",
          requiresHumanConfirmation: true,
          confidenceThreshold: 0,
        },
      }),
    });
    const context = verifiedContext();
    const observed = await testTarget.executor.observeProposal(
      context,
      invocation(),
    );

    await expect(
      testTarget.executor.executeObserved(context, observed),
    ).rejects.toMatchObject({ code: "RECORDING_FAILED" });
    await testTarget.executor.finalizeObserved(context, observed, {
      outcome: "failed",
      reason: "provider_failed",
    });

    expect(toolRecorder.finalize).toHaveBeenCalledTimes(2);
    expect(toolRecorder.finalize.mock.calls[1]?.[0]).toMatchObject({
      outcome: "denied",
      errorCode: "POLICY_DENIED",
    });
    await expect(
      testTarget.executor.finalizeObserved(context, observed, {
        outcome: "failed",
        reason: "provider_failed",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INVOCATION" });
  });

  it("bounds handler time and honors cancellation", async () => {
    const never = target({
      manifest: {
        ...atlasCatalogHelpManifest,
        timeoutMs: 20,
      },
      handler: async () => new Promise(() => undefined),
    });
    await expect(
      never.executor.execute(verifiedContext(), invocation()),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(never.recorder.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "failed",
        errorCode: "TIMEOUT",
      }),
    );

    const controller = new AbortController();
    const cancelled = target({
      handler: async (context) =>
        new Promise((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    });
    const pending = cancelled.executor.execute(
      verifiedContext(),
      invocation({ signal: controller.signal }),
    );
    await vi.waitFor(() => {
      expect(cancelled.handler).toHaveBeenCalledTimes(1);
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    expect(cancelled.recorder.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "cancelled",
        errorCode: "CANCELLED",
      }),
    );
  });

  it("rejects non-data handler channels, result schema violations and oversized results", async () => {
    const extraChannel = target({
      handler: async () => ({
        data: {},
        command: () => "execute",
      } as unknown as { data: unknown }),
    });
    await expect(
      extraChannel.executor.execute(verifiedContext(), invocation()),
    ).rejects.toMatchObject({ code: "MALFORMED_RESULT" });

    const wrongShape = target({
      handler: async () => ({ data: { arbitrary: true } }),
    });
    await expect(
      wrongShape.executor.execute(verifiedContext(), invocation()),
    ).rejects.toMatchObject({ code: "MALFORMED_RESULT" });

    const oversized = target({
      maximumResultBytes: 200,
    });
    await expect(
      oversized.executor.execute(verifiedContext(), invocation()),
    ).rejects.toMatchObject({ code: "RESULT_TOO_LARGE" });
  });

  it("allows tenant data only through AtlasDataGateway and emits source metadata", async () => {
    const gateway: AtlasToolGateway = {
      read: vi.fn(async () => ({
        value: { label: "Invoice 42" },
        source: {
          sourceKind: "record",
          sourceId: "invoice-42",
          sourceVersionId: "version-3",
          sourceChecksum: "sha256:fixture",
        },
        authorizationProfileHash: "profile-v1",
      })),
    };
    const fixtureManifest: AtlasToolManifestV1 = {
      ...atlasCatalogHelpManifest,
      name: "atlas_record_fixture",
      displayName: "Atlas record fixture",
      description: "Reads one test record through AtlasDataGateway.",
      requiredPermissions: [
        ATLAS_TOOL_READ_PERMISSION,
        "invoice.read",
      ],
      implementation: {
        kind: "code",
        binding: "atlas.record.fixture.v1",
      },
      dataAccess: {
        mode: "atlas_gateway",
        permissionCodes: ["invoice.read"],
        sourceKinds: ["record"],
        maxReads: 1,
      },
      evidence: {
        mode: "code_and_atlas_gateway",
        requireVersion: true,
        requireChecksumForCode: true,
      },
      inputSchema: {
        type: "object",
        properties: {
          sourceId: { type: "string", maxLength: 64 },
        },
        required: ["sourceId"],
        additionalProperties: false,
        maxProperties: 1,
      },
      resultSchema: {
        type: "object",
        properties: {
          label: { type: "string", maxLength: 100 },
        },
        required: ["label"],
        additionalProperties: false,
        maxProperties: 1,
      },
      source: {
        ...atlasCatalogHelpManifest.source,
        sourceId: "atlas.record.fixture",
      },
    };
    const gatewayTool = target({
      manifest: fixtureManifest,
      dataGateway: gateway,
      handler: async (handlerContext, rawInput) => {
        expect(Object.keys(handlerContext).sort()).toEqual([
          "plane",
          "readData",
          "signal",
        ]);
        const input = rawInput as Readonly<Record<string, AtlasJsonValue>>;
        const loaded = await handlerContext.readData({
          permissionCode: "invoice.read",
          sourceKind: "record",
          sourceId: String(input.sourceId),
        });
        const data = loaded.data as Readonly<Record<string, AtlasJsonValue>>;
        return { data: { label: data.label } };
      },
    });

    const result = await gatewayTool.executor.execute(
      verifiedContext([ATLAS_TOOL_READ_PERMISSION, "invoice.read"]),
      invocation({
        toolName: fixtureManifest.name,
        input: { sourceId: "invoice-42" },
      }),
    );

    expect(result).toMatchObject({
      kind: "tool_data",
      data: { label: "Invoice 42" },
      evidence: expect.arrayContaining([expect.objectContaining({
        kind: "record",
        sourceId: "invoice-42",
        sourceVersionId: "version-3",
        authorizationProfileHash: "profile-v1",
      })]),
    });
    expect(gateway.read).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        principalId: PRINCIPAL_ID,
      }),
      expect.objectContaining({
        permissionCode: "invoice.read",
        sourceId: "invoice-42",
      }),
    );
  });

  it("surfaces terminal recorder failure instead of returning unrecorded data", async () => {
    const terminalRecorder = recorder();
    terminalRecorder.finalize.mockRejectedValueOnce(
      new Error("terminal transition unavailable"),
    );
    const testTarget = target({ toolRecorder: terminalRecorder });

    await expect(
      testTarget.executor.execute(verifiedContext(), invocation()),
    ).rejects.toMatchObject({ code: "RECORDING_FAILED" });
    expect(testTarget.handler).toHaveBeenCalledTimes(1);
  });
});
