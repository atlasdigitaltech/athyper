import { describe, expect, it } from "vitest";
import type {
  EffectivePermissionContext,
  VerifiedRequestContext,
} from "@athyper/svc-iam";
import { FakeModelProvider } from "../../providers/fake-model.provider.js";
import type { AtlasModelBinding } from "../../providers/i-model-provider.js";
import { ProviderRegistry } from "../../providers/provider-registry.js";
import {
  createAnthropicAtlasBindings,
  createEffectiveModelCatalogResolver,
  createGeminiEvalBinding,
  createOpenAiEvalBinding,
  evaluateAtlasFoundationBindingPolicy,
  GEMINI_INTERACTIONS_TEXT_ADAPTER_ID,
  getRegisteredModels,
  OPENAI_PROVIDER_DIAGNOSTICS_PERMISSION,
  OPENAI_RESPONSES_TEXT_ADAPTER_ID,
  OPENAI_RESPONSES_TEXT_ADAPTER_VERSION,
  resolveEffectiveCatalog,
} from "../model-catalog.js";

const session = {
  tenantId: "tenant-1",
  principalId: "principal-1",
  plane: "neon",
};
const allowTestPolicy = {
  resolvePolicy: () => ({
    revision: "test-allow-v1",
    evaluatePolicy: () => ({ allowed: true }),
  }),
} as const;

function fakeBinding(
  publicModelId: string,
  upstreamModelId: string,
): AtlasModelBinding {
  return {
    bindingId: `${publicModelId}-fake-v1`,
    publicModelId,
    providerId: "fake",
    upstreamModelId,
    adapterId: "fake-text",
    adapterVersion: "1",
    displayName: publicModelId,
    displayTier: publicModelId === "atlas-fast" ? "fast" : "balanced",
    bindingExposure: "product",
    status: "available",
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      maxContextTokens: 16_000,
      maxOutputTokens: 2_000,
    },
    credentialPolicy: "platform",
    dataHandlingProfileId: "test",
    routingPolicyId: "no-fallback",
    allowedDataClasses: ["test"],
    allowedRegions: ["test"],
    providerRegion: "test",
    providerAccountClass: "test",
    priceVersion: "test",
    inputPricePerMtokUsd: 1,
    cacheReadPricePerMtokUsd: null,
    cacheWritePricePerMtokUsd: null,
    outputPricePerMtokUsd: 2,
    reasoningPricePerMtokUsd: null,
  };
}

function eligibleRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register("fake", new FakeModelProvider());
  return registry;
}

function openAiRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register("openai", new FakeModelProvider({
    providerId: "openai",
    adapterId: OPENAI_RESPONSES_TEXT_ADAPTER_ID,
    adapterVersion: OPENAI_RESPONSES_TEXT_ADAPTER_VERSION,
  }));
  return registry;
}

function geminiRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register("gemini", new FakeModelProvider({
    providerId: "gemini",
    adapterId: GEMINI_INTERACTIONS_TEXT_ADAPTER_ID,
    adapterVersion: "1",
  }));
  return registry;
}

function verifiedSession(
  permissionCodes: readonly string[] = [],
): typeof session & { verifiedRequestContext: VerifiedRequestContext } {
  const permissions = {
    planeKey: "neon",
    tenantId: session.tenantId,
    principalId: session.principalId,
    principalFingerprint: "principal-fingerprint",
    allowed: new Set(permissionCodes),
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
      requestId: "request-1",
    },
  };
}

