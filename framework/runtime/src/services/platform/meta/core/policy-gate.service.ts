/**
 * Policy Gate Service Implementation
 *
 * Basic policy evaluation for access control.
 * MVP: Simple allow/deny based on compiled policies.
 */

import { uuid } from "../data/db-helpers.js";
import { META_SPANS, withSpan } from "../observability/tracing.js";

import type { LifecycleDB_Type } from "../data/db-helpers.js";
import type { MetaMetrics } from "../observability/metrics.js";
import type {
  HealthCheckResult,
  MetaCompiler,
  PolicyDecision,
  PolicyGate,
  RequestContext,
} from "@athyper/core/meta";

/**
 * Policy Gate Service
 * Evaluates policies for access control
 */
export class PolicyGateService implements PolicyGate {
  private metrics?: MetaMetrics;

  constructor(
    private readonly compiler: MetaCompiler,
    private readonly db?: LifecycleDB_Type,
  ) {}

  /** Set metrics collector for observability (late binding). */
  setMetrics(metrics: MetaMetrics): void {
    this.metrics = metrics;
  }

  async can(
    action: string,
    resource: string,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<boolean> {
    return withSpan(
      META_SPANS.POLICY_EVALUATE,
      {
        "meta.entity": resource,
        "meta.action": action,
        "meta.tenant_id": ctx.tenantId,
      },
      async (span) => {
        const start = Date.now();
        try {
          // Get compiled model for resource
          const compiledModel = await this.compiler.compile(resource, "v1"); // TODO: get active version

          // Get applicable policies
          const policies = compiledModel.policies.filter(
            (p) => p.action === action || p.action === "*",
          );

          span.setAttribute("meta.policy_count", policies.length);

          if (policies.length === 0) {
            // No policies defined = deny by default
            this.metrics?.policyDenied({ entity: resource, action });
            this.metrics?.policyEvalLatency(Date.now() - start, {
              entity: resource,
              action,
            });
            return false;
          }

          // Pass action and resource in context for evaluation
          const evalCtx = { ...ctx, action, resource };

          // IMPORTANT: Check deny policies first (deny ALWAYS takes precedence over allow)
          const denyPolicies = policies.filter((p) => p.effect === "deny");
          for (const policy of denyPolicies) {
            const result = policy.evaluate(evalCtx, record);
            if (result) {
              // Explicit deny takes precedence
              this.metrics?.policyDenied({ entity: resource, action });
              this.metrics?.policyEvalLatency(Date.now() - start, {
                entity: resource,
                action,
              });
              return false;
            }
          }

          // Then check allow policies (sort by priority, higher first)
          const allowPolicies = policies
            .filter((p) => p.effect === "allow")
            .sort((a, b) => b.priority - a.priority);

          for (const policy of allowPolicies) {
            const result = policy.evaluate(evalCtx, record);
            if (result) {
              // Allow if condition matches
              this.metrics?.policyEvalLatency(Date.now() - start, {
                entity: resource,
                action,
              });
              return true;
            }
          }

          // No matching allow policy = deny
          this.metrics?.policyDenied({ entity: resource, action });
          this.metrics?.policyEvalLatency(Date.now() - start, {
            entity: resource,
            action,
          });
          return false;
        } catch (error) {
          console.error(
            `Policy evaluation error for ${action}:${resource}:`,
            error,
          );
          this.metrics?.policyEvalLatency(Date.now() - start, {
            entity: resource,
            action,
          });
          // Fail secure: deny on error
          return false;
        }
      },
    );
  }

  async authorize(
    action: string,
    resource: string,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<PolicyDecision> {
    try {
      // Get compiled model for resource
      const compiledModel = await this.compiler.compile(resource, "v1");

      // Get applicable policies
      const policies = compiledModel.policies.filter(
        (p) => p.action === action || p.action === "*",
      );

      if (policies.length === 0) {
        const decision: PolicyDecision = {
          allowed: false,
          effect: "deny",
          reason: "No policies defined for this resource",
          evaluatedRules: [],
          timestamp: new Date(),
        };
        await this.logDecision(decision, action, resource, ctx);
        return decision;
      }

      const evalCtx = { ...ctx, action, resource };
      const evaluatedRules: PolicyDecision["evaluatedRules"] = [];

      // Check deny policies first
      const denyPolicies = policies.filter((p) => p.effect === "deny");
      for (const policy of denyPolicies) {
        const matched = policy.evaluate(evalCtx, record);
        evaluatedRules.push({
          ruleId: policy.name,
          effect: "deny",
          matched,
          reason: matched ? "Deny policy matched" : "Deny policy did not match",
        });

        if (matched) {
          const decision: PolicyDecision = {
            allowed: false,
            effect: "deny",
            matchedRuleId: policy.name,
            reason: `Access denied by policy '${policy.name}'`,
            evaluatedRules,
            timestamp: new Date(),
          };
          await this.logDecision(decision, action, resource, ctx);
          return decision;
        }
      }

      // Check allow policies
      const allowPolicies = policies
        .filter((p) => p.effect === "allow")
        .sort((a, b) => b.priority - a.priority);

      for (const policy of allowPolicies) {
        const matched = policy.evaluate(evalCtx, record);
        evaluatedRules.push({
          ruleId: policy.name,
          effect: "allow",
          matched,
          reason: matched
            ? "Allow policy matched"
            : "Allow policy did not match",
        });

        if (matched) {
          const decision: PolicyDecision = {
            allowed: true,
            effect: "allow",
            matchedRuleId: policy.name,
            reason: `Access granted by policy '${policy.name}'`,
            evaluatedRules,
            timestamp: new Date(),
          };
          await this.logDecision(decision, action, resource, ctx);
          return decision;
        }
      }

      const decision: PolicyDecision = {
        allowed: false,
        effect: "deny",
        reason: "No matching allow policy found",
        evaluatedRules,
        timestamp: new Date(),
      };
      await this.logDecision(decision, action, resource, ctx);
      return decision;
    } catch (error) {
      console.error(
        `Policy evaluation error for ${action}:${resource}:`,
        error,
      );
      const decision: PolicyDecision = {
        allowed: false,
        effect: "deny",
        reason: `Policy evaluation error: ${String(error)}`,
        evaluatedRules: [],
        timestamp: new Date(),
      };
      await this.logDecision(decision, action, resource, ctx);
      return decision;
    }
  }

  async enforce(
    action: string,
    resource: string,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<void> {
    const allowed = await this.can(action, resource, ctx, record);

    if (!allowed) {
      throw new Error(
        `Access denied: ${action} on ${resource} for user ${ctx.userId}`,
      );
    }
  }

  async getPolicies(
    action: string,
    resource: string,
  ): Promise<Array<{ name: string; effect: string }>> {
    try {
      const compiledModel = await this.compiler.compile(resource, "v1");

      return compiledModel.policies
        .filter((p) => p.action === action || p.action === "*")
        .map((p) => ({
          name: p.name,
          effect: p.effect,
        }));
    } catch {
      return [];
    }
  }

  async evaluatePolicy(
    _policyName: string,
    _ctx: RequestContext,
    _record?: unknown,
  ): Promise<boolean> {
    // This would require loading the policy by name
    // For MVP, just return false
    return false;
  }

  async getAllowedFields(
    action: string,
    resource: string,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<string[] | null> {
    try {
      const compiledModel = await this.compiler.compile(resource, "v1");
      const policies = compiledModel.policies;

      // Evaluation context
      const evalCtx = { ...ctx, action, resource };

      // Check deny policies first
      const denyPolicies = policies.filter((p) => p.effect === "deny");
      for (const policy of denyPolicies) {
        const result = policy.evaluate(evalCtx, record);
        if (result) {
          // This policy denies access - check if it has field restrictions
          if (policy.fields && policy.fields.length > 0) {
            // Deny policy denies access to specific fields
            // We need to compute the set of fields NOT in this list
            // But for simplicity, if ANY deny policy matches, deny all fields
            return [];
          }
          // Deny policy with no field restrictions = deny all
          return [];
        }
      }

      // Collect all allowed fields from allow policies
      const allowPolicies = policies
        .filter((p) => p.effect === "allow")
        .sort((a, b) => b.priority - a.priority);

      // Track allowed fields
      const allowedFields = new Set<string>();
      let hasWildcard = false;

      for (const policy of allowPolicies) {
        const result = policy.evaluate(evalCtx, record);
        if (result) {
          if (!policy.fields || policy.fields.includes("*")) {
            // Policy allows all fields
            hasWildcard = true;
            break;
          }
          // Add specific fields
          for (const field of policy.fields) {
            allowedFields.add(field);
          }
        }
      }

      // If any policy grants wildcard access, return null (all fields)
      if (hasWildcard) {
        return null;
      }

      // If no fields were allowed, return empty array
      if (allowedFields.size === 0) {
        return [];
      }

      // Return the set of allowed fields
      return Array.from(allowedFields);
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "field_access_error",
          action,
          resource,
          err: String(error),
        }),
      );
      // On error, deny all fields
      return [];
    }
  }

  async authorizeMany(
    checks: Array<{ action: string; resource: string }>,
    ctx: RequestContext,
    record?: unknown,
  ): Promise<Map<string, PolicyDecision>> {
    const results = new Map<string, PolicyDecision>();

    // Group checks by resource to minimize compile calls
    const byResource = new Map<string, string[]>();
    for (const check of checks) {
      const actions = byResource.get(check.resource) ?? [];
      actions.push(check.action);
      byResource.set(check.resource, actions);
    }

    for (const [resource, actions] of byResource) {
      try {
        // Single compile per resource
        const compiledModel = await this.compiler.compile(resource, "v1");
        const allPolicies = compiledModel.policies;

        for (const action of actions) {
          const key = `${action}:${resource}`;

          // Get applicable policies for this action
          const policies = allPolicies.filter(
            (p) => p.action === action || p.action === "*",
          );

          if (policies.length === 0) {
            const decision: PolicyDecision = {
              allowed: false,
              effect: "deny",
              reason: "No policies defined for this resource",
              evaluatedRules: [],
              timestamp: new Date(),
            };
            results.set(key, decision);
            await this.logDecision(decision, action, resource, ctx);
            continue;
          }

          const evalCtx = { ...ctx, action, resource };
          const evaluatedRules: PolicyDecision["evaluatedRules"] = [];

          // Check deny policies first
          let decided = false;
          const denyPolicies = policies.filter((p) => p.effect === "deny");
          for (const policy of denyPolicies) {
            const matched = policy.evaluate(evalCtx, record);
            evaluatedRules.push({
              ruleId: policy.name,
              effect: "deny",
              matched,
              reason: matched
                ? "Deny policy matched"
                : "Deny policy did not match",
            });

            if (matched) {
              const decision: PolicyDecision = {
                allowed: false,
                effect: "deny",
                matchedRuleId: policy.name,
                reason: `Access denied by policy '${policy.name}'`,
                evaluatedRules,
                timestamp: new Date(),
              };
              results.set(key, decision);
              await this.logDecision(decision, action, resource, ctx);
              decided = true;
              break;
            }
          }

          if (decided) continue;

          // Check allow policies
          const allowPolicies = policies
            .filter((p) => p.effect === "allow")
            .sort((a, b) => b.priority - a.priority);

          for (const policy of allowPolicies) {
            const matched = policy.evaluate(evalCtx, record);
            evaluatedRules.push({
              ruleId: policy.name,
              effect: "allow",
              matched,
              reason: matched
                ? "Allow policy matched"
                : "Allow policy did not match",
            });

            if (matched) {
              const decision: PolicyDecision = {
                allowed: true,
                effect: "allow",
                matchedRuleId: policy.name,
                reason: `Access granted by policy '${policy.name}'`,
                evaluatedRules,
                timestamp: new Date(),
              };
              results.set(key, decision);
              await this.logDecision(decision, action, resource, ctx);
              decided = true;
              break;
            }
          }

          if (!decided) {
            const decision: PolicyDecision = {
              allowed: false,
              effect: "deny",
              reason: "No matching allow policy found",
              evaluatedRules,
              timestamp: new Date(),
            };
            results.set(key, decision);
            await this.logDecision(decision, action, resource, ctx);
          }
        }
      } catch (error) {
        // On error, deny all actions for this resource
        for (const action of actions) {
          const key = `${action}:${resource}`;
          results.set(key, {
            allowed: false,
            effect: "deny",
            reason: `Policy evaluation error: ${String(error)}`,
            evaluatedRules: [],
            timestamp: new Date(),
          });
        }
      }
    }

    return results;
  }

  async invalidatePolicyCache(resource: string): Promise<void> {
    // Invalidate compiled model cache which includes policies
    await this.compiler.invalidateCache(resource, "v1");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    // Check if compiler is healthy
    const compilerHealth = await this.compiler.healthCheck();

    return {
      healthy: compilerHealth.healthy,
      message: compilerHealth.healthy
        ? "Policy Gate healthy"
        : "Policy Gate unhealthy (compiler issue)",
      details: {
        compiler: compilerHealth,
      },
    };
  }

  /**
   * Log authorization decision to database
   * Writes to core.permission_decision_log for audit trail
   */
  private async logDecision(
    decision: PolicyDecision,
    action: string,
    resource: string,
    ctx: RequestContext,
    entityId?: string,
    entityVersionId?: string,
  ): Promise<void> {
    if (!this.db) {
      // Database not provided, skip logging
      return;
    }

    try {
      await this.db
        .insertInto("audit.permission_decision_log")
        .values({
          id: uuid(),
          tenant_id: ctx.tenantId,
          occurred_at: decision.timestamp,
          actor_principal_id: ctx.userId ?? null,
          subject_snapshot: JSON.stringify({
            userId: ctx.userId,
            tenantId: ctx.tenantId,
            realmId: ctx.realmId,
            roles: ctx.roles,
          }) as any,
          entity_name: resource,
          entity_id: entityId ?? null,
          entity_version_id: entityVersionId ?? null,
          operation_code: action,
          effect: decision.effect,
          matched_rule_id: decision.matchedRuleId ?? null,
          matched_policy_version_id: null, // TODO: Track policy version
          reason: decision.reason ?? null,
          correlation_id: null, // TODO: Add correlationId to RequestContext
        })
        .execute();

      console.log(
        JSON.stringify({
          msg: "policy_decision_logged",
          tenantId: ctx.tenantId,
          actor: ctx.userId,
          action,
          resource,
          effect: decision.effect,
          matchedRule: decision.matchedRuleId,
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "policy_decision_log_error",
          error: String(error),
        }),
      );
      // Don't fail authorization on logging error
    }
  }
}
