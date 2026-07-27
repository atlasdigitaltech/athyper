/**
 * AI Foundation — service factory and public API.
 *
 * Usage in api.ts:
 *
 *   import { createAiServiceBundle, registerAiRoutes } from
 *     "@athyper/svc-ai";
 *
 *   const aiBundle = createAiServiceBundle({
 *     db,
 *     redis,
 *     logger,
 *     environment: validatedServerConfig.env,
 *     atlasAgent: validatedServerConfig.atlasAgent,
 *   });
 *   registerAiRoutes(apiRouter, { ...aiBundle, auth, db, logger });
 *
 * Adding a new AI capability = one CapabilityRegistry.register() call here,
 * one prompt file in ./prompts/, one policy row per tenant.
 * Layer 2 (AIRuntime) requires no modification.
 */

import type { AiLogMetrics, AnyDb, AiLogger }   from "./ai-runtime.types.js";
import type { PermissionResolverRegistry } from "@athyper/svc-iam";
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
import {
  ProviderCredentialResolver,
} from "./provider-credential-resolver.js";
import { ClaudeVisionProvider }    from "./providers/claude-vision.provider.js";
import { ClaudeTextProvider }      from "./providers/claude-text.provider.js";
import { EmbeddingsProvider }      from "./providers/embeddings.provider.js";
import {
  OpenAiTextProvider,
  type OpenAiReadinessState,
} from "./providers/openai-text.provider.js";
import {
  GeminiTextProvider,
  type GeminiReadinessState,
} from "./providers/gemini-text.provider.js";
import { ProviderRegistry }        from "./providers/provider-registry.js";
import { createAiRuntime }         from "./ai-runtime.js";
import { InvoiceExtractionCapability } from "./adapters/procurement-extraction.adapter.js";
import { registerAiRoutes }        from "./routes/ai.route.js";
import { createAgentRuntime }      from "./agent/agent-runtime.js";
import {
  TransactionalAgentExecutionLedgerRecorder,
} from "./agent/agent-ledger-recorder.js";
import {
  CLAUDE_TEXT_ADAPTER_ID,
  GEMINI_INTERACTIONS_TEXT_ADAPTER_ID,
  OPENAI_RESPONSES_TEXT_ADAPTER_ID,
  createAnthropicAtlasBindings,
  createEffectiveModelCatalogResolver,
  createGeminiEvalBinding,
  createOpenAiEvalBinding,
  evaluateAtlasFoundationBindingPolicy,
  type EffectiveModelCatalogResolver,
} from "./agent/model-catalog.js";
import {
  createPhase0AtlasPlanePolicyResolver,
  type AtlasPlanePolicyResolver,
} from "./agent/plane-policy.js";
import {
  FixedWindowAgentRateLimiter,
  MemoryAgentCounterStore,
  RedisAgentCounterStore,
} from "./agent/rate-limit.js";
import { registerAiAgentRoutes }   from "./routes/ai-agent.route.js";
import { registerAiThreadRoutes }  from "./routes/ai-thread.route.js";
import {
  AtlasThreadService,
  SqlAtlasRetentionPolicyResolver,
  createPrincipalPrivateAtlasThreadAuthorizers,
} from "./conversation/atlas-thread.service.js";
import {
  SqlAtlasThreadRepository,
} from "./conversation/sql-atlas-thread.repository.js";
import {
  assertSensitiveAtlasRetentionReady,
  AtlasMessageContentProtector,
  type AtlasProtectedContentStore,
  type AtlasRetainedContentProtectionMode,
} from "./conversation/protected-content-store.js";
import {
  createGovernedAtlasToolSubsystem,
} from "./tools/atlas-tool-bootstrap.js";
import type { AtlasToolGateway } from "./tools/atlas-tool.types.js";

