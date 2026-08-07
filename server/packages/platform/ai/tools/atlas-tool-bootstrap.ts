import type {
  PermissionResolverRegistry,
  VerifiedRequestContext,
} from "@athyper/svc-iam";
import type { AnyDb } from "../ai-runtime.types.js";
import type { AutonomyResolver } from "../autonomy-resolver.service.js";
import type { CapabilityRegistry } from "../capability-registry.js";
import type { ConfidenceResolver } from "../confidence-resolver.service.js";
import { AgentReadOnlyToolExecutor } from "./agent-read-only-tool-executor.js";
import { FoundationReadOnlyAtlasToolPolicyAdapter } from "./atlas-tool-policy.adapter.js";
import {
  AtlasToolRegistry,
  CapabilityRegistryToolImplementationBindingAdapter,
} from "./atlas-tool-registry.js";
import {
  ATLAS_CATALOG_HELP_FEATURE,
  ATLAS_TOOL_READ_ACTION,
  atlasCatalogHelpManifest,
  atlasCatalogHelpRegistration,
} from "./catalog-help.tool.js";
import { SqlAtlasToolAuthorizationRevalidator } from "./sql-atlas-tool-authorization-revalidator.js";
import { SqlAtlasToolExecutionRecorder } from "./sql-atlas-tool-execution-recorder.js";
import type {
  AtlasReadOnlyToolHandler,
  AtlasToolFeatureAdapter,
  AtlasToolGateway,
  AtlasToolRegistration,
} from "./atlas-tool.types.js";
import {
  ATLAS_RECORD_LOOKUP_FEATURE,
  atlasRecordLookupManifest,
  atlasRecordLookupRegistration,
} from "./record-lookup.tool.js";

const ATLAS_AGENT_FLAG = "atlas_agent_enabled";
const ATLAS_PERSISTENCE_FLAG = "atlas_conversation_persistence_enabled";
const ATLAS_TOOLS_FLAG = "atlas_agent_tools_enabled";

export interface StrictAtlasFeatureFlagResolver {
  isEnabledStrict(code: string, tenantId?: string): Promise<boolean>;
}

export interface GovernedAtlasToolBootstrapOptions {
  readonly db: AnyDb;
  readonly capabilities: CapabilityRegistry;
  readonly autonomy: Pick<AutonomyResolver, "resolveStrict">;
  readonly confidence: Pick<ConfidenceResolver, "resolveStrict">;
  readonly featureFlags: StrictAtlasFeatureFlagResolver;
  readonly permissionResolvers: PermissionResolverRegistry;
  readonly maximumTimeoutMs: number;
  readonly maximumResultBytes: number;
  readonly controlTimeoutMs?: number;
  readonly auditTimeoutMs?: number;
  /** Canonical server-service bridge; absence keeps record tools undiscoverable. */
  readonly dataGateway?: AtlasToolGateway;
}

export interface GovernedAtlasToolSubsystem {
  readonly registry: AtlasToolRegistry;
  readonly executor: AgentReadOnlyToolExecutor;
}

/**
 * Creates the default-off Phase 7C.1 server boundary. This function contains
 * the only production binding from the model-visible catalog tool to its
 * handler, IAM resolver, live feature gates, strict policy, and durable
 * invocation ledger.
 */
export function createGovernedAtlasToolSubsystem(
  options: GovernedAtlasToolBootstrapOptions,
): GovernedAtlasToolSubsystem {
  options.capabilities.declareGovernedAction(ATLAS_TOOL_READ_ACTION);
  const registrations: AtlasToolRegistration[] = [
    atlasCatalogHelpRegistration,
  ];
  const implementationBindings: Array<{
    actionCode: string;
    implementationBinding: string;
    handler: AtlasReadOnlyToolHandler;
  }> = [{
    actionCode: ATLAS_TOOL_READ_ACTION,
    implementationBinding:
      atlasCatalogHelpManifest.implementation.binding,
    handler: atlasCatalogHelpRegistration.handler,
  }];
  if (options.dataGateway) {
    registrations.push(atlasRecordLookupRegistration);
    implementationBindings.push({
      actionCode: ATLAS_TOOL_READ_ACTION,
      implementationBinding:
        atlasRecordLookupManifest.implementation.binding,
      handler: atlasRecordLookupRegistration.handler,
    });
  }
  const registry = new AtlasToolRegistry(
    registrations,
    new CapabilityRegistryToolImplementationBindingAdapter(
      options.capabilities,
      implementationBindings,
    ),
  );
  const features = new StrictConjunctiveAtlasToolFeatureAdapter(
    options.featureFlags,
  );
  const executor = new AgentReadOnlyToolExecutor({
    registry,
    features,
    policy: new FoundationReadOnlyAtlasToolPolicyAdapter(
      options.autonomy,
      options.confidence,
    ),
    authorizationRevalidator:
      new SqlAtlasToolAuthorizationRevalidator(
        options.db,
        options.permissionResolvers,
      ),
    recorder: new SqlAtlasToolExecutionRecorder(options.db),
    ...(options.dataGateway ? { dataGateway: options.dataGateway } : {}),
    maximumTimeoutMs: options.maximumTimeoutMs,
    maximumResultBytes: options.maximumResultBytes,
    controlTimeoutMs: options.controlTimeoutMs ?? 2_500,
    auditTimeoutMs: options.auditTimeoutMs ?? 2_500,
  });
  return Object.freeze({ registry, executor });
}

/**
 * Environment and route gates only decide whether discovery starts. Every
 * execution re-reads all tenant gates directly from the control database, and
 * the per-tool key can only reduce that common ceiling.
 */
export class StrictConjunctiveAtlasToolFeatureAdapter
implements AtlasToolFeatureAdapter {
  constructor(
    private readonly flags: StrictAtlasFeatureFlagResolver,
  ) {}

  async isEnabled(
    context: VerifiedRequestContext,
    featureKey: string,
  ): Promise<boolean> {
    return this.isEnabledStrict(context, featureKey);
  }

  async isEnabledStrict(
    context: VerifiedRequestContext,
    featureKey: string,
  ): Promise<boolean> {
    const toolFlags = featureKey === ATLAS_RECORD_LOOKUP_FEATURE
      ? [ATLAS_CATALOG_HELP_FEATURE, ATLAS_RECORD_LOOKUP_FEATURE]
      : [featureKey];
    const decisions = await Promise.all([
      ATLAS_AGENT_FLAG,
      ATLAS_PERSISTENCE_FLAG,
      ATLAS_TOOLS_FLAG,
      ...toolFlags,
    ].map((code) =>
      this.flags.isEnabledStrict(code, context.tenantId)
    ));
    return decisions.every((decision) => decision === true);
  }
}
