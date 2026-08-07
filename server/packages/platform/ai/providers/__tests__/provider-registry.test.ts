import { describe, expect, it } from "vitest";
import { FakeModelProvider } from "../fake-model.provider.js";
import type {
  AtlasModelBinding,
  ProviderOperationalState,
} from "../i-model-provider.js";
import { ProviderRegistry } from "../provider-registry.js";
import { OpenAiTextProvider } from "../openai-text.provider.js";
import { GeminiTextProvider } from "../gemini-text.provider.js";

function binding(overrides: Partial<AtlasModelBinding> = {}): AtlasModelBinding {
  return {
    bindingId: "atlas-fast-fake-v1",
    publicModelId: "atlas-fast",
    providerId: "fake",
    upstreamModelId: "fake-fast-v1",
    adapterId: "fake-text",
    adapterVersion: "1",
    displayName: "Atlas Fast",
    displayTier: "fast",
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
    inputPricePerMtokUsd: null,
    cacheReadPricePerMtokUsd: null,
    cacheWritePricePerMtokUsd: null,
    outputPricePerMtokUsd: null,
    reasoningPricePerMtokUsd: null,
    ...overrides,
  };
}

describe("ProviderRegistry", () => {
  it("resolves an exact eligible provider and adapter binding", () => {
    const registry = new ProviderRegistry();
    const provider = new FakeModelProvider();
    registry.register("fake", provider);

    const resolved = registry.resolve(binding());

    expect(resolved).toMatchObject({
      providerId: "fake",
      adapterId: "fake-text",
      adapterVersion: "1",
    });
    expect(resolved?.provider).toBe(provider);
    expect(resolved?.binding.upstreamModelId).toBe("fake-fast-v1");
  });

  it.each([
    ["wrong provider", { providerId: "other" }],
    ["wrong adapter", { adapterId: "other-adapter" }],
    ["wrong adapter version", { adapterVersion: "2" }],
    ["disabled binding", { status: "disabled" as const }],
    ["non-streaming binding", {
      capabilities: {
        streaming: false,
        tools: false,
        vision: false,
        maxContextTokens: 16_000,
        maxOutputTokens: 2_000,
      },
    }],
  ])("fails closed for %s", (_label, overrides) => {
    const registry = new ProviderRegistry();
    registry.register("fake", new FakeModelProvider());
    expect(registry.resolve(binding(overrides))).toBeNull();
  });

  it("does not make an adapter eligible unless it declares full operational state", () => {
    const state: ProviderOperationalState = {
      implemented: true,
      credentialed: false,
      healthy: true,
      eligible: true,
      reason: "missing_credential",
    };
    const registry = new ProviderRegistry();
    registry.register("fake", new FakeModelProvider({ operationalState: state }));

    expect(registry.isBindingEligible(binding())).toBe(false);
    expect(registry.hasEligibleBinding([binding()])).toBe(false);
  });

  it("keeps hosted adapters ineligible until readiness is checked", () => {
    const registry = new ProviderRegistry();
    const openai = new OpenAiTextProvider({
      apiKey: "configured-but-not-live-verified",
      defaultModelId: "gpt-5.6-sol",
      timeoutMs: 60_000,
    });
    const gemini = new GeminiTextProvider({
      apiKey: "configured-but-not-live-verified",
      defaultModelId: "gemini-3.6-flash",
      timeoutMs: 60_000,
      projectId: "athyper-atlas-eval",
      providerRegion: "global",
      providerAccountClass: "test",
    });
    registry.register("openai", openai);
    registry.register("gemini", gemini);

    expect(openai.operationalState).toMatchObject({
      implemented: true,
      credentialed: true,
      healthy: false,
      eligible: false,
      reason: "readiness_not_checked",
    });
    expect(gemini.operationalState).toMatchObject({
      implemented: true,
      credentialed: true,
      healthy: false,
      eligible: false,
      reason: "readiness_not_checked",
    });
    expect(registry.listRegistrations().every((entry) => !entry.state.eligible)).toBe(true);
  });

  it("accepts a live-verified OpenAI adapter only through an explicit state override", () => {
    const registry = new ProviderRegistry();
    const openai = new OpenAiTextProvider({
      defaultModelId: "gpt-5.6-sol",
      timeoutMs: 60_000,
    });
    registry.register("openai", openai, {
      implemented: true,
      credentialed: true,
      healthy: true,
      eligible: true,
      reason: "ready",
    });

    expect(registry.resolve(binding({
      bindingId: "atlas-openai-eval-openai-v2",
      publicModelId: "atlas-openai-eval",
      providerId: "openai",
      upstreamModelId: "gpt-5.6-sol",
      adapterId: "openai-responses-text",
      adapterVersion: "2",
    }))).toMatchObject({
      providerId: "openai",
      adapterId: "openai-responses-text",
      adapterVersion: "2",
    });
  });

  it("rejects duplicate provider/adapter registrations", () => {
    const registry = new ProviderRegistry();
    registry.register("fake", new FakeModelProvider());
    expect(() => registry.register("fake", new FakeModelProvider())).toThrow(
      /duplicate provider\/adapter registration/,
    );
  });

  it("removes a binding from eligibility when runtime health is revoked", () => {
    const registry = new ProviderRegistry();
    registry.register("fake", new FakeModelProvider());

    expect(registry.updateOperationalState("fake", "fake-text", {
      implemented: true,
      credentialed: false,
      healthy: false,
      eligible: false,
      reason: "credential_authentication",
    })).toBe(true);
    expect(registry.resolve(binding())).toBeNull();
  });
});