// Re-export everything consumers need
export type {
  ActionRequest,
  ActionResponse,
  AgentBindingMismatchMetric,
  AgentCatalogDenialMetric,
  AgentFeedbackMetricVerdict,
  AgentRateLimitMetric,
  AgentRunMetricObservation,
  AiLogKind,
  AiLogMetrics,
  AiLogger,
  AnyDb,
} from "./ai-runtime.types.js";
export { ActionRequestSchema }               from "./ai-runtime.types.js";
export type { ExtractedDocumentOutput, ExtractedLineItem } from "./adapters/procurement-extraction.adapter.js";
export { InvoiceExtractionCapability }      from "./adapters/procurement-extraction.adapter.js";
export { normaliseExtractedLines, persistExtractedLines } from "./adapters/procurement-extraction.adapter.js";
export { registerAiRoutes };
export { registerAiAgentRoutes };
export { registerAiThreadRoutes };
export {
  ATLAS_AGENT_GLOBAL_FLAG,
  ATLAS_AGENT_PLANE_FLAGS,
  ATLAS_PHASE0_PLANE_MATRIX,
  ATLAS_PHASE0_PLANE_POLICY_VERSION,
  createPhase0AtlasPlanePolicyResolver,
} from "./agent/plane-policy.js";
export type {
  AtlasPlaneAdmissionDecision,
  AtlasPlanePolicyFeatureFlags,
  AtlasPlanePolicyResolver,
  AtlasPlanePolicyResolverOptions,
} from "./agent/plane-policy.js";
export { invalidateAutonomyPolicy } from "./autonomy-resolver.service.js";
export { invalidateConfidenceThreshold } from "./confidence-resolver.service.js";
export type { AiRouteDeps } from "./routes/ai.route.js";
export type { AiAgentRouteDeps } from "./routes/ai-agent.route.js";
export type { AiThreadRouteDeps } from "./routes/ai-thread.route.js";
export {
  AtlasThreadPlaneAuthorizationRegistry,
  AtlasThreadService,
  AtlasThreadServiceError,
  FixedAtlasRetentionPolicyResolver,
  SqlAtlasRetentionPolicyResolver,
  PrincipalPrivateAtlasThreadAuthorizer,
  createPrincipalPrivateAtlasThreadAuthorizers,
} from "./conversation/atlas-thread.service.js";
export {
  SqlAtlasThreadMaintenanceAuthority,
  SqlAtlasThreadRepository,
} from "./conversation/sql-atlas-thread.repository.js";
export { AtlasThreadRepositoryError } from "./conversation/atlas-thread.types.js";
export {
  assertSensitiveAtlasRetentionReady,
  AtlasMessageContentProtector,
} from "./conversation/protected-content-store.js";
export type {
  AtlasProtectedContentRef,
  AtlasProtectedContentStore,
  AtlasRetainedContentProtectionMode,
  ProtectedAtlasMessageContent,
} from "./conversation/protected-content-store.js";
export type {
  AtlasAuthoritativeHistoryMessage,
  AtlasMessageListRequest,
  AtlasThreadListRequest,
  AtlasThreadMutationRequest,
  AtlasThreadServiceOptions,
  BeginAtlasThreadRunRequest,
  CancelAtlasThreadRunRequest,
  CompleteAtlasThreadRunRequest,
  CreateAtlasThreadInput,
  FailAtlasThreadRunRequest,
  FinalizeAtlasConversationRunRequest,
  FixedAtlasRetentionPolicyOptions,
  PreparedAtlasConversationRun,
  PrepareAtlasConversationRunRequest,
} from "./conversation/atlas-thread.service.js";
export type {
  AtlasActiveRunStatus,
  AtlasMessageCursor,
  AtlasMessageRecord,
  AtlasMessageRole,
  AtlasMessageStatus,
  AtlasPage,
  AtlasRetentionPolicy,
  AtlasRetentionPolicyResolver,
  AtlasRunRecord,
  AtlasStoredContentBlock,
  AtlasStoredJson,
  AtlasThreadAccess,
  AtlasThreadCursor,
  AtlasThreadMaintenanceAuthority,
  AtlasThreadPlane,
  AtlasThreadPlaneAuthorizationAdapter,
  AtlasThreadRecord,
  AtlasThreadTranscript,
  AtlasThreadRepository,
  AtlasThreadRepositoryScope,
  AtlasThreadRetention,
  AtlasThreadStatus,
  BeginAtlasRunResult,
  PurgeAtlasThreadsResult,
} from "./conversation/atlas-thread.types.js";
export type {
  SqlAtlasThreadMaintenanceOptions,
} from "./conversation/sql-atlas-thread.repository.js";
export {
  AtlasDataGateway,
  AtlasDataGatewayError,
} from "./atlas-data-gateway.js";
export { AtlasRetrievalService } from "./retrieval/atlas-retrieval.service.js";
export { AtlasTenantSupportThreadFactory } from "./conversation/atlas-support-thread.factory.js";
export { readAtlasByokConfig, type AtlasByokConfig, type AtlasByokBackend } from "./byok/byok-config.js";
export { SqlTenantProviderSecretStore } from "./byok/sql-tenant-provider-secret.store.js";
export { SqlTenantByokAuditSink } from "./byok/sql-tenant-byok-audit.sink.js";
export {
  TenantProviderCredentialRotationService,
  type AtlasByokRevocationPublisher,
} from "./byok/tenant-provider-credential-rotation.service.js";
export { chunkAtlasKnowledgeText } from "./retrieval/atlas-knowledge-chunker.js";
export type { AtlasKnowledgeChunkDraft } from "./retrieval/atlas-knowledge-chunker.js";
export type {
  AtlasCitation,
  AtlasKnowledgeCatalog,
  AtlasKnowledgeChunkMaterializer,
  AtlasKnowledgeRevision,
  AtlasKnowledgeSource,
  AtlasRetrievedPassage,
  AtlasRetrievalCandidate,
  AtlasRetrievalIndex,
  AtlasRetrievalRequest,
} from "./retrieval/atlas-retrieval.types.js";
export type {
  AtlasDataGatewayDependencies,
  AtlasDataReadRequest,
  AtlasDataReadResult,
  AtlasLoadedData,
  AtlasSourceIdentity,
} from "./atlas-data-gateway.js";
export {
  ProviderCredentialResolver,
  ProviderCredentialUnavailableError,
} from "./provider-credential-resolver.js";
export { TenantByokCredentialResolver } from "./byok/tenant-provider-credential-resolver.js";
export type {
  TenantByokAuditSink,
  TenantByokCredentialLease,
  TenantByokCredentialResolverOptions,
  TenantProviderSecretStore,
} from "./byok/tenant-provider-credential-resolver.js";
export type {
  ProviderCredentialMetadata,
  ProviderCredentialRequest,
  ProviderCredentialResolution,
} from "./provider-credential-resolver.js";
export {
  AgentCallLedgerWriter,
  AgentRunLedgerWriter,
} from "./agent-run-ledger-writer.js";
export {
  AgentExecutionLedgerRecorder,
  TransactionalAgentExecutionLedgerRecorder,
} from "./agent/agent-ledger-recorder.js";
export {
  SqlAtlasToolExecutionRecorder,
  SqlAtlasToolExecutionRecorderError,
} from "./tools/sql-atlas-tool-execution-recorder.js";
export type {
  SqlAtlasToolExecutionRecorderOptions,
} from "./tools/sql-atlas-tool-execution-recorder.js";
export {
  SqlAtlasToolAuthorizationRevalidator,
} from "./tools/sql-atlas-tool-authorization-revalidator.js";
export type {
  SqlAtlasToolAuthorizationRevalidatorOptions,
} from "./tools/sql-atlas-tool-authorization-revalidator.js";
export {
  SqlAtlasToolInvocationMaintenanceAuthority,
} from "./tools/sql-atlas-tool-invocation-maintenance.js";
export type {
  RecoverStaleAtlasToolInvocationsInput,
  RecoverStaleAtlasToolInvocationsResult,
  SqlAtlasToolInvocationMaintenanceOptions,
} from "./tools/sql-atlas-tool-invocation-maintenance.js";
export {
  SqlAtlasToolInvocationRecoveryAdminService,
} from "./tools/sql-atlas-tool-invocation-recovery.service.js";
export type {
  RecoverEligibleAtlasToolInvocationsInput,
  RecoverEligibleAtlasToolInvocationsResult,
  SqlAtlasToolInvocationRecoveryAdminOptions,
} from "./tools/sql-atlas-tool-invocation-recovery.service.js";
export {
  createGovernedAtlasToolSubsystem,
  StrictConjunctiveAtlasToolFeatureAdapter,
} from "./tools/atlas-tool-bootstrap.js";
export type {
  GovernedAtlasToolBootstrapOptions,
  GovernedAtlasToolSubsystem,
  StrictAtlasFeatureFlagResolver,
} from "./tools/atlas-tool-bootstrap.js";
export {
  AgentReadOnlyToolExecutor,
} from "./tools/agent-read-only-tool-executor.js";
export {
  AtlasToolRegistry,
  AtlasToolRegistryError,
  CapabilityRegistryToolImplementationBindingAdapter,
} from "./tools/atlas-tool-registry.js";
export {
  ATLAS_CATALOG_HELP_FEATURE,
  ATLAS_CATALOG_HELP_TOOL_NAME,
  ATLAS_TOOL_READ_ACTION,
  ATLAS_TOOL_READ_PERMISSION,
  atlasCatalogHelpManifest,
} from "./tools/catalog-help.tool.js";
export {
  ATLAS_ENTITY_READ_PERMISSION,
  ATLAS_RECORD_LOOKUP_FEATURE,
  ATLAS_RECORD_LOOKUP_TOOL_NAME,
  atlasRecordLookupManifest,
} from "./tools/record-lookup.tool.js";
export type {
  AtlasEffectiveToolDefinition,
  AtlasObservedToolInvocation,
  AtlasToolExecutionInput,
  AtlasToolExecutionResult,
  AtlasToolManifestV1,
} from "./tools/atlas-tool.types.js";

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
  incr?(key: string): Promise<number>;
  expire?(key: string, seconds: number): Promise<unknown>;
  eval?(
    script: string,
    numberOfKeys: number,
    key: string,
    ttlSeconds: number,
  ): Promise<unknown>;
}

