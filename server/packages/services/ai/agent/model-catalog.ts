/**
 * Tenant-effective Atlas catalog and exact model-binding resolution.
 *
 * The public catalog deliberately exposes Atlas product modes, not provider
 * model IDs. Both the models route and AgentRuntime must share one resolver
 * instance so catalog visibility and run eligibility cannot diverge.
 */

import { createHash } from "node:crypto";
import type {
  ModelCatalog,
  ModelDescriptor,
} from "@athyper/atlas-agent-runtime";
import type {
  AtlasModelBinding,
} from "../providers/i-model-provider.js";
import { withAtlasSpan } from "./atlas-telemetry.js";
import type { ProviderRegistry } from "../providers/provider-registry.js";
import type { VerifiedRequestContext } from "@athyper/svc-iam";

export const CLAUDE_TEXT_ADAPTER_ID = "anthropic-messages-text";
export const CLAUDE_TEXT_ADAPTER_VERSION = "2";
export const OPENAI_RESPONSES_TEXT_ADAPTER_ID = "openai-responses-text";
export const OPENAI_RESPONSES_TEXT_ADAPTER_VERSION = "2";
export const OPENAI_EVAL_PUBLIC_MODEL_ID = "atlas-openai-eval";
export const GEMINI_INTERACTIONS_TEXT_ADAPTER_ID = "gemini-interactions-text";
export const GEMINI_INTERACTIONS_TEXT_ADAPTER_VERSION = "1";
export const GEMINI_EVAL_PUBLIC_MODEL_ID = "atlas-gemini-eval";
export const ATLAS_PROVIDER_DIAGNOSTICS_PERMISSION =
  "ai.agent.provider_diagnostics";
export const OPENAI_PROVIDER_DIAGNOSTICS_PERMISSION =
  ATLAS_PROVIDER_DIAGNOSTICS_PERMISSION;
const ANTHROPIC_ATLAS_MODEL_PROFILES = {
  "claude-haiku-4-5-20251001": {
    tier: "fast",
    inputPricePerMtokUsd: 1,
    cacheReadPricePerMtokUsd: null,
    cacheWritePricePerMtokUsd: null,
    outputPricePerMtokUsd: 5,
    reasoningPricePerMtokUsd: null,
    priceVersion: "anthropic-public-pricing-2026-07-23",
  },
  "claude-sonnet-4-6": {
    tier: "balanced",
    inputPricePerMtokUsd: 3,
    cacheReadPricePerMtokUsd: null,
    cacheWritePricePerMtokUsd: null,
    outputPricePerMtokUsd: 15,
    reasoningPricePerMtokUsd: null,
    priceVersion: "anthropic-public-pricing-2026-07-23",
  },
  "claude-opus-4-8": {
    tier: "best",
    inputPricePerMtokUsd: 5,
    cacheReadPricePerMtokUsd: null,
    cacheWritePricePerMtokUsd: null,
    outputPricePerMtokUsd: 25,
    reasoningPricePerMtokUsd: null,
    priceVersion: "anthropic-public-pricing-2026-07-23",
  },
} as const;

const OPENAI_ATLAS_EVAL_MODEL_PROFILES = {
  "gpt-5.6-sol": {
    inputPricePerMtokUsd: 5,
    cacheReadPricePerMtokUsd: 0.5,
    cacheWritePricePerMtokUsd: 6.25,
    outputPricePerMtokUsd: 30,
    reasoningPricePerMtokUsd: 30,
    priceVersion: "openai-public-pricing-2026-07-23",
  },
} as const;

const GEMINI_ATLAS_EVAL_MODEL_PROFILES = {
  "gemini-3.6-flash": {
    inputPricePerMtokUsd: 1.5,
    cacheReadPricePerMtokUsd: 0.15,
    cacheWritePricePerMtokUsd: null,
    outputPricePerMtokUsd: 7.5,
    reasoningPricePerMtokUsd: 7.5,
    priceVersion: "google-gemini-api-public-pricing-2026-07-23",
  },
} as const;

