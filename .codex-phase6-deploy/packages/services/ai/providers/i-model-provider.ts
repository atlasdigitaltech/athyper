/**
 * IModelProvider — provider-agnostic interface every LLM/embedding adapter must implement.
 *
 * ModelRouter picks a provider by checking that the provider's capabilities
 * are a superset of what the action requires.  Routing failures surface as
 * NO_PROVIDER_MATCHES_CAPABILITIES — never a silent fallthrough.
 */

export interface ProviderCapabilities {
  // Vision / document modalities
  supports_vision:        boolean;
  supports_pdf_native:    boolean;
  // Output control
  supports_json_schema:   boolean;
  supports_tool_calling:  boolean;
  supports_embeddings:    boolean;
  supports_streaming:     boolean;
  // Limits
  max_context_tokens:     number;
  max_output_tokens:      number;
  max_input_file_bytes:   number;
  // Accepted input formats
  supported_mime_types:   readonly string[];
  // Deployment regions (for data-residency routing)
  supported_regions:      readonly string[];
  // Cost (informational only — used for provider ranking, not hard-gating)
  cost_per_1k_input_tokens:  number;
  cost_per_1k_output_tokens: number;
}

// Prompt message role
export type MessageRole = "user" | "assistant";

export interface TextBlock {
  type:          "text";
  text:          string;
  cache_control?: { type: "ephemeral" };
}

export interface ImageBlock {
  type:   "image";
  source: { type: "base64"; media_type: string; data: string }
        | { type: "url";    url: string };
}

/**
 * Canonical assistant tool-use block. Provider-native function/content block
 * types must not cross the adapter boundary.
 */
export interface ToolUseBlock {
  type:      "tool_use";
  call_id:   string;
  tool_name: string;
  input:     Record<string, unknown>;
}

/**
 * Canonical tool result returned to the model for a subsequent turn.
 *
 * `content` is JSON-only at runtime. It is deliberately typed as `unknown`
 * here so adapters cannot assume that tool data is trusted prose.
 */
export interface ToolResultBlock {
  type:      "tool_result";
  call_id:   string;
  tool_name: string;
  content:   unknown;
  is_error?: boolean;
}

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock;

export interface ModelMessage {
  role:    MessageRole;
  content: string | ContentBlock[];
}

export interface ModelToolDefinition {
  name:         string;
  description:  string;
  input_schema: object;
}

export interface ModelPrompt {
  system?:     string | ContentBlock[];
  messages:    ModelMessage[];
  max_tokens:  number;
  temperature?: number;
  /**
   * Exact, request-effective tools. The runtime sends no tools when the
   * verified principal has no effective capabilities.
   */
  tools?: readonly ModelToolDefinition[];
  // Zod schema passed as JSON Schema for structured output (if supported)
  response_format?: { type: "json_schema"; schema: object };
}

export interface ModelResponseUsage {
  input_tokens:  number;
  output_tokens: number;
  vision_pages:  number;
}

export interface ModelResponse {
  text:     string;
  usage:    ModelResponseUsage;
  duration_ms: number;
}

export type AtlasBindingExposure = "product" | "internal_evaluation";

/**
 * Reviewed commercial/data-use class of the provider account behind a binding.
 *
 * Credential ownership remains a separate concern (`credentialPolicy`). The
 * account class is policy and ledger metadata used to prevent, for example, a
 * paid production binding from silently resolving through a free development
 * project.
 */
export type ProviderAccountClass =
  | "platform_unverified"
  | "platform_paid"
  | "developer_free"
  | "tenant_paid"
  | "tenant_byok"
  | "local"
  | "test";

/**
 * Exact Atlas model binding.
 * Exact server-side mapping from a stable Atlas product model to a certified
 * provider adapter and upstream model.
 */