// ── Bundle creation ───────────────────────────────────────────────────────────

export interface AiServiceBundleOptions {
  db:     AnyDb;
  redis:  RedisCache;
  logger: AiLogger;
  environment: "local" | "staging" | "production";
  metrics?: AiLogMetrics;
  featureFlags?: {
    isEnabled(code: string, tenantId?: string): Promise<boolean>;
    isEnabledStrict?(code: string, tenantId?: string): Promise<boolean>;
  };
  permissionResolverRegistry?: PermissionResolverRegistry;
  /**
   * Supplied only by an approved server composition root. The API process
   * never constructs tenant encryption from browser or tenant input.
   */
  atlasProtectedContentStore?: AtlasProtectedContentStore;
  /** Canonical records-service bridge; never an HTTP or browser adapter. */
  atlasDataGateway?: AtlasToolGateway;
  atlasAgent: {
    enabled: boolean;
    defaultPublicModelId: "atlas-fast" | "atlas-balanced" | "atlas-best";
    credentialFingerprintKey?: string;
    providerTimeoutMs: number;
    streamIdleTimeoutMs: number;
    maxOutputTokens: number;
    maxOutputBytes: number;
    userRunsPerMinute: number;
    tenantRunsPerMinute: number;
    tools: {
      enabled: boolean;
      maxRounds: number;
      maxCalls: number;
      maxElapsedMs: number;
      maxTotalTokens: number;
      timeoutMs: number;
      maxInputBytes: number;
      maxResultBytes: number;
    };
    persistence: {
      enabled: boolean;
      maintenanceDatabaseUrl?: string;
      contentProtectionMode?: AtlasRetainedContentProtectionMode;
      defaultRetentionDays: number;
      minimumRetentionDays: number;
      maximumRetentionDays: number;
      contextMaxMessages: number;
      contextMaxCharacters: number;
      staleRunTimeoutMs: number;
      purgeBatchSize: number;
    };
    anthropic: {
      fastModelId: string;
      balancedModelId: string;
      bestModelId: string;
    };
    openai: {
      enabled: boolean;
      evalModelId: "gpt-5.6-sol";
      projectId?: string;
      timeoutMs: number;
    };
    gemini: {
      enabled: boolean;
      evalModelId: "gemini-3.6-flash";
      projectId?: string;
      providerRegion?: "global";
      accountClass?: "free" | "paid";
      timeoutMs: number;
    };
  };
}