type AnthropicAtlasModelId = keyof typeof ANTHROPIC_ATLAS_MODEL_PROFILES;
type OpenAiAtlasEvalModelId = keyof typeof OPENAI_ATLAS_EVAL_MODEL_PROFILES;
type GeminiAtlasEvalModelId = keyof typeof GEMINI_ATLAS_EVAL_MODEL_PROFILES;
type AtlasDisplayTier = "fast" | "balanced" | "best";

export interface CatalogSession {
  tenantId: string;
  principalId: string;
  plane: string;
  /**
   * Exact canonical context from the authenticated route. Future tenant
   * policy, data-classification and governed-tool checks can consume it
   * without rebuilding authorization from client-provided fields.
   */
  verifiedRequestContext?: VerifiedRequestContext;
}

export interface AnthropicAtlasBindingConfig {
  fastUpstreamModelId: string;
  balancedUpstreamModelId: string;
  bestUpstreamModelId: string;
  /** Environment-reviewed adapter capability; tenant execution is gated later. */
  toolsEnabled?: boolean;
}

export interface OpenAiAtlasEvalBindingConfig {
  evalUpstreamModelId: string;
  /** Environment-reviewed adapter capability; tenant execution is gated later. */
  toolsEnabled?: boolean;
}

export interface GeminiAtlasEvalBindingConfig {
  evalUpstreamModelId: string;
  accountClass: "free" | "paid";
  providerRegion: "global";
}

export interface AtlasBindingPolicyDecision {
  allowed: boolean;
  reason?: string;
}

export type AtlasBindingPolicyEvaluator = (
  binding: AtlasModelBinding,
  session: CatalogSession,
) => AtlasBindingPolicyDecision | Promise<AtlasBindingPolicyDecision>;

export interface AtlasBindingPolicySnapshot {
  /**
   * Revision of the actual tenant/plan/budget/rollout decision inputs used
   * for this request. It is combined with the exact binding inventory.
   */
  revision: string;
  evaluatePolicy: AtlasBindingPolicyEvaluator;
}

export type AtlasBindingPolicyResolver = (
  session: CatalogSession,
) => AtlasBindingPolicySnapshot | Promise<AtlasBindingPolicySnapshot>;

export interface EffectiveModelCatalogResolution {
  catalog: ModelCatalog;
  bindings: readonly AtlasModelBinding[];
  policyRevision: string;
}

export interface EffectiveModelCatalogResolver {
  resolve(session: CatalogSession): Promise<EffectiveModelCatalogResolution>;
  resolveCatalog(session: CatalogSession): Promise<ModelCatalog>;
  hasAnyOperationalBinding(): boolean;
}

export interface EffectiveModelCatalogResolverOptions {
  registry: ProviderRegistry;
  bindings: readonly AtlasModelBinding[];
  defaultPublicModelId: string;
  /**
   * Resolves a versioned, request-effective policy snapshot. Omitting it is
   * permitted only as a fail-closed construction path for tests/readiness.
   */
  resolvePolicy?: AtlasBindingPolicyResolver;
}

export function createAnthropicAtlasBindings(
  config: AnthropicAtlasBindingConfig,
): AtlasModelBinding[] {
  return [
    anthropicBinding({
      bindingId: "atlas-fast-anthropic-v2",
      publicModelId: "atlas-fast",
      upstreamModelId: requiredModelId(config.fastUpstreamModelId, "fastUpstreamModelId"),
      displayName: "Atlas Fast",
      displayTier: "fast",
      toolsEnabled: config.toolsEnabled === true,
    }),
    anthropicBinding({
      bindingId: "atlas-balanced-anthropic-v2",
      publicModelId: "atlas-balanced",
      upstreamModelId: requiredModelId(
        config.balancedUpstreamModelId,
        "balancedUpstreamModelId",
      ),
      displayName: "Atlas Balanced",
      displayTier: "balanced",
      toolsEnabled: config.toolsEnabled === true,
    }),
    anthropicBinding({
      bindingId: "atlas-best-anthropic-v2",
      publicModelId: "atlas-best",
      upstreamModelId: requiredModelId(config.bestUpstreamModelId, "bestUpstreamModelId"),
      displayName: "Atlas Best",
      displayTier: "best",
      toolsEnabled: config.toolsEnabled === true,
    }),
  ];
}

