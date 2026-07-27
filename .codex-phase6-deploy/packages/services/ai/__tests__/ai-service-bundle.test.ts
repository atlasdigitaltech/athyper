import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRunRequestSchema } from "@athyper/atlas-agent-runtime";
import type {
  EffectivePermissionContext,
  VerifiedRequestContext,
} from "@athyper/svc-iam";
import {
  createAiServiceBundle,
  type AiServiceBundleOptions,
} from "../index.js";
import type { AiLogger, AnyDb } from "../ai-runtime.types.js";
import { OpenAiTextProvider } from "../providers/openai-text.provider.js";
import { GeminiTextProvider } from "../providers/gemini-text.provider.js";

const FINGERPRINT_KEY =
  "atlas-agent-test-fingerprint-key-32-bytes-minimum";

const session = {
  tenantId: "tenant-bootstrap-test",
  principalId: "principal-bootstrap-test",
  plane: "neon" as const,
};

const logger: AiLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const redis: AiServiceBundleOptions["redis"] = {
  get: vi.fn(async () => null),
  set: vi.fn(async () => "OK"),
};
const testDb = {
  insertInto: vi.fn(() => ({
    values: vi.fn(() => ({
      execute: vi.fn(async () => undefined),
    })),
  })),
  transaction: vi.fn(() => ({
    execute: vi.fn(async (
      callback: (transaction: typeof testDb) => Promise<unknown>,
    ) => callback(testDb)),
  })),
};
const db = testDb as unknown as AnyDb;

function atlasConfig(input: {
  omitFingerprintKey?: boolean;
  defaultPublicModelId?: "atlas-fast" | "atlas-balanced" | "atlas-best";
  openAiEnabled?: boolean;
  geminiEnabled?: boolean;
  geminiAccountClass?: "free" | "paid";
  toolsEnabled?: boolean;
} = {}): AiServiceBundleOptions["atlasAgent"] {
  return {
    enabled: true,
    defaultPublicModelId: input.defaultPublicModelId ?? "atlas-balanced",
    providerTimeoutMs: 60_000,
    streamIdleTimeoutMs: 15_000,
    maxOutputTokens: 2_048,
    maxOutputBytes: 131_072,
    userRunsPerMinute: 10,
    tenantRunsPerMinute: 100,
    tools: {
      enabled: input.toolsEnabled ?? false,
      maxRounds: 3,
      maxCalls: 4,
      maxElapsedMs: 120_000,
      maxTotalTokens: 32_768,
      timeoutMs: 10_000,
      maxInputBytes: 32_768,
      maxResultBytes: 32_768,
    },
    persistence: {
      enabled: input.toolsEnabled ?? false,
      defaultRetentionDays: 30,
      minimumRetentionDays: 1,
      maximumRetentionDays: 365,
      contextMaxMessages: 20,
      contextMaxCharacters: 98_304,
      staleRunTimeoutMs: 900_000,
      purgeBatchSize: 500,
    },
    anthropic: {
      fastModelId: "claude-haiku-4-5-20251001",
      balancedModelId: "claude-sonnet-4-6",
      bestModelId: "claude-opus-4-8",
    },
    openai: {
      enabled: input.openAiEnabled ?? false,
      evalModelId: "gpt-5.6-sol",
      projectId: "proj_atlas_eval",
      timeoutMs: 60_000,
    },
    gemini: {
      enabled: input.geminiEnabled ?? false,
      evalModelId: "gemini-3.6-flash",
      projectId: "athyper-atlas-eval",
      providerRegion: "global",
      accountClass: input.geminiAccountClass ?? "paid",
      timeoutMs: 60_000,
    },
    ...(!input.omitFingerprintKey
      ? { credentialFingerprintKey: FINGERPRINT_KEY }
      : {}),
  };
}

function sessionWithProviderDiagnostics(): typeof session & {
  verifiedRequestContext: VerifiedRequestContext;
} {
  const permissions = {
    planeKey: "neon",
    tenantId: session.tenantId,
    principalId: session.principalId,
    principalFingerprint: "principal-fingerprint",
    allowed: new Set(["ai.agent.use", "ai.agent.provider_diagnostics"]),
    denied: new Set<string>(),
    planLocked: new Set<string>(),
    planeExcluded: new Set<string>(),
    entries: new Map(),
    authorizationScopes: new Map(),
    profileHash: "profile-hash",
    schemaHash: "schema-hash",
    resolvedAt: Date.now(),
  } satisfies EffectivePermissionContext;
  return {
    ...session,
    verifiedRequestContext: {
      planeKey: "neon",
      realmKey: "athyper",
      tenantId: session.tenantId,
      principalId: session.principalId,
      permissions,
      authEpoch: 1,
      profileHash: permissions.profileHash,
      requestId: "request-openai-eval",
    },
  };
}

