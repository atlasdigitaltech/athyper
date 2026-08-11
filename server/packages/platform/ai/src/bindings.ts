import type { AtlasModelBinding, AtlasModelProvider, AtlasProviderId, AtlasPublicModelId } from "@athyper/server-contract-ai";
import { AtlasServiceError } from "./errors.js";

function providerKey(providerId: AtlasProviderId, adapterId: string, adapterVersion: string): string {
  return `${providerId}\u0000${adapterId}\u0000${adapterVersion}`;
}

export class AtlasProviderRegistry {
  private readonly providers = new Map<string, AtlasModelProvider>();
  constructor(providers: readonly AtlasModelProvider[]) {
    for (const provider of providers) {
      const key = providerKey(provider.providerId, provider.adapterId, provider.adapterVersion);
      if (this.providers.has(key)) throw new TypeError(`Duplicate Atlas provider adapter: ${provider.adapterId}@${provider.adapterVersion}`);
      this.providers.set(key, provider);
    }
  }
  resolve(binding: AtlasModelBinding): AtlasModelProvider {
    const provider = this.providers.get(providerKey(binding.providerId, binding.adapterId, binding.adapterVersion));
    if (!provider) throw new AtlasServiceError("PROVIDER_UNAVAILABLE", "The exact Atlas provider adapter is unavailable.");
    return provider;
  }
}

export class AtlasBindingRegistry {
  private readonly byPublicModel = new Map<AtlasPublicModelId, AtlasModelBinding>();
  constructor(bindings: readonly AtlasModelBinding[]) {
    for (const binding of bindings) {
      validateBinding(binding);
      if (this.byPublicModel.has(binding.publicModelId)) throw new TypeError(`Ambiguous Atlas public model binding: ${binding.publicModelId}`);
      this.byPublicModel.set(binding.publicModelId, Object.freeze({ ...binding }));
    }
  }
  resolve(publicModelId: AtlasPublicModelId): AtlasModelBinding {
    const binding = this.byPublicModel.get(publicModelId);
    if (!binding || binding.status !== "available") throw new AtlasServiceError("MODEL_NOT_AVAILABLE", "The requested Atlas model is not available.");
    return binding;
  }
  list(): readonly AtlasModelBinding[] { return Object.freeze([...this.byPublicModel.values()]); }
}

function validateBinding(binding: AtlasModelBinding): void {
  const required = [binding.bindingId, binding.bindingRevision, binding.publicModelId, binding.upstreamModelId, binding.adapterId, binding.adapterVersion, binding.credentialOwnerId, binding.providerRegion, binding.dataHandlingProfileId, binding.priceVersion];
  if (required.some((value) => !value.trim())) throw new TypeError("Atlas model bindings require exact non-empty identifiers.");
  if (binding.routingPolicyId !== "no-fallback-v1") throw new TypeError("Atlas bindings must use the explicit no-fallback routing policy.");
  if (binding.capabilities.maxContextTokens < 1 || binding.capabilities.maxOutputTokens < 1) throw new TypeError("Atlas model token limits must be positive.");
}