export function createOpenAiEvalBinding(
  config: OpenAiAtlasEvalBindingConfig,
): AtlasModelBinding {
  const upstreamModelId = requiredModelId(
    config.evalUpstreamModelId,
    "evalUpstreamModelId",
  );
  const profile = reviewedOpenAiEvalModelProfile(upstreamModelId);
  return {
    bindingId: "atlas-openai-eval-openai-v2",
    publicModelId: OPENAI_EVAL_PUBLIC_MODEL_ID,
    upstreamModelId,
    displayName: "Atlas OpenAI Evaluation",
    displayTier: "best",
    bindingExposure: "internal_evaluation",
    providerId: "openai",
    adapterId: OPENAI_RESPONSES_TEXT_ADAPTER_ID,
    adapterVersion: OPENAI_RESPONSES_TEXT_ADAPTER_VERSION,
    status: "available",
    capabilities: {
      streaming: true,
      tools: config.toolsEnabled === true,
      vision: false,
      // Keep this profile out of OpenAI's >272K tiered input-pricing range.
      maxContextTokens: 200_000,
      maxOutputTokens: 8_192,
    },
    credentialPolicy: "platform",
    // `store: false` is an explicit request property. This neutral profile
    // deliberately makes no ZDR, retention, residency, or enterprise-contract
    // claim beyond that request behavior.
    dataHandlingProfileId: "openai-platform-responses-store-false-v1",
    routingPolicyId: "no-fallback-v1",
    allowedDataClasses: ["public"],
    allowedRegions: ["global"],
    providerRegion: "global",
    providerAccountClass: "platform_unverified",
    priceVersion: profile.priceVersion,
    inputPricePerMtokUsd: profile.inputPricePerMtokUsd,
    cacheReadPricePerMtokUsd: profile.cacheReadPricePerMtokUsd,
    cacheWritePricePerMtokUsd: profile.cacheWritePricePerMtokUsd,
    outputPricePerMtokUsd: profile.outputPricePerMtokUsd,
    reasoningPricePerMtokUsd: profile.reasoningPricePerMtokUsd,
  };
}

export function createGeminiEvalBinding(
  config: GeminiAtlasEvalBindingConfig,
): AtlasModelBinding {
  const upstreamModelId = requiredModelId(
    config.evalUpstreamModelId,
    "evalUpstreamModelId",
  );
  const profile = reviewedGeminiEvalModelProfile(upstreamModelId);
  const isPaid = config.accountClass === "paid";
  return {
    bindingId: "atlas-gemini-eval-gemini-v1",
    publicModelId: GEMINI_EVAL_PUBLIC_MODEL_ID,
    upstreamModelId,
    displayName: "Atlas Gemini Evaluation",
    displayTier: "best",
    bindingExposure: "internal_evaluation",
    providerId: "gemini",
    adapterId: GEMINI_INTERACTIONS_TEXT_ADAPTER_ID,
    adapterVersion: GEMINI_INTERACTIONS_TEXT_ADAPTER_VERSION,
    status: "available",
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      maxContextTokens: 200_000,
      maxOutputTokens: 8_192,
    },
    credentialPolicy: isPaid ? "platform" : "local",
    dataHandlingProfileId: isPaid
      ? "gemini-developer-paid-interactions-store-false-v1"
      : "gemini-developer-free-interactions-store-false-v1",
    routingPolicyId: "no-fallback-v1",
    allowedDataClasses: ["synthetic"],
    allowedRegions: [config.providerRegion],
    providerRegion: config.providerRegion,
    providerAccountClass: isPaid ? "platform_paid" : "developer_free",
    priceVersion: profile.priceVersion,
    inputPricePerMtokUsd: profile.inputPricePerMtokUsd,
    cacheReadPricePerMtokUsd: profile.cacheReadPricePerMtokUsd,
    cacheWritePricePerMtokUsd: profile.cacheWritePricePerMtokUsd,
    outputPricePerMtokUsd: profile.outputPricePerMtokUsd,
    reasoningPricePerMtokUsd: profile.reasoningPricePerMtokUsd,
  };
}

