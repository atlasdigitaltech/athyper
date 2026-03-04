/**
 * Policy Gate Service
 *
 * A6: Integration Points
 * Main facade for authorization - ties all policy services together
 *
 * Usage:
 * - Direct authorization: gate.authorize(request)
 * - Quick check: gate.can(principalId, tenantId, operation, resource)
 * - Middleware: gate.createMiddleware()
 * - Entity API: gate.authorizeEntity(...)
 */

import { DatabasePersonaCapabilityRepository } from "../foundation/iam/persona-model/persona-capability.repository.js";
import {
  PersonaCapabilityService,
  type IPersonaCapabilityService,
} from "../foundation/iam/persona-model/persona-capability.service.js";
import { PersonaRegistryService } from "../foundation/iam/persona-model/persona-registry.service.js";
import { RoleBindingService } from "../identity-access/role-binding.service.js";

import {
  DecisionLoggerService,
  type DecisionLoggerConfig,
} from "./decision-logger.service.js";
import { OperationCatalogService } from "./operation-catalog.service.js";
import { PolicyCompilerService } from "./policy-compiler.service.js";
import { PolicyResolutionService } from "./policy-resolution.service.js";
import { RuleEvaluatorService } from "./rule-evaluator.service.js";
import { SubjectResolverService } from "./subject-resolver.service.js";

import type {
  AuthorizationDecision,
  AuthorizationRequest,
  IPolicyGate,
  OperationCode,
  ResourceDescriptor,
  SubjectSnapshot,
} from "./types.js";
import type {
  AuthorizationDecision as PersonaAuthDecision,
  CapabilityCheckResult,
  CapabilityContext,
  PersonaCode,
} from "../foundation/iam/persona-model/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

/**
 * Policy Gate configuration
 */
export type PolicyGateConfig = {
  /** Enable authorization (false = allow all) */
  enabled: boolean;

  /** Default effect when no rules match */
  defaultEffect: "allow" | "deny";

  /** Enable decision logging */
  loggingEnabled: boolean;

  /** Decision logger config */
  loggerConfig?: Partial<DecisionLoggerConfig>;

  /** Subject cache TTL in ms */
  subjectCacheTtlMs: number;

  /** Enable persona-based capability checks (default: true) */
  personaCapabilitiesEnabled: boolean;

  /** Persona capability cache TTL in ms */
  personaCapabilityCacheTtlMs: number;
};

