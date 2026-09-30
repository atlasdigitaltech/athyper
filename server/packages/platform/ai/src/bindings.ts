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
  private readonly byBindingId = new Map<string, AtlasModelBinding>();
  constructor(bindings: readonly AtlasModelBinding[]) {
    for (const binding of bindings) {
      validateBinding(binding);
      if(this.byBindingId.has(binding.bindingId))throw new TypeError(`Duplicate Atlas binding id: ${binding.bindingId}`);
      const frozen=Object.freeze({ ...binding });this.byBindingId.set(binding.bindingId,frozen);
      if(binding.exposure==="product"){if (this.byPublicModel.has(binding.publicModelId)) throw new TypeError(`Ambiguous Atlas public model binding: ${binding.publicModelId}`);this.byPublicModel.set(binding.publicModelId,frozen);}
    }
    for(const binding of this.byBindingId.values())for(const id of binding.fallbackBindingIds??[]){const fallback=this.byBindingId.get(id);if(!fallback)throw new TypeError(`Unknown Atlas fallback binding: ${id}`);if(fallback.publicModelId!==binding.publicModelId)throw new TypeError("Atlas fallback bindings must preserve the public model id.");}
  }
  resolve(publicModelId: AtlasPublicModelId): AtlasModelBinding {
    const binding = this.byPublicModel.get(publicModelId);
    if (!binding || binding.status !== "available") throw new AtlasServiceError("MODEL_NOT_AVAILABLE", "The requested Atlas model is not available.");
    return binding;
  }
  list(): readonly AtlasModelBinding[] { return Object.freeze([...this.byPublicModel.values()]); }
  resolveChain(binding:AtlasModelBinding):readonly AtlasModelBinding[]{return Object.freeze([binding,...(binding.fallbackBindingIds??[]).map(id=>this.byBindingId.get(id)!)]);}
}

function validateBinding(binding: AtlasModelBinding): void {
  if(binding.providerId==="ollama"&&(binding.credentialPolicy!=="local_transport"||binding.routingPolicyId!=="no-fallback-v1"||binding.fallbackBindingIds?.length||!/^sha256:[a-f0-9]{64}$/.test(binding.modelDigest??""))) throw new TypeError("Local Atlas bindings require a digest and prohibit fallback.");
  if(binding.providerId!=="ollama"&&binding.credentialPolicy==="local_transport")throw new TypeError("Local transport cannot authenticate cloud providers.");
  const required = [binding.bindingId, binding.bindingRevision, binding.publicModelId, binding.upstreamModelId, binding.adapterId, binding.adapterVersion, binding.credentialOwnerId, binding.providerRegion, binding.dataHandlingProfileId, binding.priceVersion];
  if (required.some((value) => !value.trim())) throw new TypeError("Atlas model bindings require exact non-empty identifiers.");
  if(binding.routingPolicyId==="no-fallback-v1"&&(binding.fallbackBindingIds?.length??0)>0)throw new TypeError("No-fallback Atlas bindings cannot declare fallback bindings.");
  if(binding.routingPolicyId==="ordered-failover-v1"&&!(binding.fallbackBindingIds?.length))throw new TypeError("Ordered Atlas failover requires at least one fallback binding.");
  if (binding.capabilities.maxContextTokens < 1 || binding.capabilities.maxOutputTokens < 1) throw new TypeError("Atlas model token limits must be positive.");
}