export function getRegisteredModelBindings(): AtlasModelBinding[] {
  return createAnthropicAtlasBindings({
    fastUpstreamModelId: "claude-haiku-4-5-20251001",
    balancedUpstreamModelId: "claude-sonnet-4-6",
    bestUpstreamModelId: "claude-opus-4-8",
  });
}

/**
 * Binding/data-handling policy shared by every admitted plane. Plane
 * admission is resolved separately by the server-owned plane policy and wraps
 * this evaluator before a binding can enter the effective catalog.
 *
 * `capabilities.tools` describes an adapter/model capability. It is not a
 * request authorization flag: the authenticated route and governed executor
 * separately resolve whether tools are effective for a request.
 */
export const evaluateAtlasFoundationBindingPolicy: AtlasBindingPolicyEvaluator = (
  binding,
  session,
) => {
  if (
    binding.routingPolicyId !== "no-fallback-v1"
    || binding.providerRegion !== "global"
    || !binding.allowedRegions.includes("global")
    || !binding.capabilities.streaming
    || binding.capabilities.vision
  ) {
    return { allowed: false, reason: "binding_outside_foundation_policy" };
  }
  if (
    binding.providerId === "anthropic"
    && binding.credentialPolicy === "platform"
    && binding.bindingExposure === "product"
    && binding.providerAccountClass === "platform_unverified"
    && binding.adapterId === CLAUDE_TEXT_ADAPTER_ID
    && binding.adapterVersion === CLAUDE_TEXT_ADAPTER_VERSION
    && binding.dataHandlingProfileId === "anthropic-platform-messages-v1"
  ) {
    return { allowed: true };
  }
  if (
    binding.providerId === "openai"
    && binding.credentialPolicy === "platform"
    && binding.bindingExposure === "internal_evaluation"
    && binding.providerAccountClass === "platform_unverified"
    && binding.publicModelId === OPENAI_EVAL_PUBLIC_MODEL_ID
    && binding.upstreamModelId === "gpt-5.6-sol"
    && binding.adapterId === OPENAI_RESPONSES_TEXT_ADAPTER_ID
    && binding.adapterVersion === OPENAI_RESPONSES_TEXT_ADAPTER_VERSION
    && binding.dataHandlingProfileId
      === "openai-platform-responses-store-false-v1"
  ) {
    return hasCanonicalPermission(
      session,
      OPENAI_PROVIDER_DIAGNOSTICS_PERMISSION,
    )
      ? { allowed: true }
      : {
          allowed: false,
          reason: "provider_diagnostics_permission_required",
        };
  }
  if (
    binding.providerId === "gemini"
    && binding.publicModelId === GEMINI_EVAL_PUBLIC_MODEL_ID
    && binding.upstreamModelId === "gemini-3.6-flash"
    && binding.bindingExposure === "internal_evaluation"
    && binding.adapterId === GEMINI_INTERACTIONS_TEXT_ADAPTER_ID
    && binding.adapterVersion === GEMINI_INTERACTIONS_TEXT_ADAPTER_VERSION
    && binding.allowedDataClasses.length === 1
    && binding.allowedDataClasses[0] === "synthetic"
    && (
      (
        binding.providerAccountClass === "platform_paid"
        && binding.credentialPolicy === "platform"
        && binding.dataHandlingProfileId
          === "gemini-developer-paid-interactions-store-false-v1"
      )
      || (
        binding.providerAccountClass === "developer_free"
        && binding.credentialPolicy === "local"
        && binding.dataHandlingProfileId
          === "gemini-developer-free-interactions-store-false-v1"
      )
    )
  ) {
    return hasCanonicalPermission(
      session,
      ATLAS_PROVIDER_DIAGNOSTICS_PERMISSION,
    )
      ? { allowed: true }
      : {
          allowed: false,
          reason: "provider_diagnostics_permission_required",
        };
  }
  return { allowed: false, reason: "binding_outside_foundation_policy" };
};

