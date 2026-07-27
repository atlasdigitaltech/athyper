import { z } from "zod";

/**
 * Model catalog descriptor — the shape returned from
 * `GET /api/ai/agent/models` and consumed by the Atlas public-mode resolver.
 *
 * Keep this DOM-free: it must import cleanly into both server and browser
 * bundles.  Do not add React or fetch dependencies here.
 */

export type KnownProviderId = "anthropic" | "openai" | "gemini" | "atlas";
/**
 * Provider IDs are server-owned diagnostics. Keep the client tolerant of a
 * newly introduced provider so a catalog refresh cannot crash the Atlas UI.
 */
export type ProviderId = KnownProviderId | (string & {});
/**
 * `smart` is accepted for compatibility with the pre-foundation catalog.
 * Customer-facing code maps it to the stable `best` Atlas mode.
 */
export type ModelTier = "fast" | "balanced" | "best" | "smart";
export type ModelStatus = "available" | "coming_soon" | "restricted";
export type ModelSelectionPolicy = "normal" | "explicit_only";

/** Safe label for internal diagnostics; unknown providers stay generic. */
export function providerDisplayName(providerId: ProviderId): string {
  switch (providerId) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "gemini":
      return "Gemini";
    case "atlas":
      return "Atlas";
    default:
      return "Model provider";
  }
}

export interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  max_context_tokens: number;
  max_output_tokens: number;
}

export interface ModelCost {
  input_per_mtok_usd: number;
  output_per_mtok_usd: number;
}

export interface ModelDescriptor {
  provider_id: ProviderId;
  model_id: string;
  display_name: string;
  /** Diagnostic icon key; normal customer UI does not expose provider identity. */
  icon_key: string;
  tier: ModelTier;
  status: ModelStatus;
  /**
   * `explicit_only` models can be selected by an authorized caller but are
   * never chosen as an implicit tier/default fallback.
   */
  selection_policy: ModelSelectionPolicy;
  capabilities: ModelCapabilities;
  cost: ModelCost | null;
  restricted_reason?: string;
}

export interface ModelCatalog {
  /** Tenant-effective policy revision used to reject stale run requests. */
  policy_revision: string;
  default_model_id: string;
  models: ModelDescriptor[];
}

export const ModelDescriptorSchema = z.object({
  provider_id: z.string().trim().min(1).max(100),
  model_id: z.string().trim().min(1).max(200),
  display_name: z.string().trim().min(1).max(200),
  icon_key: z.string().trim().min(1).max(100),
  tier: z.enum(["fast", "balanced", "best", "smart"]),
  status: z.enum(["available", "coming_soon", "restricted"]),
  selection_policy: z.enum(["normal", "explicit_only"]),
  capabilities: z.object({
    streaming: z.boolean(),
    tools: z.boolean(),
    vision: z.boolean(),
    max_context_tokens: z.number().int().nonnegative(),
    max_output_tokens: z.number().int().nonnegative(),
  }).strict(),
  cost: z.object({
    input_per_mtok_usd: z.number().nonnegative(),
    output_per_mtok_usd: z.number().nonnegative(),
  }).strict().nullable(),
  restricted_reason: z.string().max(500).optional(),
}).strict();

export const ModelCatalogSchema = z.object({
  policy_revision: z.string().trim().min(1).max(200),
  default_model_id: z.string().max(200),
  models: z.array(ModelDescriptorSchema).max(100),
}).strict();
