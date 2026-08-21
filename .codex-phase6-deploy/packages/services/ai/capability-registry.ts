/**
 * CapabilityRegistry — maps action_code strings to ICapabilityHandler instances.
 *
 * Every action the AI runtime can execute must be registered here.  Attempting
 * to run an unregistered action returns CAPABILITY_NOT_REGISTERED rather than
 * throwing, so the runtime can write a failed inference log row.
 *
 * Capability handlers declare a consumer_ceiling — the hardcoded maximum
 * autonomy level the handler will ever return, regardless of tenant policy.
 * Financial document actions are capped at "assist" and cannot be lifted.
 *
 * Registering a handler with action_code matching a lookup_value in
 * control.ai_action_code is enforced by convention (checked in CI via the
 * lookup diff script, not at runtime).
 */

import type { AiLogger, CapabilityResult } from "./ai-runtime.types.js";
import type { AutonomyLevel } from "./ai-runtime.types.js";
import type { ModelRouter } from "./model-router.js";
import type { PromptStore } from "./prompt-store.js";
import type { EvidenceBinder } from "./evidence-binder.js";
import type { AnyDb, ActionRequest } from "./ai-runtime.types.js";

// ── Capability handler interface ──────────────────────────────────────────────

export interface CapabilityRunArgs {
  request:     ActionRequest;
  tenantId:    string;
  principalId: string;
  pipelineId:  string;
}

export interface CapabilityDeps {
  db:             AnyDb;
  modelRouter:    ModelRouter;
  promptStore:    PromptStore;
  evidenceBinder: EvidenceBinder;
  logger:         AiLogger;
}

export interface ICapabilityHandler {
  readonly action_code:      string;
  // Hardcoded ceiling — stacks with tenant policy; lower wins.
  // Financial document extraction is always capped at "assist".
  readonly consumer_ceiling: AutonomyLevel;
  run(deps: CapabilityDeps, args: CapabilityRunArgs): Promise<CapabilityResult>;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export class CapabilityRegistry {
  private readonly handlers = new Map<string, ICapabilityHandler>();
  private readonly governedActionCodes = new Set<string>();

  constructor(private readonly logger: AiLogger) {}

  register(handler: ICapabilityHandler): void {
    if (this.handlers.has(handler.action_code)) {
      this.logger.warn("ai_capability_overwrite", { action_code: handler.action_code });
    }
    this.governedActionCodes.add(handler.action_code);
    this.handlers.set(handler.action_code, handler);
  }

  /**
   * Declares a policy/autonomy action without making it executable through the
   * legacy `/ai/actions` capability path. Governed Atlas tools bind their own
   * narrow handlers separately and use this declaration only as the canonical
   * action-code namespace.
   */
  declareGovernedAction(actionCode: string): void {
    if (!/^[a-z][a-z0-9_]{2,99}$/.test(actionCode)) {
      throw new Error("Governed AI action code is malformed.");
    }
    this.governedActionCodes.add(actionCode);
  }

  hasActionCode(actionCode: string): boolean {
    return this.governedActionCodes.has(actionCode);
  }

  get(actionCode: string): ICapabilityHandler | null {
    return this.handlers.get(actionCode) ?? null;
  }

  list(): string[] {
    return [...this.handlers.keys()];
  }
}

// ── Built-in: classify capability (text-only, suggest ceiling) ────────────────
// Handles the `classify` action code for general taxonomy picking.
// Concrete domain adapters (e.g. procurement spend-category) build on top of
// this by post-processing the output through their own business logic.

export class ClassifyCapability implements ICapabilityHandler {
  readonly action_code      = "classify";
  readonly consumer_ceiling: AutonomyLevel = "auto"; // non-posting; user confirms separately