/**
 * Inventory helper. This does not imply runtime availability; use an effective
 * resolver for any customer-visible catalog.
 */
export function getRegisteredModels(): ModelDescriptor[] {
  return getRegisteredModelBindings().map(toPublicDescriptor);
}

export function createEffectiveModelCatalogResolver(
  options: EffectiveModelCatalogResolverOptions,
): EffectiveModelCatalogResolver {
  validateBindings(options.bindings);
  const resolvePolicy =
    options.resolvePolicy
    ?? (() => ({
      revision: "unconfigured-deny-all",
      evaluatePolicy: () => ({
        allowed: false,
        reason: "policy_not_configured",
      }),
    }));

  const resolve = async (
    session: CatalogSession,
  ): Promise<EffectiveModelCatalogResolution> => withAtlasSpan(
    "atlas.catalog.resolve",
    { plane: metricPlane(session.plane) },
    async () => {
    const policy = await resolvePolicy(session);
    const sourcePolicyRevision = requiredModelId(
      policy.revision,
      "policySnapshot.revision",
    );
    const policyRevision = deriveBindingPolicyRevision(
      options.bindings,
      sourcePolicyRevision,
    );
    const eligibility = await Promise.all(options.bindings.map(async (binding) => (
      binding.status === "available"
      && binding.capabilities.streaming
      && options.registry.isBindingEligible(binding)
      && (await policy.evaluatePolicy(binding, session)).allowed
    )));
    const eligible = options.bindings.filter((_binding, index) => eligibility[index]);
    assertUnambiguousPublicModels(eligible);

    const models = eligible.map(toPublicDescriptor);
    const configuredDefault = models.find(
      (model) => model.model_id === options.defaultPublicModelId,
    );
    // Internal diagnostic bindings are always an explicit evaluator choice.
    // They must never become a fallback product default when a normal Atlas
    // mode is unavailable.
    const defaultDescriptor = configuredDefault?.selection_policy === "normal"
      ? configuredDefault
      : models.find((model) => model.selection_policy === "normal");

      return {
      catalog: {
        default_model_id: defaultDescriptor?.model_id ?? "",
        models,
        policy_revision: policyRevision,
      },
      bindings: eligible,
      policyRevision,
      };
    },
  );

  return {
    resolve,
    resolveCatalog: async (session) => (await resolve(session)).catalog,
    hasAnyOperationalBinding: () => options.registry.hasEligibleBinding(options.bindings),
  };
}

function metricPlane(value: string): "neon" | "mesh" | "admin" | "unknown" {
  return value === "neon" || value === "mesh" || value === "admin"
    ? value
    : "unknown";
}

/**
 * Compatibility wrapper for callers migrating from the bootstrap-wide catalog.
 * A resolver is required for truthful availability; omitting it fails closed.
 */
export async function resolveEffectiveCatalog(
  session: CatalogSession,
  resolver?: EffectiveModelCatalogResolver,
): Promise<ModelCatalog> {
  return resolver ? resolver.resolveCatalog(session) : {
    default_model_id: "",
    models: [],
    policy_revision: "unavailable",
  };
}