const DEFAULT_CONFIG: PolicyGateConfig = {
  enabled: true,
  defaultEffect: "deny",
  loggingEnabled: true,
  subjectCacheTtlMs: 5 * 60 * 1000, // 5 minutes
  personaCapabilitiesEnabled: true,
  personaCapabilityCacheTtlMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * Policy Gate Service - Main authorization entry point
 */
export class PolicyGateService implements IPolicyGate {
  private readonly ruleEvaluator: RuleEvaluatorService;
  private readonly subjectResolver: SubjectResolverService;
  private readonly policyCompiler: PolicyCompilerService;
  private readonly policyResolution: PolicyResolutionService;
  private readonly operationCatalog: OperationCatalogService;
  private readonly decisionLogger: DecisionLoggerService;
  private readonly personaCapability: IPersonaCapabilityService;
  private readonly roleBinding: RoleBindingService;
  private readonly config: PolicyGateConfig;
  private readonly db: Kysely<DB>;

  constructor(db: Kysely<DB>, config?: Partial<PolicyGateConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize all services
    this.operationCatalog = new OperationCatalogService(db);
    this.policyResolution = new PolicyResolutionService(db);
    this.policyCompiler = new PolicyCompilerService(db);
    this.subjectResolver = new SubjectResolverService(db);
    this.decisionLogger = new DecisionLoggerService(
      db,
      this.config.loggerConfig,
    );

    // Initialize persona registry (DB-driven priorities)
    const personaCapabilityRepo = new DatabasePersonaCapabilityRepository(db);
    const noopLogger = {
      info() {},
      warn() {},
      error() {},
      debug() {},
      trace() {},
      fatal() {},
      log() {},
    } as any;
    const personaRegistry = new PersonaRegistryService(
      personaCapabilityRepo,
      noopLogger,
    );

    // Initialize persona capability service with registry
    this.personaCapability = new PersonaCapabilityService(
      personaCapabilityRepo,
      noopLogger,
      {
        cacheTtlMs: this.config.personaCapabilityCacheTtlMs,
        registry: personaRegistry,
      },
    );

    // Initialize role binding service with registry
    this.roleBinding = new RoleBindingService(db, personaRegistry);

    // Initialize rule evaluator with all dependencies
    this.ruleEvaluator = new RuleEvaluatorService(
      db,
      this.subjectResolver,
      this.policyCompiler,
      this.policyResolution,
      this.operationCatalog,
    );

    // Set subject cache TTL
    this.subjectResolver.setCacheTtl(this.config.subjectCacheTtlMs);
  }

  /**
   * Main authorization method
   */
  async authorize(
    request: AuthorizationRequest,
  ): Promise<AuthorizationDecision> {
    // If disabled, allow all
    if (!this.config.enabled) {
      return {
        effect: "allow",
        principalId: request.principalId,
        operationCode: request.operationCode,
        resourceKey: this.buildResourceKey(request.resource),
        reason: "Authorization disabled",
      };
    }

    // Get subject for logging
    let subject: SubjectSnapshot | null = null;
    try {
      subject = await this.subjectResolver.resolveSubject(
        request.principalId,
        request.tenantId,
      );
    } catch (error) {
      console.error(`Failed to resolve subject: ${error}`);
    }

    // Evaluate
    const decision = await this.ruleEvaluator.authorize(request);

    // Log decision
    if (this.config.loggingEnabled) {
      await this.decisionLogger.log(request, decision, subject);
    }

    return decision;
  }

  /**
   * Quick permission check (convenience method)
   */
  async hasPermission(
    tenantId: string,
    principalId: string,
    operationCode: OperationCode,
    resource: ResourceDescriptor,
  ): Promise<boolean> {
    const decision = await this.authorize({
      tenantId,
      principalId,
      operationCode,
      resource,
    });

    return decision.effect === "allow";
  }

  /**
   * Shorthand for hasPermission
   */
  async can(
    principalId: string,
    tenantId: string,
    operationCode: OperationCode,
    resource: ResourceDescriptor,
  ): Promise<boolean> {
    return this.hasPermission(tenantId, principalId, operationCode, resource);
  }

  /**
   * Get subject snapshot for principal
   */
  async getSubjectSnapshot(
    principalId: string,
    tenantId: string,
  ): Promise<SubjectSnapshot> {
    return this.subjectResolver.resolveSubject(principalId, tenantId);
  }

  // ============================================================================
  // Entity API Integration
  // ============================================================================

  /**
   * Authorize entity operation
   */
  async authorizeEntity(
    principalId: string,
    tenantId: string,
    operation: "READ" | "CREATE" | "UPDATE" | "DELETE" | "LIST",
    entityCode: string,
    recordId?: string,
    entityVersionId?: string,
  ): Promise<AuthorizationDecision> {
    return this.authorize({
      principalId,
      tenantId,
      operationCode: `ENTITY.${operation}` as OperationCode,
      resource: {
        entityCode,
        recordId,
        entityVersionId,
      },
    });
  }

  /**
   * Check if principal can read entity
   */
  async canRead(
    principalId: string,
    tenantId: string,
    entityCode: string,
    recordId?: string,
  ): Promise<boolean> {
    const decision = await this.authorizeEntity(
      principalId,
      tenantId,
      "READ",
      entityCode,
      recordId,
    );
    return decision.effect === "allow";
  }

  /**
   * Check if principal can create entity
   */
  async canCreate(
    principalId: string,
    tenantId: string,
    entityCode: string,
  ): Promise<boolean> {
    const decision = await this.authorizeEntity(
      principalId,
      tenantId,
      "CREATE",
      entityCode,
    );
    return decision.effect === "allow";
  }

  /**
   * Check if principal can update entity
   */
  async canUpdate(
    principalId: string,
    tenantId: string,
    entityCode: string,
    recordId: string,
  ): Promise<boolean> {
    const decision = await this.authorizeEntity(
      principalId,
      tenantId,
      "UPDATE",
      entityCode,
      recordId,
    );
    return decision.effect === "allow";
  }

  /**
   * Check if principal can delete entity
   */
  async canDelete(
    principalId: string,
    tenantId: string,
    entityCode: string,
    recordId: string,
  ): Promise<boolean> {
    const decision = await this.authorizeEntity(
      principalId,
      tenantId,
      "DELETE",
      entityCode,
      recordId,
    );
    return decision.effect === "allow";
  }

  // ============================================================================
  // Persona Capability Integration
  // ============================================================================

  /**
   * Authorize operation using persona capability model
   *
   * This method combines:
   * 1. Persona resolution from role bindings
   * 2. Capability check against the permission action model
   * 3. OU scope validation (for ou-scoped personas)
   * 4. Module subscription check (for module-scoped operations)
   *
   * @param principalId - The principal performing the operation
   * @param tenantId - The tenant context
   * @param operationCode - The operation to check (e.g., 'read', 'create', 'approve')
   * @param context - Additional context for the check
   */
  async authorizeWithPersona(
    principalId: string,
    tenantId: string,
    operationCode: string,
    context?: {
      recordOwnerId?: string;
      recordOuPath?: string;
      moduleCode?: string;
      entityKey?: string;
      recordId?: string;
    },
  ): Promise<PersonaAuthDecision> {
    // 1. If persona capabilities are disabled, fall back to rule-based
    if (!this.config.personaCapabilitiesEnabled) {
      const decision = await this.authorize({
        principalId,
        tenantId,
        operationCode: operationCode as OperationCode,
        resource: {
          entityCode: context?.entityKey ?? "",
          recordId: context?.recordId,
        },
      });

      return {
        allowed: decision.effect === "allow",
        reason: decision.reason ?? "Rule-based authorization",
      };
    }

    // 2. Resolve subject's effective persona
    const effectivePersona = await this.roleBinding.resolveEffectivePersona(
      principalId,
      tenantId,
    );

    // 3. Get subject's OU membership for scope checking
    const ouMembership = await this.getSubjectOuPath(principalId, tenantId);

    // 4. Get qualified personas
    const qualifiedPersonas = await this.roleBinding.getQualifiedPersonas(
      principalId,
      tenantId,
    );

    // 5. Build SubjectWithPersona
    const subjectWithPersona = {
      id: principalId,
      type: "user" as const,
      tenantId,
      roles: [] as string[],
      effectivePersona,
      qualifiedPersonas,
      ouMembership: ouMembership ?? undefined,
    };

    // 6. Build capability context
    const capabilityContext = {
      tenantId,
      isOwner: context?.recordOwnerId === principalId,
      recordOuPath: context?.recordOuPath,
      subjectOuPath: ouMembership?.path,
      moduleCode: context?.moduleCode,
      entityKey: context?.entityKey,
      recordId: context?.recordId,
    };

    // 7. Check capability using persona capability service
    const result = await this.personaCapability.authorize(
      subjectWithPersona as any,
      operationCode,
      capabilityContext as any,
    );

    return result;
  }

  /**
   * Check persona capability without full authorization
   *
   * Quick check for UI enablement decisions.
   */
  async checkPersonaCapability(
    principalId: string,
    tenantId: string,
    operationCode: string,
    context?: CapabilityContext,
  ): Promise<CapabilityCheckResult> {
    const effectivePersona = await this.roleBinding.resolveEffectivePersona(
      principalId,
      tenantId,
    );

    return this.personaCapability.hasCapability(
      effectivePersona,
      operationCode,
      context,
    );
  }

  /**
   * Get the effective persona for a principal
   */
  async getEffectivePersona(
    principalId: string,
    tenantId: string,
  ): Promise<PersonaCode> {
    return this.roleBinding.resolveEffectivePersona(principalId, tenantId);
  }

  /**
   * Get all qualified personas for a principal
   */
  async getQualifiedPersonas(
    principalId: string,
    tenantId: string,
  ): Promise<PersonaCode[]> {
    return this.roleBinding.getQualifiedPersonas(principalId, tenantId);
  }

  /**
   * Check if principal has a specific persona
   */
  async hasPersona(
    principalId: string,
    tenantId: string,
    personaCode: PersonaCode,
  ): Promise<boolean> {
    return this.roleBinding.hasPersona(principalId, tenantId, personaCode);
  }

  /**
   * Get subject's primary OU path for scope checking
   */
  private async getSubjectOuPath(
    principalId: string,
    _tenantId: string,
  ): Promise<{ nodeId: string; path: string } | undefined> {
    const result = await this.db
      .selectFrom("core.principal_ou as po")
      .innerJoin("core.organizational_unit as ou", "ou.id", "po.ou_id")
      .select(["ou.id", "ou.code"])
      .where("po.principal_id", "=", principalId)
      .executeTakeFirst();

    if (!result) return undefined;
    return { nodeId: result.id, path: result.code };
  }

  /**
   * Batch check multiple operations for a principal
   *
   * Useful for UI to determine which actions to enable/disable.
   */
  async batchCheckCapabilities(
    principalId: string,
    tenantId: string,
    operationCodes: string[],
    context?: CapabilityContext,
  ): Promise<Map<string, CapabilityCheckResult>> {
    const effectivePersona = await this.roleBinding.resolveEffectivePersona(
      principalId,
      tenantId,
    );

    const results = new Map<string, CapabilityCheckResult>();

    for (const opCode of operationCodes) {
      const result = await this.personaCapability.hasCapability(
        effectivePersona,
        opCode,
        context,
      );
      results.set(opCode, result);
    }

    return results;
  }

  // ============================================================================
  // Workflow Integration
  // ============================================================================

  /**
   * Authorize workflow operation
   */
  async authorizeWorkflow(
    principalId: string,
    tenantId: string,
    operation:
      | "SUBMIT"
      | "APPROVE"
      | "REJECT"
      | "CANCEL"
      | "REASSIGN"
      | "ESCALATE",
    entityCode: string,
    recordId: string,
    workflowContext?: {
      workflowId?: string;
      stepId?: string;
      attributes?: Record<string, unknown>;
    },
  ): Promise<AuthorizationDecision> {
    return this.authorize({
      principalId,
      tenantId,
      operationCode: `WORKFLOW.${operation}` as OperationCode,
      resource: {
        entityCode,
        recordId,
        attributes: workflowContext?.attributes,
      },
      context: {
        workflowId: workflowContext?.workflowId,
        stepId: workflowContext?.stepId,
      },
    });
  }

  /**
   * Check if principal can approve
   */
  async canApprove(
    principalId: string,
    tenantId: string,
    entityCode: string,
    recordId: string,
  ): Promise<boolean> {
    const decision = await this.authorizeWorkflow(
      principalId,
      tenantId,
      "APPROVE",
      entityCode,
      recordId,
    );
    return decision.effect === "allow";
  }

  // ============================================================================
  // Middleware Factory
  // ============================================================================

  /**
   * Create authorization middleware for Express/Hono
   *
   * Usage with Hono:
   * ```ts
   * app.use('/api/*', gate.createMiddleware({
   *   getPrincipalId: (c) => c.get('userId'),
   *   getTenantId: (c) => c.get('tenantId'),
   *   getOperation: (c) => 'ENTITY.READ',
   *   getResource: (c) => ({ entityCode: 'users' }),
   * }));
   * ```
   */
  createMiddleware<TContext>(options: {
    getPrincipalId: (ctx: TContext) => string | undefined;
    getTenantId: (ctx: TContext) => string | undefined;
    getOperation: (ctx: TContext) => OperationCode;
    getResource: (ctx: TContext) => ResourceDescriptor;
    onUnauthorized?: (ctx: TContext, decision: AuthorizationDecision) => void;
    skip?: (ctx: TContext) => boolean;
  }): (ctx: TContext, next: () => Promise<void>) => Promise<void> {
    return async (ctx: TContext, next: () => Promise<void>) => {
      // Skip if configured
      if (options.skip?.(ctx)) {
        return next();
      }

      const principalId = options.getPrincipalId(ctx);
      const tenantId = options.getTenantId(ctx);

      // Missing auth info
      if (!principalId || !tenantId) {
        const decision: AuthorizationDecision = {
          effect: "deny",
          principalId: principalId ?? "unknown",
          operationCode: "unknown",
          resourceKey: "unknown",
          reason: "Missing principal or tenant ID",
        };

        if (options.onUnauthorized) {
          options.onUnauthorized(ctx, decision);
        }
        return;
      }

      const operation = options.getOperation(ctx);
      const resource = options.getResource(ctx);

      const decision = await this.authorize({
        principalId,
        tenantId,
        operationCode: operation,
        resource,
      });

      if (decision.effect === "deny") {
        if (options.onUnauthorized) {
          options.onUnauthorized(ctx, decision);
        }
        return;
      }

      return next();
    };
  }

  // ============================================================================
  // Administration
  // ============================================================================

  /**
   * Seed standard operations
   */
  async seedOperations(createdBy: string = "system"): Promise<number> {
    return this.operationCatalog.seedStandardOperations(createdBy);
  }

  /**
   * Invalidate caches for a principal
   */
  invalidatePrincipalCache(principalId: string, tenantId: string): void {
    this.subjectResolver.invalidateCache(principalId, tenantId);
  }

  /**
   * Invalidate policy cache
   */
  invalidatePolicyCache(tenantId: string, policyVersionId: string): void {
    this.policyCompiler.invalidateCache(tenantId, policyVersionId);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.subjectResolver.clearCache();
    this.policyCompiler.clearCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    policyCache: { size: number; keys: string[] };
  } {
    return {
      policyCache: this.policyCompiler.getCacheStats(),
    };
  }

  /**
   * Get decision logs for debugging
   */
  async getRecentLogs(
    tenantId: string,
    principalId: string,
    limit: number = 100,
  ) {
    return this.decisionLogger.getRecentLogs(tenantId, principalId, limit);
  }

  /**
   * Get decision statistics
   */
  async getDecisionStats(tenantId: string, since: Date) {
    return this.decisionLogger.getStats(tenantId, since);
  }

  /**
   * Shutdown - flush logs and cleanup
   */
  async shutdown(): Promise<void> {
    await this.decisionLogger.shutdown();
  }

  /**
   * Build resource key for logging
   */
  private buildResourceKey(resource: ResourceDescriptor): string {
    const parts = [resource.entityCode];
    if (resource.moduleCode) parts.unshift(resource.moduleCode);
    if (resource.recordId) parts.push(resource.recordId);
    return parts.join(":");
  }

  // ============================================================================
  // Accessors for sub-services (for advanced usage)
  // ============================================================================

  get operations(): OperationCatalogService {
    return this.operationCatalog;
  }

  get policies(): PolicyResolutionService {
    return this.policyResolution;
  }

  get compiler(): PolicyCompilerService {
    return this.policyCompiler;
  }

  get subjects(): SubjectResolverService {
    return this.subjectResolver;
  }

  get logger(): DecisionLoggerService {
    return this.decisionLogger;
  }

  get capabilities(): IPersonaCapabilityService {
    return this.personaCapability;
  }

  get roles(): RoleBindingService {
    return this.roleBinding;
  }
}

/**
 * Create Policy Gate instance
 */
export function createPolicyGate(
  db: Kysely<DB>,
  config?: Partial<PolicyGateConfig>,
): PolicyGateService {
  return new PolicyGateService(db, config);
}
