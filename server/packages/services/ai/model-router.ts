/**
 * ModelRouter — picks the lowest-cost provider whose capabilities are a
 * strict superset of the action's requirements.
 *
 * Routing failures throw NO_PROVIDER_MATCHES_CAPABILITIES; they never
 * silently fall through to a wrong provider.
 *
 * Usage:
 *   const router = new ModelRouter([visionProvider, textProvider, embeddingsProvider]);
 *   const provider = router.pick({ supports_vision: true });
 *   const response = await provider.invoke(prompt);
 */

import type { IModelProvider, ProviderCapabilities } from "./providers/i-model-provider.js";

type CapabilityRequirements = Partial<Pick<
  ProviderCapabilities,
  | "supports_vision"
  | "supports_pdf_native"
  | "supports_json_schema"
  | "supports_tool_calling"
  | "supports_embeddings"
>>;

export class ModelRouter {
  constructor(private readonly providers: readonly IModelProvider[]) {
    if (providers.length === 0) {
      throw new Error("ModelRouter: no providers registered");
    }
  }

  pick(requirements: CapabilityRequirements = {}): IModelProvider {
    const candidates = this.providers.filter((p) => this._satisfies(p, requirements));

    if (candidates.length === 0) {
      throw new Error(
        `NO_PROVIDER_MATCHES_CAPABILITIES: no registered provider satisfies ` +
        JSON.stringify(requirements),
      );
    }

    // Prefer the cheapest provider that satisfies requirements.
    // If cost is equal, prefer the one with higher max_context_tokens.
    candidates.sort((a, b) => {
      const costA = a.capabilities.cost_per_1k_input_tokens + a.capabilities.cost_per_1k_output_tokens;
      const costB = b.capabilities.cost_per_1k_input_tokens + b.capabilities.cost_per_1k_output_tokens;
      if (costA !== costB) return costA - costB;
      return b.capabilities.max_context_tokens - a.capabilities.max_context_tokens;
    });

    return candidates[0]!;
  }

  // Returns the provider registered under the given modelId, or throws.
  pickById(modelId: string): IModelProvider {
    const provider = this.providers.find((p) => p.modelId === modelId);
    if (!provider) {
      throw new Error(`NO_PROVIDER_MATCHES_CAPABILITIES: no provider with modelId "${modelId}"`);
    }
    return provider;
  }

  list(): readonly IModelProvider[] {
    return this.providers;
  }

  private _satisfies(provider: IModelProvider, req: CapabilityRequirements): boolean {
    const caps = provider.capabilities;
    if (req.supports_vision     && !caps.supports_vision)     return false;
    if (req.supports_pdf_native && !caps.supports_pdf_native) return false;
    if (req.supports_json_schema && !caps.supports_json_schema) return false;
    if (req.supports_tool_calling && !caps.supports_tool_calling) return false;
    if (req.supports_embeddings  && !caps.supports_embeddings)  return false;
    return true;
  }
}