  async run(deps: CapabilityDeps, args: CapabilityRunArgs): Promise<CapabilityResult> {
    const { modelRouter, promptStore, logger, evidenceBinder } = deps;
    const { request, pipelineId } = args;

    const prompt = await promptStore.get("classify") ?? {
      text:    "You are a classification assistant. Given the input, return the best matching category code and your confidence (0-1).\n\nRespond with JSON: { \"code\": \"<code>\", \"confidence\": 0.0, \"reasoning\": \"<reasoning>\" }",
      version: "inline-v1",
      hash:    "inline",
    };

    const subjectText = request.subject.kind === "text"
      ? request.subject.text
      : JSON.stringify(request.subject);

    const provider = modelRouter.pick({ supports_json_schema: true });
    const startMs  = Date.now();

    const response = await provider.invoke({
      system:     [{ type: "text", text: prompt.text, cache_control: { type: "ephemeral" } }],
      messages:   [{ role: "user", content: subjectText }],
      max_tokens: 512,
    });

    let parsed: { code?: string; confidence?: number; reasoning?: string } = {};
    try {
      parsed = JSON.parse(response.text) as typeof parsed;
    } catch (e) {
      logger.warn("ai_classify_parse_failed", { pipelineId, err: String(e) });
    }

    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0;

    return {
      output:        { code: parsed.code ?? null, reasoning: parsed.reasoning ?? null },
      confidence:    { overall: confidence, fields: { code: confidence } },
      evidence:      evidenceBinder.bind(null),
      costUnits:     { ...response.usage, vision_pages: 0, duration_ms: Date.now() - startMs },
      modelId:       provider.modelId,
      modelVersion:  provider.modelVersion,
      promptVersion: prompt.version,
      warnings:      [],
    };
  }
}

// ── Built-in: summarize capability ────────────────────────────────────────────

export class SummarizeCapability implements ICapabilityHandler {
  readonly action_code      = "summarize";
  readonly consumer_ceiling: AutonomyLevel = "auto"; // read-only; no record changes

  async run(deps: CapabilityDeps, args: CapabilityRunArgs): Promise<CapabilityResult> {
    const { modelRouter, promptStore, logger, evidenceBinder } = deps;
    const { request, pipelineId } = args;

    const prompt = await promptStore.get("summarize") ?? {
      text:    "You are a concise summarization assistant. Return a clear, factual summary in 3-5 sentences.",
      version: "inline-v1",
      hash:    "inline",
    };

    const subjectText = request.subject.kind === "text"
      ? request.subject.text
      : JSON.stringify(request.subject);

    const provider = modelRouter.pick({});
    const startMs  = Date.now();

    const response = await provider.invoke({
      system:     [{ type: "text", text: prompt.text, cache_control: { type: "ephemeral" } }],
      messages:   [{ role: "user", content: subjectText }],
      max_tokens: 1024,
    });

    if (!response.text) {
      logger.warn("ai_summarize_empty", { pipelineId });
    }

    return {
      output:        { summary: response.text },
      confidence:    { overall: 0.90, fields: { summary: 0.90 } }, // always high for summarize
      evidence:      evidenceBinder.bind(null),
      costUnits:     { ...response.usage, vision_pages: 0, duration_ms: Date.now() - startMs },
      modelId:       provider.modelId,
      modelVersion:  provider.modelVersion,
      promptVersion: prompt.version,
      warnings:      [],
    };
  }
}

// ── Built-in: translate capability ────────────────────────────────────────────

export class TranslateCapability implements ICapabilityHandler {
  readonly action_code      = "translate";
  readonly consumer_ceiling: AutonomyLevel = "auto"; // no record modification

  async run(deps: CapabilityDeps, args: CapabilityRunArgs): Promise<CapabilityResult> {
    const { modelRouter, promptStore, evidenceBinder } = deps;
    const { request } = args;

    const targetLocale = request.context.locale ?? "en";
    const prompt = await promptStore.get("translate") ?? {
      text:    `You are a professional translator. Translate the input to ${targetLocale}. Preserve domain terminology. Return only the translated text.`,
      version: "inline-v1",
      hash:    "inline",
    };

    const subjectText = request.subject.kind === "text"
      ? request.subject.text
      : JSON.stringify(request.subject);

    const provider = modelRouter.pick({});
    const startMs  = Date.now();

    const response = await provider.invoke({
      system:     [{ type: "text", text: prompt.text, cache_control: { type: "ephemeral" } }],
      messages:   [{ role: "user", content: subjectText }],
      max_tokens: 4096,
    });

    return {
      output:        { translated: response.text, target_locale: targetLocale },
      confidence:    { overall: 0.90, fields: { translated: 0.90 } },
      evidence:      evidenceBinder.bind(null),
      costUnits:     { ...response.usage, vision_pages: 0, duration_ms: Date.now() - startMs },
      modelId:       provider.modelId,
      modelVersion:  provider.modelVersion,
      promptVersion: prompt.version,
      warnings:      [],
    };
  }
}
