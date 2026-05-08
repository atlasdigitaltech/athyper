/**
 * AI Foundation — service factory and public API.
 *
 * Usage in api.ts:
 *
 *   import { createAiServiceBundle, registerAiRoutes } from
 *     "../../framework/runtime/services/ai/index.js";
 *
 *   const aiBundle = createAiServiceBundle({ db, redis, logger });
 *   registerAiRoutes(apiRouter, { ...aiBundle, auth, db, logger });
 *
 * Adding a new AI capability = one CapabilityRegistry.register() call here,
 * one prompt file in ./prompts/, one policy row per tenant.
 * Layer 2 (AIRuntime) requires no modification.
 */

import type { AiLogMetrics, AnyDb, AiLogger }   from "./ai-runtime.types.js";
import { AutonomyResolver }        from "./autonomy-resolver.service.js";
import { ConfidenceResolver }      from "./confidence-resolver.service.js";
import { ModelRouter }             from "./model-router.js";
import {
  CapabilityRegistry,
  ClassifyCapability,
  SummarizeCapability,
  TranslateCapability,
} from "./capability-registry.js";
import { PromptStore }             from "./prompt-store.js";
import { ResponseValidator }       from "./response-validator.js";
import { EvidenceBinder }          from "./evidence-binder.js";
import { InferenceLogWriter }      from "./inference-log-writer.js";
import { FeedbackLogWriter }       from "./feedback-log-writer.js";
import { SecretResolver }          from "./secret-resolver.js";
import { ClaudeVisionProvider }    from "./providers/claude-vision.provider.js";
import { ClaudeTextProvider }      from "./providers/claude-text.provider.js";
import { EmbeddingsProvider }      from "./providers/embeddings.provider.js";
import { createAiRuntime }         from "./ai-runtime.js";
import { InvoiceExtractionCapability } from "./adapters/procurement-extraction.adapter.js";
import { registerAiRoutes }        from "./routes/ai.route.js";

// Re-export everything consumers need
export type { ActionRequest, ActionResponse } from "./ai-runtime.types.js";
export { ActionRequestSchema }               from "./ai-runtime.types.js";
export type { ExtractedDocumentOutput }      from "./adapters/procurement-extraction.adapter.js";
export { normaliseExtractedLines, persistExtractedLines } from "./adapters/procurement-extraction.adapter.js";
export { registerAiRoutes };
export { invalidateAutonomyPolicy } from "./autonomy-resolver.service.js";
export { invalidateConfidenceThreshold } from "./confidence-resolver.service.js";
export type { AiRouteDeps } from "./routes/ai.route.js";

// ── Redis shape (matches bootstrap-provided client) ───────────────────────────

interface RedisCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, flag: "EX", ttl: number): Promise<unknown>;
  del?(key: string | string[]): Promise<unknown>;
  scan?(
    cursor: string,
    matchFlag: "MATCH",
    pattern: string,
    countFlag: "COUNT",
    count: number,
  ): Promise<[string, string[]]>;
}

// ── Bundle creation ───────────────────────────────────────────────────────────

export interface AiServiceBundleOptions {
  db:     AnyDb;
  redis:  RedisCache;
  logger: AiLogger;
  metrics?: AiLogMetrics;
}

export interface AiServiceBundle {
  aiRuntime:          ReturnType<typeof createAiRuntime>;
  autonomyResolver:   AutonomyResolver;
  confidenceResolver: ConfidenceResolver;
  feedbackLogWriter:  FeedbackLogWriter;
  promptStore:        PromptStore;
}

export async function createAiServiceBundle(opts: AiServiceBundleOptions): Promise<AiServiceBundle> {
  const { db, redis, logger, metrics } = opts;
  const secrets = new SecretResolver();

  // ── Providers — registered in ModelRouter ──────────────────────────────────
  // Providers are optional: if the API key env var is absent, that provider is
  // silently skipped (no startup error).  If ALL providers are absent, any AI
  // action will fail with NO_PROVIDER_MATCHES_CAPABILITIES.
  const providers = [];

  if (secrets.has("ANTHROPIC_API_KEY")) {
    const key = secrets.resolve("ANTHROPIC_API_KEY");
    providers.push(new ClaudeVisionProvider(key));
    providers.push(new ClaudeTextProvider(key));
  } else {
    logger.warn("ai_provider_missing", { provider: "claude", reason: "ANTHROPIC_API_KEY not set — AI actions will fail" });
  }

  if (secrets.has("VOYAGE_API_KEY")) {
    providers.push(new EmbeddingsProvider(secrets.resolve("VOYAGE_API_KEY")));
  }

  const modelRouter = new ModelRouter(providers.length > 0 ? providers : [
    // Stub provider that always throws — surfaces NO_PROVIDER errors cleanly
    new ClaudeVisionProvider("no-key-configured"),
  ]);

  // ── Capability registry ────────────────────────────────────────────────────
  const capabilityRegistry = new CapabilityRegistry(logger);
  capabilityRegistry.register(new InvoiceExtractionCapability()); // extract_document / purchase_invoice
  capabilityRegistry.register(new ClassifyCapability());           // classify
  capabilityRegistry.register(new SummarizeCapability());          // summarize
  capabilityRegistry.register(new TranslateCapability());          // translate

  // ── Shared services ────────────────────────────────────────────────────────
  const promptStore         = new PromptStore();
  const evidenceBinder      = new EvidenceBinder();
  const inferenceLogWriter  = new InferenceLogWriter(db, logger, metrics);
  const feedbackLogWriter   = new FeedbackLogWriter(db, logger, metrics);
  const autonomyResolver    = new AutonomyResolver(db, redis, logger);
  const confidenceResolver  = new ConfidenceResolver(db, redis, logger);

  // Pre-load prompts directory (non-fatal if prompts/ dir is absent)
  await promptStore.init().catch((e) => logger.warn("ai_prompt_store_init_failed", { err: String(e) }));

  // ── Runtime orchestrator ───────────────────────────────────────────────────
  const aiRuntime = createAiRuntime({
    db,
    autonomyResolver,
    confidenceResolver,
    capabilityRegistry,
    inferenceLogWriter,
    modelRouter,
    promptStore,
    evidenceBinder,
    logger,
  });

  return { aiRuntime, autonomyResolver, confidenceResolver, feedbackLogWriter, promptStore };
}