describe("model catalog", () => {
  it("defines stable public Atlas modes with exact Anthropic upstream bindings", () => {
    const bindings = createAnthropicAtlasBindings({
      fastUpstreamModelId: "claude-haiku-4-5-20251001",
      balancedUpstreamModelId: "claude-sonnet-4-6",
      bestUpstreamModelId: "claude-opus-4-8",
    });

    expect(bindings.map((binding) => ({
      public: binding.publicModelId,
      upstream: binding.upstreamModelId,
      provider: binding.providerId,
    }))).toEqual([
      {
        public: "atlas-fast",
        upstream: "claude-haiku-4-5-20251001",
        provider: "anthropic",
      },
      {
        public: "atlas-balanced",
        upstream: "claude-sonnet-4-6",
        provider: "anthropic",
      },
      { public: "atlas-best", upstream: "claude-opus-4-8", provider: "anthropic" },
    ]);
    expect(bindings.map((binding) => ({
      public: binding.publicModelId,
      input: binding.inputPricePerMtokUsd,
      output: binding.outputPricePerMtokUsd,
    }))).toEqual([
      { public: "atlas-fast", input: 1, output: 5 },
      { public: "atlas-balanced", input: 3, output: 15 },
      { public: "atlas-best", input: 5, output: 25 },
    ]);
  });

  it("rejects an upstream id without a reviewed price and capability profile", () => {
    expect(() => createAnthropicAtlasBindings({
      fastUpstreamModelId: "claude-unreviewed",
      balancedUpstreamModelId: "claude-sonnet-4-6",
      bestUpstreamModelId: "claude-opus-4-8",
    })).toThrow(/no reviewed capability and price profile/);
  });

  it("keeps tool-capable bindings eligible for ordinary text requests", async () => {
    const bindings = createAnthropicAtlasBindings({
      fastUpstreamModelId: "claude-haiku-4-5-20251001",
      balancedUpstreamModelId: "claude-sonnet-4-6",
      bestUpstreamModelId: "claude-opus-4-8",
      toolsEnabled: true,
    });
    const registry = new ProviderRegistry();
    registry.register("anthropic", new FakeModelProvider({
      providerId: "anthropic",
      adapterId: bindings[0]!.adapterId,
      adapterVersion: bindings[0]!.adapterVersion,
    }));
    const resolver = createEffectiveModelCatalogResolver({
      registry,
      bindings,
      defaultPublicModelId: "atlas-fast",
      resolvePolicy: () => ({
        revision: "tool-capable-text-policy-v1",
        evaluatePolicy: evaluateAtlasFoundationBindingPolicy,
      }),
    });

    const catalog = await resolver.resolveCatalog(session);

    expect(catalog.default_model_id).toBe("atlas-fast");
    expect(catalog.models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
    ]);
    expect(catalog.models.every((model) => model.capabilities.tools)).toBe(true);
  });

  it("defines one exact, capped, neutral OpenAI evaluation binding", () => {
    const binding = createOpenAiEvalBinding({
      evalUpstreamModelId: "gpt-5.6-sol",
    });

    expect(binding).toMatchObject({
      bindingId: "atlas-openai-eval-openai-v2",
      publicModelId: "atlas-openai-eval",
      providerId: "openai",
      upstreamModelId: "gpt-5.6-sol",
      adapterId: "openai-responses-text",
      adapterVersion: "2",
      dataHandlingProfileId: "openai-platform-responses-store-false-v1",
      bindingExposure: "internal_evaluation",
      allowedDataClasses: ["public"],
      providerRegion: "global",
      providerAccountClass: "platform_unverified",
      capabilities: {
        streaming: true,
        tools: false,
        vision: false,
        maxContextTokens: 200_000,
        maxOutputTokens: 8_192,
      },
      priceVersion: "openai-public-pricing-2026-07-23",
      inputPricePerMtokUsd: 5,
      cacheReadPricePerMtokUsd: 0.5,
      cacheWritePricePerMtokUsd: 6.25,
      outputPricePerMtokUsd: 30,
      reasoningPricePerMtokUsd: 30,
    });
  });

  it("defines exact paid and local-free Gemini evaluation bindings", () => {
    const paid = createGeminiEvalBinding({
      evalUpstreamModelId: "gemini-3.6-flash",
      accountClass: "paid",
      providerRegion: "global",
    });
    const free = createGeminiEvalBinding({
      evalUpstreamModelId: "gemini-3.6-flash",
      accountClass: "free",
      providerRegion: "global",
    });

    expect(paid).toMatchObject({
      bindingId: "atlas-gemini-eval-gemini-v1",
      publicModelId: "atlas-gemini-eval",
      providerId: "gemini",
      upstreamModelId: "gemini-3.6-flash",
      adapterId: "gemini-interactions-text",
      adapterVersion: "1",
      bindingExposure: "internal_evaluation",
      credentialPolicy: "platform",
      providerAccountClass: "platform_paid",
      dataHandlingProfileId:
        "gemini-developer-paid-interactions-store-false-v1",
      allowedDataClasses: ["synthetic"],
      providerRegion: "global",
      capabilities: {
        streaming: true,
        tools: false,
        vision: false,
        maxContextTokens: 200_000,
        maxOutputTokens: 8_192,
      },
      priceVersion: "google-gemini-api-public-pricing-2026-07-23",
      inputPricePerMtokUsd: 1.5,
      cacheReadPricePerMtokUsd: 0.15,
      cacheWritePricePerMtokUsd: null,
      outputPricePerMtokUsd: 7.5,
      reasoningPricePerMtokUsd: 7.5,
    });
    expect(free).toMatchObject({
      credentialPolicy: "local",
      providerAccountClass: "developer_free",
      dataHandlingProfileId:
        "gemini-developer-free-interactions-store-false-v1",
    });
  });

  it("keeps Gemini explicit-only and permission-gated", async () => {
    const resolver = createEffectiveModelCatalogResolver({
      registry: geminiRegistry(),
      bindings: [createGeminiEvalBinding({
        evalUpstreamModelId: "gemini-3.6-flash",
        accountClass: "paid",
        providerRegion: "global",
      })],
      defaultPublicModelId: "atlas-fast",
      resolvePolicy: () => ({
        revision: "gemini-eval-policy-v1",
        evaluatePolicy: evaluateAtlasFoundationBindingPolicy,
      }),
    });

    await expect(resolver.resolveCatalog(session)).resolves.toMatchObject({
      default_model_id: "",
      models: [],
    });
    await expect(resolver.resolveCatalog(
      verifiedSession([OPENAI_PROVIDER_DIAGNOSTICS_PERMISSION]),
    )).resolves.toMatchObject({
      default_model_id: "",
      models: [{
        model_id: "atlas-gemini-eval",
        selection_policy: "explicit_only",
      }],
    });
  });

  it("rejects an unreviewed OpenAI evaluation model", () => {
    expect(() => createOpenAiEvalBinding({
      evalUpstreamModelId: "gpt-future-unreviewed",
    })).toThrow(/no reviewed capability and price profile/);
  });

  it("requires the canonical provider-diagnostics permission for OpenAI", async () => {
    const binding = createOpenAiEvalBinding({
      evalUpstreamModelId: "gpt-5.6-sol",
    });

    expect(evaluateAtlasFoundationBindingPolicy(binding, session)).toEqual({
      allowed: false,
      reason: "provider_diagnostics_permission_required",
    });
    expect(evaluateAtlasFoundationBindingPolicy(
      binding,
      verifiedSession([OPENAI_PROVIDER_DIAGNOSTICS_PERMISSION]),
    )).toEqual({ allowed: true });

    const resolver = createEffectiveModelCatalogResolver({
      registry: openAiRegistry(),
      bindings: [binding],
      // Configuration never permits this internal model to become the product
      // default; use a normal Atlas mode to prove resolver fallback behavior.
      defaultPublicModelId: "atlas-fast",
      resolvePolicy: () => ({
        revision: "openai-eval-policy-v1",
        evaluatePolicy: evaluateAtlasFoundationBindingPolicy,
      }),
    });
    await expect(resolver.resolveCatalog(session)).resolves.toMatchObject({
      default_model_id: "",
      models: [],
    });
    await expect(resolver.resolveCatalog(
      verifiedSession([OPENAI_PROVIDER_DIAGNOSTICS_PERMISSION]),
    )).resolves.toMatchObject({
      default_model_id: "",
      models: [{
        model_id: "atlas-openai-eval",
        selection_policy: "explicit_only",
      }],
    });
  });

  it("keeps provider identity, provider prices, tools and vision out of the public base catalog", () => {
    const models = getRegisteredModels();
    expect(models.map((model) => model.model_id)).toEqual([
      "atlas-fast",
      "atlas-balanced",
      "atlas-best",
    ]);
    expect(models.every((model) => model.provider_id === "atlas")).toBe(true);
    expect(models.every((model) => model.selection_policy === "normal")).toBe(true);
    expect(models.every((model) => model.cost === null)).toBe(true);
    expect(models.every((model) => !model.capabilities.tools)).toBe(true);
    expect(models.every((model) => !model.capabilities.vision)).toBe(true);
  });

  it("returns only bindings backed by an eligible exact adapter", async () => {
    const bindings = [
      fakeBinding("atlas-fast", "fake-fast-v1"),
      {
        ...fakeBinding("atlas-balanced", "other-balanced-v1"),
        providerId: "other",
        adapterId: "other-text",
      },
    ];
    const resolver = createEffectiveModelCatalogResolver({
      registry: eligibleRegistry(),
      bindings,
      defaultPublicModelId: "atlas-balanced",
      ...allowTestPolicy,
    });

    const resolution = await resolver.resolve(session);
    expect(resolution.catalog.models.map((model) => model.model_id)).toEqual(["atlas-fast"]);
    expect(resolution.catalog.default_model_id).toBe("atlas-fast");
    expect(resolution.bindings.map((binding) => binding.upstreamModelId)).toEqual([
      "fake-fast-v1",
    ]);
  });

  it("applies async request policy and derives a revision from its actual snapshot", async () => {
    const resolver = createEffectiveModelCatalogResolver({
      registry: eligibleRegistry(),
      bindings: [fakeBinding("atlas-fast", "fake-fast-v1")],
      defaultPublicModelId: "atlas-fast",
      resolvePolicy: async (requestSession) => ({
        revision: `tenant-policy-42:${requestSession.tenantId}`,
        evaluatePolicy: async () => ({
          allowed: requestSession.tenantId === "allowed-tenant",
        }),
      }),
    });

    const denied = await resolver.resolve({
      ...session,
      tenantId: "denied-tenant",
    });
    expect(denied).toMatchObject({
      catalog: {
        default_model_id: "",
        models: [],
      },
      bindings: [],
    });
    const allowed = await resolver.resolve({
      ...session,
      tenantId: "allowed-tenant",
    });
    expect(allowed.catalog.default_model_id).toBe("atlas-fast");
    expect(allowed.policyRevision).toMatch(/^atlas-base-[a-f0-9]{16}$/);
    expect(allowed.policyRevision).not.toBe(denied.policyRevision);
  });

  it("changes the default policy revision when an exact binding changes", async () => {
    const first = createEffectiveModelCatalogResolver({
      registry: eligibleRegistry(),
      bindings: [fakeBinding("atlas-fast", "fake-fast-v1")],
      defaultPublicModelId: "atlas-fast",
      ...allowTestPolicy,
    });
    const second = createEffectiveModelCatalogResolver({
      registry: eligibleRegistry(),
      bindings: [fakeBinding("atlas-fast", "fake-fast-v2")],
      defaultPublicModelId: "atlas-fast",
      ...allowTestPolicy,
    });

    expect((await first.resolve(session)).policyRevision).not.toBe(
      (await second.resolve(session)).policyRevision,
    );
  });

  it("binds exposure and provider account class into the policy revision", async () => {
    const base = fakeBinding("atlas-fast", "fake-fast-v1");
    const product = createEffectiveModelCatalogResolver({
      registry: eligibleRegistry(),
      bindings: [base],
      defaultPublicModelId: "atlas-fast",
      ...allowTestPolicy,
    });
    const internal = createEffectiveModelCatalogResolver({
      registry: eligibleRegistry(),
      bindings: [{
        ...base,
        bindingExposure: "internal_evaluation",
        providerAccountClass: "developer_free",
      }],
      defaultPublicModelId: "atlas-fast",
      ...allowTestPolicy,
    });

    expect((await product.resolve(session)).policyRevision).not.toBe(
      (await internal.resolve(session)).policyRevision,
    );
  });

  it("rejects invalid exposure and account-class metadata at construction", () => {
    expect(() => createEffectiveModelCatalogResolver({
      registry: eligibleRegistry(),
      bindings: [{
        ...fakeBinding("atlas-fast", "fake-fast-v1"),
        bindingExposure: "invalid",
      } as unknown as AtlasModelBinding],
      defaultPublicModelId: "atlas-fast",
      ...allowTestPolicy,
    })).toThrow(/invalid binding exposure/);

    expect(() => createEffectiveModelCatalogResolver({
      registry: eligibleRegistry(),
      bindings: [{
        ...fakeBinding("atlas-fast", "fake-fast-v1"),
        providerAccountClass: "invalid",
      } as unknown as AtlasModelBinding],
      defaultPublicModelId: "atlas-fast",
      ...allowTestPolicy,
    })).toThrow(/invalid provider account class/);
  });

  it("fails closed when the compatibility resolver is called without an operational resolver", async () => {
    await expect(resolveEffectiveCatalog(session)).resolves.toEqual({
      default_model_id: "",
      models: [],
      policy_revision: "unavailable",
    });
  });

  it("fails closed when no binding policy resolver is configured", async () => {
    const resolver = createEffectiveModelCatalogResolver({
      registry: eligibleRegistry(),
      bindings: [fakeBinding("atlas-fast", "fake-fast-v1")],
      defaultPublicModelId: "atlas-fast",
    });

    expect((await resolver.resolve(session)).catalog).toMatchObject({
      default_model_id: "",
      models: [],
    });
  });

  it("rejects ambiguous eligible bindings for one public model", async () => {
    const resolver = createEffectiveModelCatalogResolver({
      registry: eligibleRegistry(),
      bindings: [
        fakeBinding("atlas-fast", "fake-fast-v1"),
        {
          ...fakeBinding("atlas-fast", "fake-fast-v2"),
          bindingId: "atlas-fast-fake-v2",
        },
      ],
      defaultPublicModelId: "atlas-fast",
      ...allowTestPolicy,
    });

    await expect(resolver.resolve(session)).rejects.toThrow(
      /Ambiguous eligible Atlas bindings/,
    );
  });
});
