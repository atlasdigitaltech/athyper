// framework/runtime/src/services/business/engines/atlas-ai/services/narrative-provider.ts
//
// Atlas Phase 3B — NarrativeProvider abstraction
//
// Two implementations:
//   1. TemplateNarrativeProvider — deterministic, always available (default)
//   2. LlmNarrativeProvider — optional polishing layer, template fallback
//
// Key invariants:
//   - Template output is ALWAYS computed first
//   - LLM can only polish/summarize/rephrase — never invent facts
//   - LLM never decides gates, release state, or risk classification
//   - If LLM fails, template output is returned transparently
//   - Provenance tracks which provider produced the final text

import type {
  NarrativeType,
  NarrativeInput,
  NarrativeProvider as NarrativeProviderType,
  NarrativeProvenance,
  AnomalyExplanationInput,
} from "../domain/narrative-types.js";
import {
  buildProvenance,
  buildAnomalyProvenance,
} from "../domain/narrative-types.js";
import {
  renderDashboardSummary,
  renderReleaseSummary,
  renderAnomalyExplanation,
  renderCfoBrief,
} from "./narrative-templates.js";

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface NarrativeProviderResult {
  text: string;
  provider: NarrativeProviderType;
  provenance: NarrativeProvenance;
}

export interface NarrativeProvider {
  readonly name: NarrativeProviderType;

  /** Render a narrative from structured input */
  render(
    type: NarrativeType,
    input: NarrativeInput,
  ): Promise<NarrativeProviderResult>;

  /** Render an anomaly explanation */
  renderAnomaly(
    input: AnomalyExplanationInput,
  ): Promise<NarrativeProviderResult>;
}

// ---------------------------------------------------------------------------
// 1. TemplateNarrativeProvider — deterministic, no external deps
// ---------------------------------------------------------------------------

export class TemplateNarrativeProvider implements NarrativeProvider {
  readonly name: NarrativeProviderType = "template";

  async render(
    type: NarrativeType,
    input: NarrativeInput,
  ): Promise<NarrativeProviderResult> {
    const text =
      type === "DASHBOARD_SUMMARY" ? renderDashboardSummary(input) :
      type === "RELEASE_SUMMARY" ? renderReleaseSummary(input) :
      type === "CFO_BRIEF" ? renderCfoBrief(input) : "";

    return {
      text,
      provider: "template",
      provenance: buildProvenance(input, "template"),
    };
  }

  async renderAnomaly(
    input: AnomalyExplanationInput,
  ): Promise<NarrativeProviderResult> {
    return {
      text: renderAnomalyExplanation(input),
      provider: "template",
      provenance: buildAnomalyProvenance("template"),
    };
  }
}

// ---------------------------------------------------------------------------
// 2. LlmNarrativeProvider — polishes template output via LLM
// ---------------------------------------------------------------------------

/** Configuration for the LLM provider */
export interface LlmNarrativeProviderConfig {
  /** Invoke the LLM with a system prompt and user message, return polished text */
  invoke: (systemPrompt: string, userMessage: string) => Promise<string>;
  /** Maximum time to wait for LLM response (ms). Default: 10000 */
  timeoutMs?: number;
}

const SYSTEM_PROMPT = `You are a financial reporting assistant for an enterprise close management system.
Your role is to polish and rephrase narrative text for clarity and executive readability.

STRICT RULES:
1. You MUST preserve all numerical values, account codes, percentages, and dates exactly as given.
2. You MUST NOT invent new facts, metrics, or data points not present in the input.
3. You MUST NOT change risk classifications, gate statuses, or release readiness assessments.
4. You MUST NOT add recommendations or suggest actions beyond what the input states.
5. Keep the same structure and information density — do not add or remove content.
6. Use professional, concise financial language suitable for a CFO audience.
7. Return ONLY the polished text, no commentary or metadata.`;

export class LlmNarrativeProvider implements NarrativeProvider {
  readonly name: NarrativeProviderType = "llm";
  private readonly templateProvider = new TemplateNarrativeProvider();
  private readonly config: LlmNarrativeProviderConfig;
  private readonly timeoutMs: number;

  constructor(config: LlmNarrativeProviderConfig) {
    this.config = config;
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  async render(
    type: NarrativeType,
    input: NarrativeInput,
  ): Promise<NarrativeProviderResult> {
    // Always compute template output first
    const templateResult = await this.templateProvider.render(type, input);

    try {
      const polished = await this.invokeWithTimeout(
        SYSTEM_PROMPT,
        `Narrative type: ${type}\n\nOriginal text:\n${templateResult.text}`,
      );

      if (!polished || polished.trim().length === 0) {
        return templateResult; // fallback
      }

      return {
        text: polished.trim(),
        provider: "llm",
        provenance: buildProvenance(input, "llm", templateResult.text),
      };
    } catch {
      // LLM failed — return template output transparently
      return templateResult;
    }
  }

  async renderAnomaly(
    input: AnomalyExplanationInput,
  ): Promise<NarrativeProviderResult> {
    const templateResult = await this.templateProvider.renderAnomaly(input);

    try {
      const polished = await this.invokeWithTimeout(
        SYSTEM_PROMPT,
        `Narrative type: ANOMALY_EXPLANATION\n\nOriginal text:\n${templateResult.text}`,
      );

      if (!polished || polished.trim().length === 0) {
        return templateResult;
      }

      return {
        text: polished.trim(),
        provider: "llm",
        provenance: buildAnomalyProvenance("llm", templateResult.text),
      };
    } catch {
      return templateResult;
    }
  }

  private invokeWithTimeout(systemPrompt: string, userMessage: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("LLM invocation timed out")),
        this.timeoutMs,
      );

      this.config
        .invoke(systemPrompt, userMessage)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create the appropriate narrative provider based on configuration */
export function createNarrativeProvider(
  llmConfig?: LlmNarrativeProviderConfig,
): NarrativeProvider {
  if (llmConfig) {
    return new LlmNarrativeProvider(llmConfig);
  }
  return new TemplateNarrativeProvider();
}