function mockOpenAiReady() {
  return vi.spyOn(OpenAiTextProvider.prototype, "checkReadiness")
    .mockResolvedValue({
      modelId: "gpt-5.6-sol",
      implemented: true,
      credentialed: true,
      healthy: true,
      eligible: true,
      reason: "ready",
      retryable: false,
    });
}

function mockGeminiReady() {
  return vi.spyOn(GeminiTextProvider.prototype, "checkReadiness")
    .mockResolvedValue({
      modelId: "gemini-3.6-flash",
      implemented: true,
      credentialed: true,
      healthy: true,
      eligible: true,
      reason: "ready",
      retryable: false,
    });
}

async function createBundle(
  atlasAgent: AiServiceBundleOptions["atlasAgent"] = atlasConfig(),
  environment: AiServiceBundleOptions["environment"] = "local",
  governance: Pick<
    AiServiceBundleOptions,
    | "featureFlags"
    | "permissionResolverRegistry"
    | "atlasProtectedContentStore"
  > = {},
) {
  const featureFlags = governance.featureFlags ?? {
    isEnabled: vi.fn(async (code: string) =>
      code === "atlas_agent_enabled"
      || code === "atlas_agent_neon_enabled"
    ),
  };
  return createAiServiceBundle({
    db,
    redis,
    logger,
    environment,
    atlasAgent,
    ...governance,
    featureFlags,
  });
}

async function collectRunEvents(
  bundle: Awaited<ReturnType<typeof createBundle>>,
) {
  const request = AgentRunRequestSchema.parse({
    client_request_id: "00000000-0000-4000-8000-000000000001",
    plane: "neon",
    model_id: "atlas-fast",
    message: "Hello",
  });

  const events = [];
  for await (const event of bundle.agentRuntime.run(request, session)) {
    events.push(event);
  }
  return events;
}

