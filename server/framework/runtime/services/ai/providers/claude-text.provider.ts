/**
 * Claude Text Provider — text-only (no vision), uses claude-sonnet-4-6.
 *
 * Intended for classification, suggest, summarize, translate, extract_entity
 * actions that don't need document vision.  Cheaper per token than the vision
 * model; ModelRouter selects this when supports_vision is not required.
 *
 * Prompt caching enabled on the system block.
 */

import type { IModelProvider, ProviderCapabilities, ModelPrompt, ModelResponse } from "./i-model-provider.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_BETA    = "prompt-caching-2024-07-31";

export class ClaudeTextProvider implements IModelProvider {
  readonly modelId      = "claude-anthropic-text";
  readonly modelVersion: string;
  readonly capabilities: ProviderCapabilities = {
    supports_vision:         false,
    supports_pdf_native:     false,
    supports_json_schema:    true,
    supports_tool_calling:   true,
    supports_embeddings:     false,
    supports_streaming:      false,
    max_context_tokens:      200_000,
    max_output_tokens:       8_192,
    max_input_file_bytes:    0,
    supported_mime_types:    ["text/plain", "application/json"],
    supported_regions:       ["us", "eu", "ap"],
    cost_per_1k_input_tokens:    0.003,
    cost_per_1k_output_tokens:   0.015,
  };

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-sonnet-4-6",
  ) {
    this.modelVersion = model;
  }

  async invoke(prompt: ModelPrompt): Promise<ModelResponse> {
    const startMs = Date.now();

    let system: unknown = undefined;
    if (prompt.system) {
      if (typeof prompt.system === "string") {
        system = [{ type: "text", text: prompt.system, cache_control: { type: "ephemeral" } }];
      } else {
        system = prompt.system;
      }
    }

    const body = {
      model:      this.model,
      max_tokens: prompt.max_tokens,
      ...(system ? { system } : {}),
      ...(prompt.temperature !== undefined ? { temperature: prompt.temperature } : {}),
      messages:   prompt.messages,
    };

    const resp = await fetch(ANTHROPIC_API_URL, {
      method:  "POST",
      headers: {
        "x-api-key":         this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta":    ANTHROPIC_BETA,
        "content-type":      "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`Claude text API error ${resp.status}: ${errText}`);
    }

    const data = await resp.json() as {
      content: Array<{ type: string; text?: string }>;
      usage:   { input_tokens: number; output_tokens: number };
    };

    const text  = data.content.find((b) => b.type === "text")?.text ?? "";
    const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };

    return {
      text,
      usage:       { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, vision_pages: 0 },
      duration_ms: Date.now() - startMs,
    };
  }
}
