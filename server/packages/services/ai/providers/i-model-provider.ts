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

export type ContentBlock = TextBlock | ImageBlock;

export interface ModelMessage {
  role:    MessageRole;
  content: string | ContentBlock[];
}

export interface ModelPrompt {
  system?:     string | ContentBlock[];
  messages:    ModelMessage[];
  max_tokens:  number;
  temperature?: number;
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

export interface IModelProvider {
  readonly modelId:       string;
  readonly modelVersion:  string;
  readonly capabilities:  ProviderCapabilities;

  invoke(prompt: ModelPrompt): Promise<ModelResponse>;
}