function anthropicBinding(input: {
  bindingId: string;
  publicModelId: string;
  upstreamModelId: string;
  displayName: string;
  displayTier: AtlasDisplayTier;
  toolsEnabled: boolean;
}): AtlasModelBinding {
  const profile = reviewedAnthropicModelProfile(
    input.upstreamModelId,
    input.displayTier,
  );
  return {
    ...input,
    inputPricePerMtokUsd: profile.inputPricePerMtokUsd,
    cacheReadPricePerMtokUsd: profile.cacheReadPricePerMtokUsd,
    cacheWritePricePerMtokUsd: profile.cacheWritePricePerMtokUsd,
    outputPricePerMtokUsd: profile.outputPricePerMtokUsd,
    reasoningPricePerMtokUsd: profile.reasoningPricePerMtokUsd,
    providerId: "anthropic",
    bindingExposure: "product",
    adapterId: CLAUDE_TEXT_ADAPTER_ID,
    adapterVersion: CLAUDE_TEXT_ADAPTER_VERSION,
    status: "available",
    capabilities: {
      streaming: true,
      tools: input.toolsEnabled,
      vision: false,
      maxContextTokens: 200_000,
      maxOutputTokens: 8_192,
    },
    credentialPolicy: "platform",
    // Neutral profile name: use of /v1/messages does not itself prove an
    // organization-level ZDR, HIPAA, workspace-retention, or residency
    // arrangement. Those become explicit policy attributes before sensitive
    // classifications are enabled.
    dataHandlingProfileId: "anthropic-platform-messages-v1",
    routingPolicyId: "no-fallback-v1",
    allowedDataClasses: ["public", "internal"],
    allowedRegions: ["global"],
    providerRegion: "global",
    providerAccountClass: "platform_unverified",
    priceVersion: profile.priceVersion,
  };
}

function reviewedAnthropicModelProfile(
  upstreamModelId: string,
  expectedTier: AtlasDisplayTier,
): (typeof ANTHROPIC_ATLAS_MODEL_PROFILES)[AnthropicAtlasModelId] {
  const profile = ANTHROPIC_ATLAS_MODEL_PROFILES[
    upstreamModelId as AnthropicAtlasModelId
  ];
  if (!profile) {
    throw new Error(
      `Atlas Anthropic model "${upstreamModelId}" has no reviewed capability and price profile`,
    );
  }
  if (profile.tier !== expectedTier) {
    throw new Error(
      `Atlas Anthropic model "${upstreamModelId}" is reviewed for tier "${profile.tier}", not "${expectedTier}"`,
    );
  }
  return profile;
}

function reviewedOpenAiEvalModelProfile(
  upstreamModelId: string,
): (typeof OPENAI_ATLAS_EVAL_MODEL_PROFILES)[OpenAiAtlasEvalModelId] {
  const profile = OPENAI_ATLAS_EVAL_MODEL_PROFILES[
    upstreamModelId as OpenAiAtlasEvalModelId
  ];
  if (!profile) {
    throw new Error(
      `Atlas OpenAI evaluation model "${upstreamModelId}" has no reviewed capability and price profile`,
    );
  }
  return profile;
}

function reviewedGeminiEvalModelProfile(
  upstreamModelId: string,
): (typeof GEMINI_ATLAS_EVAL_MODEL_PROFILES)[GeminiAtlasEvalModelId] {
  const profile = GEMINI_ATLAS_EVAL_MODEL_PROFILES[
    upstreamModelId as GeminiAtlasEvalModelId
  ];
  if (!profile) {
    throw new Error(
      `Atlas Gemini evaluation model "${upstreamModelId}" has no reviewed capability and price profile`,
    );
  }
  return profile;
}

function hasCanonicalPermission(
  session: CatalogSession,
  permissionCode: string,
): boolean {
  const verified = session.verifiedRequestContext;
  if (
    !verified
    || verified.tenantId !== session.tenantId
    || verified.principalId !== session.principalId
    || verified.planeKey !== session.plane
  ) {
    return false;
  }
  const permissions = verified.permissions;
  return permissions.tenantId === verified.tenantId
    && permissions.principalId === verified.principalId
    && permissions.planeKey === verified.planeKey
    && permissions.allowed.has(permissionCode)
    && !permissions.denied.has(permissionCode)
    && !permissions.planLocked.has(permissionCode)
    && !permissions.planeExcluded.has(permissionCode);
}

