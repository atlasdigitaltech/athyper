/**
 * Policy Evaluation Integration Points
 *
 * G: Integration Points
 * - API middleware authz (entity actions, workflow transitions)
 * - Workflow engine transitions (state change permissions)
 * - UI capability endpoint (drive what buttons show)
 * - Batch jobs (compliance checks)
 */

import type { PolicyObservability } from "./observability.js";
import type {
  IPolicyEvaluator,
  PolicyDecision,
  PolicyEvaluationOptions,
  PolicyInput,
  PolicySubject,
} from "./types.js";

// ============================================================================
// API Middleware Integration
// ============================================================================

/**
 * Middleware context (generic for different frameworks)
 */
export type MiddlewareContext<TRequest = unknown, TResponse = unknown> = {
  request: TRequest;
  response?: TResponse;
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
};

/**
 * Middleware options
 */
export type PolicyMiddlewareOptions<TContext> = {
  /** Extract principal ID from context */
  getPrincipalId: (ctx: TContext) => string | undefined;

  /** Extract tenant ID from context */
  getTenantId: (ctx: TContext) => string | undefined;

  /** Extract operation code from context */
  getOperation: (ctx: TContext) => { namespace: string; code: string };

  /** Extract resource from context */
  getResource: (ctx: TContext) => { type: string; id?: string; module?: string };

  /** Handler for unauthorized access */
  onUnauthorized?: (ctx: TContext, decision: PolicyDecision) => void | Promise<void>;

  /** Handler for errors */
  onError?: (ctx: TContext, error: Error) => void | Promise<void>;

  /** Skip authorization for certain requests */
  skip?: (ctx: TContext) => boolean;

  /** Default evaluation options */
  evaluationOptions?: PolicyEvaluationOptions;
};

/**
 * Create policy middleware for API authorization
 */
export function createPolicyMiddleware<TContext extends MiddlewareContext>(
  evaluator: IPolicyEvaluator,
  options: PolicyMiddlewareOptions<TContext>,
  observability?: PolicyObservability
): (ctx: TContext, next: () => Promise<void>) => Promise<void> {
  return async (ctx: TContext, next: () => Promise<void>): Promise<void> => {
    // Skip if configured
    if (options.skip?.(ctx)) {
      return next();
    }

    const principalId = options.getPrincipalId(ctx);
    const tenantId = options.getTenantId(ctx);

    if (!principalId || !tenantId) {
      const decision: PolicyDecision = {
        effect: "deny",
        allowed: false,
        obligations: [],
        reasons: ["Missing authentication context"],
        matchedRules: [],
        metadata: {
          durationMs: 0,
          evaluatedAt: new Date(),
          evaluatorVersion: "1.0.0",
        },
      };

      if (options.onUnauthorized) {
        await options.onUnauthorized(ctx, decision);
      }
      return;
    }

    try {
      const operation = options.getOperation(ctx);
      const resource = options.getResource(ctx);

      const input: PolicyInput = {
        subject: {
          principalId,
          principalType: "user",
          roles: (ctx.get("roles") as string[]) ?? [],
          groups: (ctx.get("groups") as string[]) ?? [],
          attributes: (ctx.get("attributes") as Record<string, unknown>) ?? {},
        },
        resource: {
          type: resource.type,
          id: resource.id,
          module: resource.module,
          attributes: {},
        },
        action: {
          namespace: operation.namespace as PolicyInput["action"]["namespace"],
          code: operation.code,
          fullCode: `${operation.namespace}.${operation.code}`,
        },
        context: {
          tenantId,
          timestamp: new Date(),
          correlationId: (ctx.get("correlationId") as string) ?? crypto.randomUUID(),
          channel: "api",
          attributes: {},
        },
      };

      // Start tracing
      const span = observability?.startEvaluationSpan(input);

      try {
        const decision = await evaluator.evaluate(input, options.evaluationOptions);

        // Record metrics
        observability?.recordEvaluation(input, decision);

        // Store decision in context for later use
        ctx.set("policyDecision", decision);

        if (!decision.allowed) {
          span?.setStatus("error", "Access denied");
          span?.end();

          if (options.onUnauthorized) {
            await options.onUnauthorized(ctx, decision);
          }
          return;
        }

        span?.setStatus("ok");
        span?.end();

        return next();
      } catch (error) {
        span?.setStatus("error", String(error));
        span?.end();
        throw error;
      }
    } catch (error) {
      if (options.onError) {
        await options.onError(ctx, error as Error);
      } else {
        throw error;
      }
    }
  };
}

// ============================================================================
// Workflow Engine Integration
// ============================================================================

/**
 * Workflow transition context
 */