describe.sequential("createAiServiceBundle Atlas bootstrap invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Explicit empty values prevent a developer machine's credentials from
    // changing these fail-closed bootstrap tests.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    vi.stubEnv("VOYAGE_API_KEY", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps governed tools unregistered when the environment gate is off", async () => {
    const bundle = await createBundle();

    expect(bundle.agentToolReadiness).toEqual({
      enabled: false,
      registeredToolNames: [],
    });
  });

  it("fails startup when sensitive retention lacks an attested protected store", async () => {
    const config = atlasConfig();
    config.persistence.enabled = true;
    config.persistence.contentProtectionMode = "tenant_protected_store";

    await expect(createBundle(config)).rejects.toThrow(
      "requires an approved tenant protected-content store",
    );
  });

  it("accepts sensitive retention only after every store proof is attested", async () => {
    const config = atlasConfig();
    config.persistence.enabled = true;
    config.persistence.contentProtectionMode = "tenant_protected_store";

    await expect(createBundle(config, "local", {
      atlasProtectedContentStore: {
        put: vi.fn(),
        get: vi.fn(),
        rotate: vi.fn(),
        delete: vi.fn(),
        readiness: vi.fn(async () => ({
          healthy: true,
          encryptionVerified: true,
          keyRotationVerified: true,
          tenantIsolationVerified: true,
          deletionAndPurgeVerified: true,
          backupRecoveryVerified: true,
          revokedKeyBehaviorVerified: true,
        })),
      },
    })).resolves.toMatchObject({
      atlasThreadService: expect.any(Object),
    });
  });

  it("fails startup when enabled tools lack strict flags or live IAM", async () => {
    await expect(
      createBundle(atlasConfig({ toolsEnabled: true })),
    ).rejects.toThrow("uncached strict feature resolution");

    await expect(
      createBundle(
        atlasConfig({ toolsEnabled: true }),
        "local",
        {
          featureFlags: {
            isEnabled: vi.fn(async () => false),
            isEnabledStrict: vi.fn(async () => false),
          },
        },
      ),
    ).rejects.toThrow("live IAM permission revalidation");
  });

  it("binds only the certified catalog tool when every server dependency exists", async () => {
    const bundle = await createBundle(
      atlasConfig({ toolsEnabled: true }),
      "local",
      {
        featureFlags: {
          isEnabled: vi.fn(async () => false),
          isEnabledStrict: vi.fn(async () => false),
        },
        permissionResolverRegistry: {
          get: vi.fn(() => ({
            planeKey: "neon" as const,
            build: vi.fn(async () => {
              throw new Error("not invoked during bootstrap");
            }),
          })),
        },
      },
    );

    expect(bundle.agentToolReadiness).toEqual({
      enabled: true,
      registeredToolNames: ["atlas_catalog_help"],
    });
  });

  it("uses configured exact upstream bindings and the configured public default", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");

    const bundle = await createBundle(atlasConfig({
      defaultPublicModelId: "atlas-balanced",
    }));
    const resolution = await bundle.agentCatalogResolver.resolve(session);

    expect(bundle.agentRuntime.available).toBe(true);
    expect(resolution.catalog.default_model_id).toBe("atlas-balanced");
    expect(resolution.catalog.models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
    ]);
    expect(resolution.bindings.map((binding) => ({
      publicModelId: binding.publicModelId,
      providerId: binding.providerId,
      upstreamModelId: binding.upstreamModelId,
    }))).toEqual([
      {
        publicModelId: "atlas-fast",
        providerId: "anthropic",
        upstreamModelId: "claude-haiku-4-5-20251001",
      },
      {
        publicModelId: "atlas-balanced",
        providerId: "anthropic",
        upstreamModelId: "claude-sonnet-4-6",
      },
      {
        publicModelId: "atlas-best",
        providerId: "anthropic",
        upstreamModelId: "claude-opus-4-8",
      },
    ]);
  });

  it("gives AgentRuntime the same exported effective resolver instance", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    const bundle = await createBundle();
    const resolveSpy = vi.spyOn(bundle.agentCatalogResolver, "resolve")
      .mockResolvedValue({
        catalog: {
          default_model_id: "",
          models: [],
          policy_revision: "forced-request-policy",
        },
        bindings: [],
        policyRevision: "forced-request-policy",
      });

    const events = await collectRunEvents(bundle);

    expect(resolveSpy).toHaveBeenCalledOnce();
    expect(resolveSpy).toHaveBeenCalledWith(session);
    expect(events.map((envelope) => envelope.event)).toEqual([
      {
        type: "run.failed",
        code: "model_unavailable",
        message: "Model atlas-fast is not available for this request.",
        retryable: false,
      },
    ]);
  });

  it(
    "keeps the disabled Mesh catalog empty even when its tenant flag is enabled",
    async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    const bundle = await createBundle(
      atlasConfig(),
      "local",
      {
        featureFlags: {
          isEnabled: vi.fn(async (code: string) =>
            code === "atlas_agent_enabled"
            || code === "atlas_agent_neon_enabled"
            || code === "atlas_agent_mesh_enabled"
            || code === "atlas_agent_admin_enabled"
          ),
        },
      },
    );

    await expect(bundle.agentCatalogResolver.resolveCatalog({
      ...session,
      plane: "mesh",
    })).resolves.toMatchObject({
      default_model_id: "",
      models: [],
    });
    },
  );

  it(
    "admits only the text-only fast model for the Admin product-help pilot",
    async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
      const bundle = await createBundle(
        atlasConfig(),
        "local",
        {
          featureFlags: {
            isEnabled: vi.fn(async (code: string) =>
              code === "atlas_agent_enabled"
              || code === "atlas_agent_admin_enabled"
            ),
          },
        },
      );

      await expect(bundle.agentCatalogResolver.resolveCatalog({
        ...session,
        plane: "admin",
      })).resolves.toMatchObject({
        default_model_id: "atlas-fast",
        models: [{
          model_id: "atlas-fast",
          capabilities: {
            tools: false,
          },
        }],
      });
    },
  );

  it("fails closed when the credential fingerprint key is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");

    const bundle = await createBundle(atlasConfig({
      omitFingerprintKey: true,
    }));

    expect(bundle.agentRuntime.available).toBe(false);
    await expect(bundle.agentCatalogResolver.resolveCatalog(session)).resolves.toMatchObject({
      default_model_id: "",
      models: [],
    });
  });

  it("fails closed when the Anthropic platform credential is missing", async () => {
    const bundle = await createBundle();

    expect(bundle.agentRuntime.available).toBe(false);
    await expect(bundle.agentCatalogResolver.resolveCatalog(session)).resolves.toMatchObject({
      default_model_id: "",
      models: [],
    });
  });

  it("does not let credentials bypass the disabled OpenAI provider gate", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-stub-credential");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-stub-credential");
    vi.stubEnv("GOOGLE_API_KEY", "test-google-stub-credential");
    const probe = vi.spyOn(OpenAiTextProvider.prototype, "checkReadiness");
    const geminiProbe = vi.spyOn(GeminiTextProvider.prototype, "checkReadiness");

    const bundle = await createBundle();

    expect(probe).not.toHaveBeenCalled();
    expect(geminiProbe).not.toHaveBeenCalled();
    expect(bundle.agentRuntime.available).toBe(true);
    const catalog = await bundle.agentCatalogResolver.resolveCatalog(session);
    expect(catalog.models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
    ]);
  });

  it("keeps Anthropic intact and skips the probe when enabled OpenAI has no credential", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    const probe = vi.spyOn(OpenAiTextProvider.prototype, "checkReadiness");

    const bundle = await createBundle(atlasConfig({ openAiEnabled: true }));
    const resolution = await bundle.agentCatalogResolver.resolve(
      sessionWithProviderDiagnostics(),
    );

    expect(probe).not.toHaveBeenCalled();
    expect(bundle.agentProviderReadiness.openai).toEqual({
      enabled: true,
      implemented: true,
      credentialed: false,
      healthy: false,
      eligible: false,
      reason: "CREDENTIAL_MISSING",
    });
    expect(bundle.agentRuntime.available).toBe(true);
    expect(resolution.catalog.models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
    ]);
  });

  it("adds the probed OpenAI binding only for canonical diagnostic permission", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-platform-credential");
    const probe = mockOpenAiReady();

    const bundle = await createBundle(atlasConfig({
      openAiEnabled: true,
      defaultPublicModelId: "atlas-balanced",
    }));
    const ordinary = await bundle.agentCatalogResolver.resolve(session);
    const evaluator = await bundle.agentCatalogResolver.resolve(
      sessionWithProviderDiagnostics(),
    );

    expect(probe).toHaveBeenCalledOnce();
    expect(probe).toHaveBeenCalledWith(
      "gpt-5.6-sol",
      { credential: { secret: "test-openai-platform-credential" } },
    );
    expect(bundle.agentProviderReadiness.openai).toEqual({
      enabled: true,
      implemented: true,
      credentialed: true,
      healthy: true,
      eligible: true,
      reason: "ready",
    });
    expect(ordinary.catalog.default_model_id).toBe("atlas-balanced");
    expect(ordinary.catalog.models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
    ]);
    expect(evaluator.catalog.default_model_id).toBe("atlas-balanced");
    expect(evaluator.catalog.models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
      "atlas-openai-eval",
    ]);
  });

  it("keeps Anthropic available when the OpenAI readiness probe fails", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-platform-credential");
    vi.spyOn(OpenAiTextProvider.prototype, "checkReadiness")
      .mockResolvedValue({
        modelId: "gpt-5.6-sol",
        implemented: true,
        credentialed: true,
        healthy: false,
        eligible: false,
        reason: "authentication_failed",
        retryable: false,
        errorClass: "authentication",
        httpStatus: 401,
      });

    const bundle = await createBundle(atlasConfig({ openAiEnabled: true }));
    const resolution = await bundle.agentCatalogResolver.resolve(
      sessionWithProviderDiagnostics(),
    );

    expect(bundle.agentRuntime.available).toBe(true);
    expect(bundle.agentProviderReadiness.openai).toMatchObject({
      healthy: false,
      eligible: false,
      reason: "authentication_failed",
    });
    expect(resolution.catalog.models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
    ]);
  });

  it("resolves the OpenAI credential again for each request", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-startup-credential");
    mockOpenAiReady();
    const invocations: string[] = [];
    vi.spyOn(OpenAiTextProvider.prototype, "invokeStream")
      .mockImplementation(async function* (invocation) {
        invocations.push(invocation.credential?.secret ?? "");
        yield {
          kind: "response_started",
          provider_id: "openai",
          provider_request_id: "openai-request-1",
          actual_model_id: "gpt-5.6-sol",
        };
        yield { kind: "text_delta", text: "OpenAI evaluation response" };
        yield {
          kind: "usage",
          mode: "snapshot",
          final: true,
          usage: { input_tokens: 10, output_tokens: 4 },
        };
        yield { kind: "completed", reason: "stop" };
      });

    const bundle = await createBundle(atlasConfig({ openAiEnabled: true }));
    vi.stubEnv("OPENAI_API_KEY", "test-openai-request-credential");
    const request = AgentRunRequestSchema.parse({
      client_request_id: "00000000-0000-4000-8000-000000000099",
      plane: "neon",
      model_id: "atlas-openai-eval",
      message: "Run the internal provider evaluation.",
    });
    const events = [];
    for await (const event of bundle.agentRuntime.run(
      request,
      sessionWithProviderDiagnostics(),
    )) {
      events.push(event);
    }

    expect(invocations).toEqual(["test-openai-request-credential"]);
    expect(events.at(-1)?.event).toMatchObject({ type: "run.completed" });
    expect(JSON.stringify([
      vi.mocked(logger.info).mock.calls,
      vi.mocked(logger.warn).mock.calls,
      vi.mocked(logger.error).mock.calls,
    ])).not.toContain("test-openai-request-credential");
  });

  it("reflects runtime OpenAI credential revocation in readiness and catalog eligibility", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-platform-credential");
    mockOpenAiReady();
    vi.spyOn(OpenAiTextProvider.prototype, "invokeStream")
      .mockImplementation(async function* () {
        yield {
          kind: "failed",
          error: {
            error_class: "authentication",
            code: "invalid_api_key",
            safe_message: "ignored provider detail",
            retryable: false,
          },
        };
      });

    const bundle = await createBundle(atlasConfig({ openAiEnabled: true }));
    expect(bundle.agentProviderReadiness.openai).toMatchObject({
      healthy: true,
      eligible: true,
      reason: "ready",
    });

    const request = AgentRunRequestSchema.parse({
      client_request_id: "00000000-0000-4000-8000-000000000100",
      plane: "neon",
      model_id: "atlas-openai-eval",
      message: "Run the internal provider evaluation.",
    });
    const events = [];
    for await (const event of bundle.agentRuntime.run(
      request,
      sessionWithProviderDiagnostics(),
    )) {
      events.push(event);
    }

    expect(events.at(-1)?.event).toMatchObject({
      type: "run.failed",
      code: "atlas_access_unavailable",
      retryable: false,
    });
    expect(bundle.agentProviderReadiness.openai).toEqual({
      enabled: true,
      implemented: true,
      credentialed: false,
      healthy: false,
      eligible: false,
      reason: "credential_authentication",
    });
    await expect(bundle.agentCatalogResolver.resolveCatalog(
      sessionWithProviderDiagnostics(),
    )).resolves.toMatchObject({
      models: [
        { model_id: "atlas-fast" },
        { model_id: "atlas-balanced" },
        { model_id: "atlas-best" },
      ],
    });
  });

  it("does not fall back to GOOGLE_API_KEY when Gemini is enabled", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    vi.stubEnv("GOOGLE_API_KEY", "test-legacy-google-credential");
    const probe = vi.spyOn(GeminiTextProvider.prototype, "checkReadiness");

    const bundle = await createBundle(atlasConfig({ geminiEnabled: true }));

    expect(probe).not.toHaveBeenCalled();
    expect(bundle.agentProviderReadiness.gemini).toEqual({
      enabled: true,
      implemented: true,
      credentialed: false,
      healthy: false,
      eligible: false,
      reason: "CREDENTIAL_MISSING",
    });
    expect(bundle.agentRuntime.available).toBe(true);
  });

  it("adds a ready paid Gemini binding only for diagnostic permission", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-paid-credential");
    const probe = mockGeminiReady();

    const bundle = await createBundle(atlasConfig({
      geminiEnabled: true,
      geminiAccountClass: "paid",
    }));
    const ordinary = await bundle.agentCatalogResolver.resolve(session);
    const evaluator = await bundle.agentCatalogResolver.resolve(
      sessionWithProviderDiagnostics(),
    );

    expect(probe).toHaveBeenCalledOnce();
    expect(probe).toHaveBeenCalledWith(
      "gemini-3.6-flash",
      { credential: { secret: "test-gemini-paid-credential" } },
    );
    expect(bundle.agentProviderReadiness.gemini).toEqual({
      enabled: true,
      implemented: true,
      credentialed: true,
      healthy: true,
      eligible: true,
      reason: "ready",
    });
    expect(ordinary.catalog.models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
    ]);
    expect(evaluator.catalog.default_model_id).toBe("atlas-balanced");
    expect(evaluator.catalog.models.at(-1)).toMatchObject({
      model_id: "atlas-gemini-eval",
      selection_policy: "explicit_only",
    });
    expect(evaluator.bindings.at(-1)).toMatchObject({
      publicModelId: "atlas-gemini-eval",
      providerAccountClass: "platform_paid",
      credentialPolicy: "platform",
      allowedDataClasses: ["synthetic"],
    });
  });

  it("carries the attested free-development account class into the binding", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-local-credential");
    mockGeminiReady();

    const bundle = await createBundle(atlasConfig({
      geminiEnabled: true,
      geminiAccountClass: "free",
    }));
    const evaluator = await bundle.agentCatalogResolver.resolve(
      sessionWithProviderDiagnostics(),
    );

    expect(evaluator.bindings.at(-1)).toMatchObject({
      publicModelId: "atlas-gemini-eval",
      providerAccountClass: "developer_free",
      credentialPolicy: "local",
      dataHandlingProfileId:
        "gemini-developer-free-interactions-store-false-v1",
    });
  });

  it("fails the free Gemini provider closed outside the local environment", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-local-credential");
    const probe = vi.spyOn(GeminiTextProvider.prototype, "checkReadiness");

    const bundle = await createBundle(
      atlasConfig({
        geminiEnabled: true,
        geminiAccountClass: "free",
      }),
      "staging",
    );
    const evaluator = await bundle.agentCatalogResolver.resolve(
      sessionWithProviderDiagnostics(),
    );

    expect(probe).not.toHaveBeenCalled();
    expect(bundle.agentProviderReadiness.gemini).toEqual({
      enabled: true,
      implemented: true,
      credentialed: false,
      healthy: false,
      eligible: false,
      reason: "free_account_local_only",
    });
    expect(evaluator.catalog.models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
    ]);
    expect(bundle.agentProviderReadiness.anthropic).toMatchObject({
      eligible: true,
    });
  });

  it("keeps Anthropic available when Gemini readiness fails", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-paid-credential");
    vi.spyOn(GeminiTextProvider.prototype, "checkReadiness")
      .mockResolvedValue({
        modelId: "gemini-3.6-flash",
        implemented: true,
        credentialed: true,
        healthy: false,
        eligible: false,
        reason: "quota_exhausted",
        retryable: true,
        errorClass: "quota_exhausted",
      });

    const bundle = await createBundle(atlasConfig({ geminiEnabled: true }));
    const evaluator = await bundle.agentCatalogResolver.resolve(
      sessionWithProviderDiagnostics(),
    );

    expect(bundle.agentRuntime.available).toBe(true);
    expect(bundle.agentProviderReadiness.gemini).toMatchObject({
      healthy: false,
      eligible: false,
      reason: "quota_exhausted",
    });
    expect(evaluator.catalog.models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
    ]);
  });

  it("removes only Gemini when its gate is disabled", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-platform-credential");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-platform-credential");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-paid-credential");
    mockOpenAiReady();
    mockGeminiReady();

    const both = await createBundle(atlasConfig({
      openAiEnabled: true,
      geminiEnabled: true,
    }));
    const withoutGemini = await createBundle(atlasConfig({
      openAiEnabled: true,
      geminiEnabled: false,
    }));
    const evaluatorSession = sessionWithProviderDiagnostics();

    expect((await both.agentCatalogResolver.resolveCatalog(
      evaluatorSession,
    )).models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
      "atlas-openai-eval",
      "atlas-gemini-eval",
    ]);
    expect((await withoutGemini.agentCatalogResolver.resolveCatalog(
      evaluatorSession,
    )).models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
      "atlas-openai-eval",
    ]);
    expect(withoutGemini.agentProviderReadiness.openai).toMatchObject({
      eligible: true,
      reason: "ready",
    });
    expect(withoutGemini.agentProviderReadiness.gemini).toMatchObject({
      enabled: false,
      eligible: false,
      reason: "provider_disabled",
    });
  });
});