export interface AgentProviderReadiness {
  enabled: boolean;
  implemented: boolean;
  credentialed: boolean;
  healthy: boolean;
  eligible: boolean;
  reason: string;
}

export interface AiServiceBundle {
  aiRuntime:          ReturnType<typeof createAiRuntime>;
  autonomyResolver:   AutonomyResolver;
  confidenceResolver: ConfidenceResolver;
  feedbackLogWriter:  FeedbackLogWriter;
  promptStore:        PromptStore;
  agentRuntime:       ReturnType<typeof createAgentRuntime>;
  agentCatalogResolver: EffectiveModelCatalogResolver;
  agentPlanePolicyResolver: AtlasPlanePolicyResolver;
  agentRateLimiter:   FixedWindowAgentRateLimiter;
  atlasThreadService: AtlasThreadService;
  agentToolReadiness: Readonly<{
    enabled: boolean;
    registeredToolNames: readonly string[];
  }>;
  agentProviderReadiness: Readonly<{
    anthropic: AgentProviderReadiness;
    openai: AgentProviderReadiness;
    gemini: AgentProviderReadiness;
  }>;
}

export async function createAiServiceBundle(opts: AiServiceBundleOptions): Promise<AiServiceBundle> {
  const { db, redis, logger, metrics, atlasAgent, environment } = opts;
  const secrets = new SecretResolver();

  // ── Providers — registered in ModelRouter ──────────────────────────────────
  // Providers are optional: if the API key env var is absent, that provider is
  // silently skipped (no startup error).  If ALL providers are absent, any AI
  // action will fail with NO_PROVIDER_MATCHES_CAPABILITIES.
  const providers = [];
  const agentRegistry = new ProviderRegistry();
  let agentCredentialResolver: ProviderCredentialResolver | undefined;
  let anthropicReadiness: AgentProviderReadiness = {
    enabled: atlasAgent.enabled,
    implemented: true,
    credentialed: false,
    healthy: false,
    eligible: false,
    reason: atlasAgent.enabled
      ? "credential_not_checked"
      : "atlas_agent_disabled",
  };
  let openAiReadiness: AgentProviderReadiness = {
    enabled: atlasAgent.enabled && atlasAgent.openai.enabled,
    implemented: true,
    credentialed: false,
    healthy: false,
    eligible: false,
    reason: !atlasAgent.enabled
      ? "atlas_agent_disabled"
      : atlasAgent.openai.enabled
        ? "credential_not_checked"
        : "provider_disabled",
  };
  let geminiReadiness: AgentProviderReadiness = {
    enabled: atlasAgent.enabled && atlasAgent.gemini.enabled,
    implemented: true,
    credentialed: false,
    healthy: false,
    eligible: false,
    reason: !atlasAgent.enabled
      ? "atlas_agent_disabled"
      : atlasAgent.gemini.enabled
        ? "credential_not_checked"
        : "provider_disabled",
  };

  if (secrets.has("ANTHROPIC_API_KEY")) {
    const key = secrets.resolve("ANTHROPIC_API_KEY");
    providers.push(new ClaudeVisionProvider(key));
    providers.push(new ClaudeTextProvider(key));
  } else {
    logger.warn("ai_provider_missing", { provider: "claude", reason: "ANTHROPIC_API_KEY not set - AI actions will fail" });
  }

  if (!atlasAgent.enabled) {
    logger.info("atlas_agent_provider_disabled", { provider: "anthropic" });
    logger.info("atlas_agent_provider_disabled", { provider: "openai" });
    logger.info("atlas_agent_provider_disabled", { provider: "gemini" });
  } else if (!atlasAgent.credentialFingerprintKey) {
    logger.warn("atlas_agent_provider_not_ready", {
      provider: "anthropic",
      reason: "credential_fingerprint_key_missing",
    });
    anthropicReadiness = {
      ...anthropicReadiness,
      reason: "credential_fingerprint_key_missing",
    };
    if (atlasAgent.openai.enabled) {
      logger.warn("atlas_agent_provider_not_ready", {
        provider: "openai",
        reason: "credential_fingerprint_key_missing",
      });
      openAiReadiness = {
        ...openAiReadiness,
        reason: "credential_fingerprint_key_missing",
      };
    }
    if (atlasAgent.gemini.enabled) {
      logger.warn("atlas_agent_provider_not_ready", {
        provider: "gemini",
        reason: "credential_fingerprint_key_missing",
      });
      geminiReadiness = {
        ...geminiReadiness,
        reason: "credential_fingerprint_key_missing",
      };
    }
  } else {
    const credentialResolver = new ProviderCredentialResolver(secrets, {
      fingerprintKey: atlasAgent.credentialFingerprintKey,
    });
    agentCredentialResolver = credentialResolver;
    const anthropicCredential = await credentialResolver.resolve({
      providerId: "anthropic",
      secretRef: "ANTHROPIC_API_KEY",
      owner: "platform",
    });
    if (anthropicCredential.ready) {
      agentRegistry.register(
        "anthropic",
        // Atlas receives a fresh request-scoped credential lease below. Do
        // not retain another copy of the secret in this adapter instance.
        new ClaudeTextProvider(""),
        {
          implemented: true,
          credentialed: true,
          healthy: true,
          eligible: true,
          reason: "credential_configured_not_live_verified",
        },
      );
      anthropicReadiness = {
        enabled: true,
        implemented: true,
        credentialed: true,
        healthy: true,
        eligible: true,
        reason: "credential_configured_not_live_verified",
      };
    } else {
      logger.warn("atlas_agent_provider_not_ready", {
        provider: "anthropic",
        reason: anthropicCredential.reasonCode,
        readiness: anthropicCredential.metadata.readiness,
      });
      anthropicReadiness = {
        ...anthropicReadiness,
        reason: anthropicCredential.reasonCode,
      };
    }

    if (!atlasAgent.openai.enabled) {
      logger.info("atlas_agent_provider_disabled", { provider: "openai" });
    } else {
      const openAiCredential = await credentialResolver.resolve({
        providerId: "openai",
        secretRef: "OPENAI_API_KEY",
        owner: "platform",
      });
      if (!openAiCredential.ready) {
        logger.warn("atlas_agent_provider_not_ready", {
          provider: "openai",
          reason: openAiCredential.reasonCode,
          readiness: openAiCredential.metadata.readiness,
        });
        openAiReadiness = {
          ...openAiReadiness,
          reason: openAiCredential.reasonCode,
        };
      } else {
        // The long-lived adapter retains no credential. The secret is used by
        // this bounded no-content model metadata probe and is resolved again
        // for each request below.
        const openAiProvider = new OpenAiTextProvider({
          projectId: atlasAgent.openai.projectId,
          timeoutMs: atlasAgent.openai.timeoutMs,
          defaultModelId: atlasAgent.openai.evalModelId,
        });
        let probe: OpenAiReadinessState;
        try {
          probe = await openAiProvider.checkReadiness(
            atlasAgent.openai.evalModelId,
            { credential: { secret: openAiCredential.secret } },
          );
        } catch {
          // The adapter normally converts upstream failures into safe states.
          // A programming/runtime exception must still fail this optional
          // binding closed without taking the Anthropic baseline down.
          probe = {
            modelId: atlasAgent.openai.evalModelId,
            implemented: true,
            credentialed: true,
            healthy: false,
            eligible: false,
            reason: "provider_error",
            retryable: true,
            errorClass: "upstream_error",
          };
        }
        openAiReadiness = toAgentProviderReadiness(true, probe);
        if (probe.eligible) {
          agentRegistry.register("openai", openAiProvider, probe);
        } else {
          logger.warn("atlas_agent_provider_not_ready", {
            provider: "openai",
            reason: probe.reason,
            retryable: probe.retryable,
          });
        }
      }
    }

    if (!atlasAgent.gemini.enabled) {
      logger.info("atlas_agent_provider_disabled", { provider: "gemini" });
    } else if (
      !atlasAgent.gemini.projectId
      || !atlasAgent.gemini.providerRegion
      || !atlasAgent.gemini.accountClass
    ) {
      logger.warn("atlas_agent_provider_not_ready", {
        provider: "gemini",
        reason: "provider_configuration_invalid",
      });
      geminiReadiness = {
        ...geminiReadiness,
        reason: "provider_configuration_invalid",
      };
    } else if (
      atlasAgent.gemini.accountClass === "free"
      && environment !== "local"
    ) {
      logger.warn("atlas_agent_provider_not_ready", {
        provider: "gemini",
        reason: "free_account_local_only",
      });
      geminiReadiness = {
        ...geminiReadiness,
        reason: "free_account_local_only",
      };
    } else {
      const geminiCredentialOwner =
        atlasAgent.gemini.accountClass === "free"
          ? "developer" as const
          : "platform" as const;
      const geminiCredential = await credentialResolver.resolve({
        providerId: "gemini",
        secretRef: "GEMINI_API_KEY",
        owner: geminiCredentialOwner,
      });
      if (!geminiCredential.ready) {
        logger.warn("atlas_agent_provider_not_ready", {
          provider: "gemini",
          reason: geminiCredential.reasonCode,
          readiness: geminiCredential.metadata.readiness,
        });
        geminiReadiness = {
          ...geminiReadiness,
          reason: geminiCredential.reasonCode,
        };
      } else {
        const providerAccountClass =
          atlasAgent.gemini.accountClass === "paid"
            ? "platform_paid" as const
            : "developer_free" as const;
        const geminiProvider = new GeminiTextProvider({
          projectId: atlasAgent.gemini.projectId,
          providerRegion: atlasAgent.gemini.providerRegion,
          providerAccountClass,
          timeoutMs: atlasAgent.gemini.timeoutMs,
          defaultModelId: atlasAgent.gemini.evalModelId,
        });
        let probe: GeminiReadinessState;
        try {
          probe = await geminiProvider.checkReadiness(
            atlasAgent.gemini.evalModelId,
            { credential: { secret: geminiCredential.secret } },
          );
        } catch {
          probe = {
            modelId: atlasAgent.gemini.evalModelId,
            implemented: true,
            credentialed: true,
            healthy: false,
            eligible: false,
            reason: "provider_error",
            retryable: true,
            errorClass: "upstream_error",
          };
        }
        geminiReadiness = toAgentProviderReadiness(true, probe);
        if (probe.eligible) {
          agentRegistry.register("gemini", geminiProvider, probe);
        } else {
          logger.warn("atlas_agent_provider_not_ready", {
            provider: "gemini",
            reason: probe.reason,
            retryable: probe.retryable,
          });
        }
      }
    }
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
  const agentLedgerRecorder = new TransactionalAgentExecutionLedgerRecorder(
    db,
    logger,
    metrics,
  );
  const autonomyResolver    = new AutonomyResolver(db, redis, logger);
  const confidenceResolver  = new ConfidenceResolver(db, redis, logger);
  let governedTools:
    ReturnType<typeof createGovernedAtlasToolSubsystem> | undefined;
  if (atlasAgent.tools.enabled) {
    if (!atlasAgent.persistence.enabled) {
      throw new Error(
        "Atlas governed tools require durable conversation persistence.",
      );
    }
    const strictFeatureResolver = opts.featureFlags?.isEnabledStrict;
    if (!strictFeatureResolver) {
      throw new Error(
        "Atlas governed tools require uncached strict feature resolution.",
      );
    }
    if (!opts.permissionResolverRegistry) {
      throw new Error(
        "Atlas governed tools require live IAM permission revalidation.",
      );
    }
    governedTools = createGovernedAtlasToolSubsystem({
      db,
      capabilities: capabilityRegistry,
      autonomy: autonomyResolver,
      confidence: confidenceResolver,
      featureFlags: {
        isEnabledStrict: (code, tenantId) =>
          strictFeatureResolver.call(opts.featureFlags, code, tenantId),
      },
      permissionResolvers: opts.permissionResolverRegistry,
      maximumTimeoutMs: atlasAgent.tools.timeoutMs,
      maximumResultBytes: atlasAgent.tools.maxResultBytes,
      ...(opts.atlasDataGateway
        ? { dataGateway: opts.atlasDataGateway }
        : {}),
    });
  }

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

  const agentBindings = createAnthropicAtlasBindings({
    fastUpstreamModelId: atlasAgent.anthropic.fastModelId,
    balancedUpstreamModelId: atlasAgent.anthropic.balancedModelId,
    bestUpstreamModelId: atlasAgent.anthropic.bestModelId,
    toolsEnabled: atlasAgent.tools.enabled,
  });
  if (openAiReadiness.eligible) {
    agentBindings.push(createOpenAiEvalBinding({
      evalUpstreamModelId: atlasAgent.openai.evalModelId,
      toolsEnabled: atlasAgent.tools.enabled,
    }));
  }
  if (
    geminiReadiness.eligible
    && atlasAgent.gemini.accountClass
    && atlasAgent.gemini.providerRegion
  ) {
    agentBindings.push(createGeminiEvalBinding({
      evalUpstreamModelId: atlasAgent.gemini.evalModelId,
      accountClass: atlasAgent.gemini.accountClass,
      providerRegion: atlasAgent.gemini.providerRegion,
    }));
  }
  const atlasFeatureFlags = opts.featureFlags;
  const agentPlanePolicyResolver = createPhase0AtlasPlanePolicyResolver({
    featureFlags: {
      isEnabled: atlasFeatureFlags?.isEnabled
        ? (code, tenantId) =>
            atlasFeatureFlags.isEnabled(code, tenantId)
        : async () => false,
    },
    evaluateBinding: evaluateAtlasFoundationBindingPolicy,
  });
  const agentCatalogResolver = createEffectiveModelCatalogResolver({
    registry: agentRegistry,
    bindings: agentBindings,
    defaultPublicModelId: atlasAgent.defaultPublicModelId,
    resolvePolicy: (session) =>
      agentPlanePolicyResolver.resolveBindingPolicy(session),
  });
  let atlasContentProtector: AtlasMessageContentProtector | undefined;
  const contentProtectionMode =
    atlasAgent.persistence.contentProtectionMode
    ?? "database_at_rest_non_sensitive_only";
  if (
    atlasAgent.persistence.enabled
    && contentProtectionMode === "tenant_protected_store"
  ) {
    await assertSensitiveAtlasRetentionReady({
      mode: contentProtectionMode,
      store: opts.atlasProtectedContentStore,
    });
    atlasContentProtector = new AtlasMessageContentProtector(
      opts.atlasProtectedContentStore!,
    );
  }
  const atlasThreadService = new AtlasThreadService({
    repository: new SqlAtlasThreadRepository(db, atlasContentProtector),
    retentionPolicies: new SqlAtlasRetentionPolicyResolver(db, {
      defaultRetentionDays: atlasAgent.persistence.defaultRetentionDays,
      minimumRetentionDays: atlasAgent.persistence.minimumRetentionDays,
      maximumRetentionDays: atlasAgent.persistence.maximumRetentionDays,
    }),
    authorizers: createPrincipalPrivateAtlasThreadAuthorizers(),
    purgeBatchSize: atlasAgent.persistence.purgeBatchSize,
    contextMaxMessages: atlasAgent.persistence.contextMaxMessages,
    contextMaxCharacters: atlasAgent.persistence.contextMaxCharacters,
    staleRunTimeoutMs: atlasAgent.persistence.staleRunTimeoutMs,
  });
  const agentRuntime = createAgentRuntime({
    registry: agentRegistry,
    catalogResolver: agentCatalogResolver,
    logger,
    metrics,
    maxOutputTokens: atlasAgent.maxOutputTokens,
    maxOutputBytes: atlasAgent.maxOutputBytes,
    providerTimeoutMs: atlasAgent.providerTimeoutMs,
    streamIdleTimeoutMs: atlasAgent.streamIdleTimeoutMs,
    ...(agentCredentialResolver
      ? {
          credentials: {
            resolveForBinding: async (binding) => {
              const secretRef =
                binding.providerId === "anthropic"
                  ? "ANTHROPIC_API_KEY"
                  : binding.providerId === "openai"
                    ? "OPENAI_API_KEY"
                    : binding.providerId === "gemini"
                      ? "GEMINI_API_KEY"
                    : null;
              if (!secretRef) return null;
              const credential = await agentCredentialResolver!.resolve({
                providerId: binding.providerId,
                secretRef,
                owner:
                  binding.providerAccountClass === "developer_free"
                    ? "developer"
                    : "platform",
              });
              if (!credential.ready) {
                logger.warn("atlas_agent_provider_credential_unavailable", {
                  provider: binding.providerId,
                  bindingId: binding.bindingId,
                  reason: credential.reasonCode,
                  readiness: credential.metadata.readiness,
                });
                return null;
              }
              return {
                secret: credential.secret,
                metadata: {
                  owner: credential.metadata.owner,
                  source: credential.metadata.source,
                  referenceFingerprint:
                    credential.metadata.referenceFingerprint,
                  fingerprint: credential.metadata.credentialFingerprint,
                },
              };
            },
          },
        }
      : {}),
    ledger: {
      recorder: agentLedgerRecorder,
    },
    ...(atlasAgent.persistence.enabled
      ? {
          persistence: {
            coordinator: atlasThreadService,
          },
        }
      : {}),
    ...(governedTools
      ? {
          tools: {
            executor: governedTools.executor,
            maxRounds: atlasAgent.tools.maxRounds,
            maxCalls: atlasAgent.tools.maxCalls,
            maxElapsedMs: atlasAgent.tools.maxElapsedMs,
            maxInputBytes: atlasAgent.tools.maxInputBytes,
            maxResultBytes: atlasAgent.tools.maxResultBytes,
            maxTotalTokens: atlasAgent.tools.maxTotalTokens,
          },
        }
      : {}),
  });
  const counterStore = redis.eval
    ? new RedisAgentCounterStore({
        eval: (script, numberOfKeys, key, ttlSeconds) =>
          redis.eval!(script, numberOfKeys, key, ttlSeconds),
      })
    : new MemoryAgentCounterStore();
  const agentRateLimiter = new FixedWindowAgentRateLimiter(counterStore, {
    userRunsPerMinute: atlasAgent.userRunsPerMinute,
    tenantRunsPerMinute: atlasAgent.tenantRunsPerMinute,
  });

  return {
    aiRuntime,
    autonomyResolver,
    confidenceResolver,
    feedbackLogWriter,
    promptStore,
    agentRuntime,
    agentCatalogResolver,
    agentPlanePolicyResolver,
    agentRateLimiter,
    atlasThreadService,
    agentToolReadiness: Object.freeze({
      enabled: governedTools !== undefined,
      registeredToolNames: Object.freeze(
        governedTools?.registry.list().map(({ manifest }) => manifest.name)
          ?? [],
      ),
    }),
    agentProviderReadiness: Object.freeze({
      get anthropic(): AgentProviderReadiness {
        return Object.freeze(currentAgentProviderReadiness(
          agentRegistry,
          "anthropic",
          CLAUDE_TEXT_ADAPTER_ID,
          anthropicReadiness,
        ));
      },
      get openai(): AgentProviderReadiness {
        return Object.freeze(currentAgentProviderReadiness(
          agentRegistry,
          "openai",
          OPENAI_RESPONSES_TEXT_ADAPTER_ID,
          openAiReadiness,
        ));
      },
      get gemini(): AgentProviderReadiness {
        return Object.freeze(currentAgentProviderReadiness(
          agentRegistry,
          "gemini",
          GEMINI_INTERACTIONS_TEXT_ADAPTER_ID,
          geminiReadiness,
        ));
      },
    }),
  };
}

function currentAgentProviderReadiness(
  registry: ProviderRegistry,
  providerId: string,
  adapterId: string,
  startup: AgentProviderReadiness,
): AgentProviderReadiness {
  const current = registry.getRegistration(providerId, adapterId)?.state;
  if (!current) return { ...startup };
  return {
    enabled: startup.enabled,
    implemented: current.implemented,
    credentialed: current.credentialed,
    healthy: current.healthy,
    eligible: current.eligible,
    reason: current.reason
      ?? (current.eligible ? "ready" : "adapter_not_operational"),
  };
}

function toAgentProviderReadiness(
  enabled: boolean,
  state: Pick<
    OpenAiReadinessState,
    "implemented" | "credentialed" | "healthy" | "eligible"
  > & { reason?: string },
): AgentProviderReadiness {
  return {
    enabled,
    implemented: state.implemented,
    credentialed: state.credentialed,
    healthy: state.healthy,
    eligible: state.eligible,
    reason: state.reason
      ?? (state.eligible ? "ready" : "adapter_not_operational"),
  };
}
