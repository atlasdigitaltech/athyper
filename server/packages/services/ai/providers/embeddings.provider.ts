/**
 * Embeddings Provider — text-to-vector using voyage-3-large (or configurable).
 *
 * Voyage AI endpoint: https://api.voyageai.com/v1/embeddings
 * Fallback: if VOYAGE_API_KEY is absent, throws NO_PROVIDER_MATCHES_CAPABILITIES
 * so the caller surfaces a clear error rather than silently degrading.
 *
 * ModelRouter selects this when action requires supports_embeddings = true.
 */

import type { IModelProvider, ProviderCapabilities, ModelPrompt, ModelResponse } from "./i-model-provider.js";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

export class EmbeddingsProvider implements IModelProvider {
  readonly modelId      = "voyage-embeddings";
  readonly modelVersion: string;
  readonly capabilities: ProviderCapabilities = {
    supports_vision:         false,
    supports_pdf_native:     false,
    supports_json_schema:    false,
    supports_tool_calling:   false,
    supports_embeddings:     true,
    supports_streaming:      false,
    max_context_tokens:      32_000,
    max_output_tokens:       0,
    max_input_file_bytes:    0,
    supported_mime_types:    ["text/plain"],
    supported_regions:       ["us", "eu"],
    cost_per_1k_input_tokens:    0.0001,
    cost_per_1k_output_tokens:   0.0,
  };

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "voyage-3-large",
  ) {
    this.modelVersion = model;
  }

  async invoke(prompt: ModelPrompt): Promise<ModelResponse> {
    const startMs = Date.now();

    // For embeddings the "prompt" carries text in the first user message
    const userMsg = prompt.messages.find((m) => m.role === "user");
    const inputText = typeof userMsg?.content === "string"
      ? userMsg.content
      : "";

    const resp = await fetch(VOYAGE_API_URL, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "content-type":  "application/json",
      },
      body: JSON.stringify({ model: this.model, input: [inputText] }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`Voyage embeddings API error ${resp.status}: ${errText}`);
    }

    const data = await resp.json() as {
      data:  Array<{ embedding: number[] }>;
      usage: { total_tokens: number };
    };

    const embedding = data.data[0]?.embedding ?? [];
    const tokens    = data.usage?.total_tokens ?? 0;

    return {
      // Embeddings are returned as JSON-stringified vector; callers parse as needed
      text:        JSON.stringify(embedding),
      usage:       { input_tokens: tokens, output_tokens: 0, vision_pages: 0 },
      duration_ms: Date.now() - startMs,
    };
  }
}