export type WorkflowTransitionContext = {
  /** Workflow instance ID */
  workflowId: string;

  /** Current state */
  fromState: string;

  /** Target state */
  toState: string;

  /** Transition name */
  transitionName: string;

  /** Entity type */
  entityType: string;

  /** Entity record ID */
  entityId: string;

  /** Transition data */
  data?: Record<string, unknown>;
};

/**
 * Workflow authorization result
 */
export type WorkflowAuthResult = {
  /** Is transition allowed */
  allowed: boolean;

  /** Policy decision */
  decision: PolicyDecision;

  /** Required approvals (if any) */
  requiredApprovals?: Array<{
    role: string;
    count: number;
  }>;

  /** Notifications to send */
  notifications?: Array<{
    type: string;
    recipients: string[];
    message: string;
  }>;
};

/**
 * Workflow policy integration
 */
export class WorkflowPolicyIntegration {
  constructor(
    private readonly evaluator: IPolicyEvaluator,
    private readonly observability?: PolicyObservability
  ) {}

  /**
   * Check if a workflow transition is allowed
   */
  async canTransition(
    principalId: string,
    tenantId: string,
    subject: PolicySubject,
    transition: WorkflowTransitionContext
  ): Promise<WorkflowAuthResult> {
    const input: PolicyInput = {
      subject,
      resource: {
        type: transition.entityType,
        id: transition.entityId,
        attributes: {
          workflowId: transition.workflowId,
          fromState: transition.fromState,
          toState: transition.toState,
          transitionName: transition.transitionName,
          ...transition.data,
        },
      },
      action: {
        namespace: "WORKFLOW",
        code: this.mapTransitionToOperation(transition.transitionName),
        fullCode: `WORKFLOW.${this.mapTransitionToOperation(transition.transitionName)}`,
      },
      context: {
        tenantId,
        timestamp: new Date(),
        correlationId: crypto.randomUUID(),
        channel: "internal",
        attributes: {
          workflowId: transition.workflowId,
          fromState: transition.fromState,
          toState: transition.toState,
        },
      },
    };

    const decision = await this.evaluator.evaluate(input, {
      explain: true,
      includeObligations: true,
    });

    // Record metrics
    this.observability?.recordEvaluation(input, decision);

    // Process obligations for workflow-specific handling
    const result: WorkflowAuthResult = {
      allowed: decision.allowed,
      decision,
    };

    // Check for approval requirements in obligations
    for (const obligation of decision.obligations) {
      if (obligation.type === "require_approval") {
        result.requiredApprovals = result.requiredApprovals ?? [];
        result.requiredApprovals.push({
          role: obligation.params.role as string,
          count: (obligation.params.count as number) ?? 1,
        });
      }

      if (obligation.type === "notify") {
        result.notifications = result.notifications ?? [];
        result.notifications.push({
          type: obligation.params.notificationType as string,
          recipients: obligation.params.recipients as string[],
          message: obligation.params.message as string,
        });
      }
    }

    return result;
  }

  /**
   * Get allowed transitions for a workflow state
   */
  async getAllowedTransitions(
    principalId: string,
    tenantId: string,
    subject: PolicySubject,
    entityType: string,
    entityId: string,
    workflowId: string,
    currentState: string,
    possibleTransitions: Array<{ name: string; toState: string }>
  ): Promise<Array<{ name: string; toState: string; allowed: boolean }>> {
    const results: Array<{ name: string; toState: string; allowed: boolean }> = [];

    for (const transition of possibleTransitions) {
      const authResult = await this.canTransition(principalId, tenantId, subject, {
        workflowId,
        fromState: currentState,
        toState: transition.toState,
        transitionName: transition.name,
        entityType,
        entityId,
      });

      results.push({
        name: transition.name,
        toState: transition.toState,
        allowed: authResult.allowed,
      });
    }

    return results;
  }

  /**
   * Map transition name to workflow operation
   */
  private mapTransitionToOperation(transitionName: string): string {
    const mapping: Record<string, string> = {
      submit: "SUBMIT",
      approve: "APPROVE",
      reject: "REJECT",
      cancel: "CANCEL",
      reassign: "REASSIGN",
      escalate: "ESCALATE",
    };

    return mapping[transitionName.toLowerCase()] ?? transitionName.toUpperCase();
  }
}

// ============================================================================
// UI Capability Endpoint
// ============================================================================

/**
 * UI capability for a resource
 */
export type UICapability = {
  /** Operation code */
  operation: string;

  /** Is operation allowed */
  allowed: boolean;

  /** UI hint (show/hide/disable) */
  hint: "show" | "hide" | "disable";

  /** Tooltip for disabled state */
  tooltip?: string;

  /** Required conditions not met */
  missingConditions?: string[];
};

/**
 * UI capabilities response
 */