export interface AtlasModelBinding {
  bindingId: string;
  publicModelId: string;
  providerId: string;
  upstreamModelId: string;
  allowedUpstreamModelAliases?: readonly string[];
  adapterId: string;
  adapterVersion: string;
  displayName: string;
  displayTier: "fast" | "balanced" | "best";
  bindingExposure: AtlasBindingExposure;
  status: "available" | "restricted" | "disabled";
  restrictedReason?: string;
  capabilities: {
    streaming: boolean;
    tools: boolean;
    vision: boolean;
    maxContextTokens: number;
    maxOutputTokens: number;
  };
  credentialPolicy: "platform" | "tenant_optional" | "tenant_required" | "local";
  dataHandlingProfileId: string;
  routingPolicyId: string;
  allowedDataClasses: readonly string[];
  allowedRegions: readonly string[];
  /** Reviewed provider routing region for this exact binding. */
  providerRegion: string;
  /** Reviewed provider account/data-use class for this exact binding. */
  providerAccountClass: ProviderAccountClass;
  priceVersion: string;
  inputPricePerMtokUsd: number | null;
  cacheReadPricePerMtokUsd: number | null;
  cacheWritePricePerMtokUsd: number | null;
  outputPricePerMtokUsd: number | null;
  reasoningPricePerMtokUsd: number | null;
}

export interface ProviderOperationalState {
  implemented: boolean;
  credentialed: boolean;
  healthy: boolean;
  eligible: boolean;
  reason?: string;
}

export interface ProviderInvocation {
  binding: AtlasModelBinding;
  prompt: ModelPrompt;
  /**
   * Request-scoped credential lease. The secret is consumed only by the
   * adapter and must never be copied to logs, catalogs, or ledger metadata.
   */
  credential?: {
    secret: string;
  };
  signal?: AbortSignal;
  trace: {
    runId: string;
    callId: string;
    tenantId: string;
    principalHash: string;
    /**
     * Stable SHA-256 over the verified tenant/principal tuple. It is safe to
     * send as a provider abuse-monitoring identifier and contains no username,
     * email address, or raw platform identifier.
     */
    safetyIdentifier: string;
    promptVersion: string;
  };
}

export type CanonicalFinishReason =
  | "stop"
  | "length"
  | "tool_call"
  | "content_filter"
  | "refusal"
  | "cancelled"
  | "incomplete"
  | "error";

export type CanonicalProviderErrorClass =
  | "authentication"
  | "permission"
  | "invalid_request"
  | "model_unavailable"
  | "rate_limited"
  | "quota_exhausted"
  | "overloaded"
  | "timeout"
  | "safety_block"
  | "stream_incomplete"
  | "protocol_error"
  | "upstream_error"
  | "cancelled";

export interface CanonicalProviderError {
  error_class: CanonicalProviderErrorClass;
  code: string;
  safe_message: string;
  retryable: boolean;
  retry_after_ms?: number;
}

export interface CanonicalProviderUsage {
  /**
   * Canonical usage buckets are disjoint. Adapters must subtract provider
   * subset counters (for example cached input and reasoning output) from
   * provider total counters before emitting these values.
   */
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  reasoning_tokens?: number;
}

export type CanonicalStreamEvent =
  | {
      kind: "response_started";
      provider_id: string;
      provider_request_id: string | null;
      actual_model_id: string;
    }
  | { kind: "text_delta"; text: string }
  | { kind: "refusal"; reason: string }
  | { kind: "tool_call_start"; call_id: string; tool_name: string }
  | { kind: "tool_call_input_delta"; call_id: string; json_fragment: string }
  | { kind: "tool_call_complete"; call_id: string; input: Record<string, unknown> }
  | {
      kind: "usage";
      mode: "snapshot" | "delta";
      final: boolean;
      usage: CanonicalProviderUsage;
    }
  | { kind: "completed"; reason: CanonicalFinishReason }
  | { kind: "failed"; error: CanonicalProviderError }
  | { kind: "cancelled" };

/**
 * @deprecated Use `CanonicalStreamEvent`.  Kept for one commit so downstream
 *             callers can migrate without breaking the build.
 */
export type ModelStreamEvent = CanonicalStreamEvent;

export interface ModelStreamOptions {
  signal?: AbortSignal;
}

export interface IModelProvider {
  readonly modelId:       string;
  readonly modelVersion:  string;
  readonly capabilities:  ProviderCapabilities;
  readonly adapterId?: string;
  readonly adapterVersion?: string;
  readonly operationalState?: ProviderOperationalState;

  invoke(prompt: ModelPrompt): Promise<ModelResponse>;
  invokeStream?(
    invocation: ProviderInvocation,
  ): AsyncIterable<CanonicalStreamEvent>;
}