function toPublicDescriptor(binding: AtlasModelBinding): ModelDescriptor {
  return {
    provider_id: "atlas",
    model_id: binding.publicModelId,
    display_name: binding.displayName,
    icon_key: "atlas",
    tier: binding.displayTier,
    status: binding.status === "disabled" ? "restricted" : binding.status,
    selection_policy:
      binding.bindingExposure === "internal_evaluation"
        ? "explicit_only"
        : "normal",
    capabilities: {
      streaming: binding.capabilities.streaming,
      tools: binding.capabilities.tools,
      vision: binding.capabilities.vision,
      max_context_tokens: binding.capabilities.maxContextTokens,
      max_output_tokens: binding.capabilities.maxOutputTokens,
    },
    // Provider prices are internal routing inputs, not customer product prices.
    cost: null,
    ...(binding.restrictedReason ? { restricted_reason: binding.restrictedReason } : {}),
  };
}

function validateBindings(bindings: readonly AtlasModelBinding[]): void {
  const bindingIds = new Set<string>();
  for (const binding of bindings) {
    if (bindingIds.has(binding.bindingId)) {
      throw new Error(`Duplicate Atlas binding id "${binding.bindingId}"`);
    }
    bindingIds.add(binding.bindingId);
    requiredModelId(binding.publicModelId, "publicModelId");
    requiredModelId(binding.upstreamModelId, "upstreamModelId");
    if (
      binding.bindingExposure !== "product"
      && binding.bindingExposure !== "internal_evaluation"
    ) {
      throw new Error(
        `Atlas binding "${binding.bindingId}" has an invalid binding exposure`,
      );
    }
    if (!PROVIDER_ACCOUNT_CLASSES.has(binding.providerAccountClass)) {
      throw new Error(
        `Atlas binding "${binding.bindingId}" has an invalid provider account class`,
      );
    }
  }
}

function assertUnambiguousPublicModels(bindings: readonly AtlasModelBinding[]): void {
  const publicIds = new Set<string>();
  for (const binding of bindings) {
    if (publicIds.has(binding.publicModelId)) {
      throw new Error(
        `Ambiguous eligible Atlas bindings for public model "${binding.publicModelId}"`,
      );
    }
    publicIds.add(binding.publicModelId);
  }
}

function requiredModelId(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Atlas binding ${field} must not be empty`);
  return normalized;
}

const PROVIDER_ACCOUNT_CLASSES = new Set([
  "platform_unverified",
  "platform_paid",
  "developer_free",
  "tenant_paid",
  "tenant_byok",
  "local",
  "test",
]);

function deriveBindingPolicyRevision(
  bindings: readonly AtlasModelBinding[],
  policyProfileId: string,
): string {
  const revisionInput = {
    policyProfileId,
    bindings: bindings
      .map((binding) => ({
      bindingId: binding.bindingId,
      publicModelId: binding.publicModelId,
      providerId: binding.providerId,
      upstreamModelId: binding.upstreamModelId,
      adapterId: binding.adapterId,
      adapterVersion: binding.adapterVersion,
      status: binding.status,
      bindingExposure: binding.bindingExposure,
      dataHandlingProfileId: binding.dataHandlingProfileId,
      routingPolicyId: binding.routingPolicyId,
      priceVersion: binding.priceVersion,
      inputPricePerMtokUsd: binding.inputPricePerMtokUsd,
      cacheReadPricePerMtokUsd: binding.cacheReadPricePerMtokUsd,
      cacheWritePricePerMtokUsd: binding.cacheWritePricePerMtokUsd,
      outputPricePerMtokUsd: binding.outputPricePerMtokUsd,
      reasoningPricePerMtokUsd: binding.reasoningPricePerMtokUsd,
      credentialPolicy: binding.credentialPolicy,
      allowedDataClasses: [...binding.allowedDataClasses].sort(),
      allowedRegions: [...binding.allowedRegions].sort(),
      providerRegion: binding.providerRegion,
      providerAccountClass: binding.providerAccountClass,
      capabilities: binding.capabilities,
    }))
      .sort((left, right) => left.bindingId.localeCompare(right.bindingId)),
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(revisionInput))
    .digest("hex")
    .slice(0, 16);
  return `atlas-base-${digest}`;
}

// Re-export catalog types for server consumers.
export type { ProviderId } from "@athyper/atlas-agent-runtime";
export type { AtlasModelBinding, ModelCatalog, ModelDescriptor };