export type UICapabilitiesResponse = {
  /** Resource type */
  resourceType: string;

  /** Resource ID (if specific) */
  resourceId?: string;

  /** Capabilities by operation */
  capabilities: Record<string, UICapability>;

  /** Evaluation timestamp */
  evaluatedAt: Date;

  /** Cache TTL hint for client */
  cacheTtlSeconds: number;
};

/**
 * UI capability service
 */
export class UICapabilityService {
  /** Cache TTL for capability responses */
  private cacheTtlSeconds: number = 60;

  constructor(
    private readonly evaluator: IPolicyEvaluator,
    private readonly observability?: PolicyObservability
  ) {}

  /**
   * Get UI capabilities for a resource
   */
  async getCapabilities(
    principalId: string,
    tenantId: string,
    subject: PolicySubject,
    resourceType: string,
    resourceId?: string,
    operations?: string[]
  ): Promise<UICapabilitiesResponse> {
    // Default operations for entity resources
    const opsToCheck = operations ?? [
      "ENTITY.READ",
      "ENTITY.CREATE",
      "ENTITY.UPDATE",
      "ENTITY.DELETE",
      "ENTITY.LIST",
      "ENTITY.EXPORT",
    ];

    const capabilities: Record<string, UICapability> = {};

    for (const opCode of opsToCheck) {
      const [namespace, code] = opCode.split(".");

      const input: PolicyInput = {
        subject,
        resource: {
          type: resourceType,
          id: resourceId,
          attributes: {},
        },
        action: {
          namespace: namespace as PolicyInput["action"]["namespace"],
          code,
          fullCode: opCode,
        },
        context: {
          tenantId,
          timestamp: new Date(),
          correlationId: crypto.randomUUID(),
          channel: "web",
          attributes: {},
        },
      };

      const decision = await this.evaluator.evaluate(input, {
        explain: false,
        trace: false,
      });

      capabilities[opCode] = {
        operation: opCode,
        allowed: decision.allowed,
        hint: decision.allowed ? "show" : "hide",
        tooltip: decision.allowed ? undefined : decision.reasons[0],
      };
    }

    return {
      resourceType,
      resourceId,
      capabilities,
      evaluatedAt: new Date(),
      cacheTtlSeconds: this.cacheTtlSeconds,
    };
  }

  /**
   * Bulk get capabilities for multiple resources
   */
  async getBulkCapabilities(
    principalId: string,
    tenantId: string,
    subject: PolicySubject,
    resources: Array<{ type: string; id?: string }>,
    operations?: string[]
  ): Promise<UICapabilitiesResponse[]> {
    const results: UICapabilitiesResponse[] = [];

    for (const resource of resources) {
      const caps = await this.getCapabilities(
        principalId,
        tenantId,
        subject,
        resource.type,
        resource.id,
        operations
      );
      results.push(caps);
    }

    return results;
  }

  /**
   * Set cache TTL
   */
  setCacheTtl(seconds: number): void {
    this.cacheTtlSeconds = seconds;
  }
}

// ============================================================================
// Batch Processing Integration
// ============================================================================

/**
 * Batch authorization request
 */
export type BatchAuthRequest = {
  /** Request ID */
  requestId: string;

  /** Principal ID */
  principalId: string;

  /** Tenant ID */
  tenantId: string;

  /** Operation */
  operation: string;

  /** Resource type */
  resourceType: string;

  /** Resource ID */
  resourceId?: string;

  /** Additional context */
  context?: Record<string, unknown>;
};

/**
 * Batch authorization result
 */
export type BatchAuthResult = {
  /** Request ID */
  requestId: string;

  /** Is allowed */
  allowed: boolean;

  /** Effect */
  effect: "allow" | "deny";

  /** Reason */
  reason: string;

  /** Evaluation duration in ms */
  durationMs: number;
};

/**
 * Batch compliance check result
 */
export type ComplianceCheckResult = {
  /** Resource identifier */
  resourceKey: string;

  /** Is compliant */
  compliant: boolean;

  /** Violations found */
  violations: Array<{
    ruleId: string;
    message: string;
    severity: "low" | "medium" | "high" | "critical";
  }>;

  /** Checked at */
  checkedAt: Date;
};

/**
 * Batch policy processor
 */
export class BatchPolicyProcessor {
  /** Max concurrent evaluations */
  private concurrency: number = 10;

  constructor(
    private readonly evaluator: IPolicyEvaluator,
    private readonly observability?: PolicyObservability
  ) {}

  /**
   * Process batch authorization requests
   */
  async processBatch(
    requests: BatchAuthRequest[],
    subjectResolver: (principalId: string, tenantId: string) => Promise<PolicySubject>
  ): Promise<BatchAuthResult[]> {
    const results: BatchAuthResult[] = [];

    // Process in batches for concurrency control
    for (let i = 0; i < requests.length; i += this.concurrency) {
      const batch = requests.slice(i, i + this.concurrency);

      const batchResults = await Promise.all(
        batch.map(async (req) => {
          const startTime = Date.now();

          try {
            const subject = await subjectResolver(req.principalId, req.tenantId);
            const [namespace, code] = req.operation.split(".");

            const input: PolicyInput = {
              subject,
              resource: {
                type: req.resourceType,
                id: req.resourceId,
                attributes: {},
              },
              action: {
                namespace: namespace as PolicyInput["action"]["namespace"],
                code,
                fullCode: req.operation,
              },
              context: {
                tenantId: req.tenantId,
                timestamp: new Date(),
                correlationId: req.requestId,
                channel: "batch",
                attributes: req.context ?? {},
              },
            };

            const decision = await this.evaluator.evaluate(input, {
              explain: false,
              trace: false,
            });

            return {
              requestId: req.requestId,
              allowed: decision.allowed,
              effect: decision.effect,
              reason: decision.reasons[0] ?? "No reason",
              durationMs: Date.now() - startTime,
            };
          } catch (error) {
            return {
              requestId: req.requestId,
              allowed: false,
              effect: "deny" as const,
              reason: `Error: ${String(error)}`,
              durationMs: Date.now() - startTime,
            };
          }
        })
      );

      results.push(...batchResults);
    }

    // Log batch completion
    console.log(
      JSON.stringify({
        msg: "batch_authorization_complete",
        totalRequests: requests.length,
        allowed: results.filter((r) => r.allowed).length,
        denied: results.filter((r) => !r.allowed).length,
        avgDurationMs:
          results.reduce((sum, r) => sum + r.durationMs, 0) / results.length,
      })
    );

    return results;
  }

  /**
   * Run compliance checks on resources
   */
  async runComplianceChecks(
    tenantId: string,
    resources: Array<{ type: string; id: string }>,
    complianceRules: Array<{
      ruleId: string;
      operation: string;
      requiredEffect: "allow" | "deny";
      severity: "low" | "medium" | "high" | "critical";
      message: string;
    }>,
    subjectForCompliance: PolicySubject
  ): Promise<ComplianceCheckResult[]> {
    const results: ComplianceCheckResult[] = [];

    for (const resource of resources) {
      const violations: ComplianceCheckResult["violations"] = [];

      for (const rule of complianceRules) {
        const [namespace, code] = rule.operation.split(".");

        const input: PolicyInput = {
          subject: subjectForCompliance,
          resource: {
            type: resource.type,
            id: resource.id,
            attributes: {},
          },
          action: {
            namespace: namespace as PolicyInput["action"]["namespace"],
            code,
            fullCode: rule.operation,
          },
          context: {
            tenantId,
            timestamp: new Date(),
            correlationId: crypto.randomUUID(),
            channel: "batch",
            attributes: {},
          },
        };

        const decision = await this.evaluator.evaluate(input, {
          explain: false,
          trace: false,
        });

        // Check if effect matches required effect
        if (decision.effect !== rule.requiredEffect) {
          violations.push({
            ruleId: rule.ruleId,
            message: rule.message,
            severity: rule.severity,
          });
        }
      }

      results.push({
        resourceKey: `${resource.type}:${resource.id}`,
        compliant: violations.length === 0,
        violations,
        checkedAt: new Date(),
      });
    }

    // Log compliance check completion
    console.log(
      JSON.stringify({
        msg: "compliance_check_complete",
        tenantId,
        totalResources: resources.length,
        compliant: results.filter((r) => r.compliant).length,
        nonCompliant: results.filter((r) => !r.compliant).length,
        totalViolations: results.reduce((sum, r) => sum + r.violations.length, 0),
      })
    );

    return results;
  }

  /**
   * Set concurrency limit
   */
  setConcurrency(concurrency: number): void {
    this.concurrency = Math.max(1, Math.min(100, concurrency));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create workflow policy integration
 */
export function createWorkflowIntegration(
  evaluator: IPolicyEvaluator,
  observability?: PolicyObservability
): WorkflowPolicyIntegration {
  return new WorkflowPolicyIntegration(evaluator, observability);
}

/**
 * Create UI capability service
 */
export function createUICapabilityService(
  evaluator: IPolicyEvaluator,
  observability?: PolicyObservability
): UICapabilityService {
  return new UICapabilityService(evaluator, observability);
}

/**
 * Create batch policy processor
 */
export function createBatchProcessor(
  evaluator: IPolicyEvaluator,
  observability?: PolicyObservability
): BatchPolicyProcessor {
  return new BatchPolicyProcessor(evaluator, observability);
}
