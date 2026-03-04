/**
 * Policy Explain Service
 *
 * Provides "why" explanations for field access decisions.
 * Useful for debugging and admin tooling.
 */

import type { IFieldSecurityRepository } from "./field-security.repository.js";
import type {
  AbacCondition,
  FieldAccessContext,
  FieldSecurityPolicy,
  PolicyScope,
  SubjectSnapshot,
} from "./types.js";
import type { Logger } from "../../../../../kernel/logger.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Node in the policy explain tree
 */
export interface ExplainNode {
  /** Node type */
  type: "root" | "policy" | "condition" | "result";

  /** Display label */
  label: string;

  /** Detailed description */
  description?: string;

  /** Whether this node contributed to allow/deny */
  matched: boolean;

  /** Children nodes */
  children?: ExplainNode[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Full explanation result
 */
export interface PolicyExplainResult {
  /** Entity being accessed */
  entityId: string;

  /** Field being accessed */
  fieldPath: string;

  /** Action (read/write) */
  action: "read" | "write";

  /** Subject making the request */
  subject: {
    id: string;
    type: string;
    roles: string[];
    groups?: string[];
  };

  /** Final decision */
  decision: {
    allowed: boolean;
    reason: string;
    maskStrategy?: string;
  };

  /** Explanation tree */
  explainTree: ExplainNode;

  /** Policies evaluated (in order) */
  policiesEvaluated: Array<{
    policyId: string;
    scope: PolicyScope;
    priority: number;
    matched: boolean;
    reason: string;
  }>;

  /** Execution time (ms) */
  executionTimeMs: number;
}

/**
 * Batch explain result for multiple fields
 */
export interface BatchExplainResult {
  /** Entity being accessed */
  entityId: string;

  /** Action (read/write) */
  action: "read" | "write";

  /** Subject making the request */
  subject: {
    id: string;
    type: string;
    roles: string[];
  };

  /** Results per field */
  fields: Array<{
    fieldPath: string;
    allowed: boolean;
    maskStrategy?: string;
    reason: string;
    policyId?: string;
  }>;

  /** Summary */
  summary: {
    totalFields: number;
    allowed: number;
    denied: number;
    masked: number;
  };
}

// ============================================================================
// Policy Explain Service
// ============================================================================

/**
 * Service for explaining policy decisions.
 */
export class PolicyExplainService {
  constructor(
    private repo: IFieldSecurityRepository,
    private logger: Logger
  ) {}

  /**
   * Explain why a subject can/cannot access a specific field
   */
  async explainFieldAccess(
    entityId: string,
    fieldPath: string,
    action: "read" | "write",
    subject: SubjectSnapshot,
    context: FieldAccessContext
  ): Promise<PolicyExplainResult> {
    const startTime = Date.now();

    // Build explain tree
    const explainTree: ExplainNode = {
      type: "root",
      label: `Field Access: ${fieldPath}`,
      description: `Evaluating ${action} access to field '${fieldPath}' on entity '${entityId}'`,
      matched: false,
      children: [],
    };

    // Add subject info
    explainTree.children!.push({
      type: "condition",
      label: "Subject",
      description: `Type: ${subject.type}, ID: ${subject.id}`,
      matched: true,
      metadata: {
        roles: subject.roles,
        groups: subject.groups,
        attributes: subject.attributes,
      },
    });

    // Load applicable policies
    const allPolicies = await this.repo.findPoliciesForEntity(entityId, context.tenantId);

    const applicablePolicies = allPolicies.filter((p) => {
      // Match field path
      if (p.fieldPath !== fieldPath && p.fieldPath !== "*") {
        if (p.fieldPath.endsWith(".*")) {
          const prefix = p.fieldPath.slice(0, -1);
          if (!fieldPath.startsWith(prefix)) return false;
        } else {
          return false;
        }
      }

      // Match policy type
      if (p.policyType !== "both" && p.policyType !== action) {
        return false;
      }

      // Match scope
      if (p.scope === "record" && p.scopeRef !== context.recordId) {
        return false;
      }

      return true;
    });

    // Sort by scope specificity and priority
    const scopeOrder = { record: 0, entity_version: 1, entity: 2, module: 3, global: 4 };
    applicablePolicies.sort((a, b) => {
      const aScopeOrder = scopeOrder[a.scope] ?? 99;
      const bScopeOrder = scopeOrder[b.scope] ?? 99;
      if (aScopeOrder !== bScopeOrder) return aScopeOrder - bScopeOrder;
      return a.priority - b.priority;
    });

    // Add policies node
    const policiesNode: ExplainNode = {
      type: "condition",
      label: `Policies (${applicablePolicies.length} applicable)`,
      matched: false,
      children: [],
    };
    explainTree.children!.push(policiesNode);

    const policiesEvaluated: PolicyExplainResult["policiesEvaluated"] = [];
    let finalDecision: PolicyExplainResult["decision"] | null = null;

    // Evaluate each policy
    for (const policy of applicablePolicies) {
      const policyNode: ExplainNode = {
        type: "policy",
        label: `Policy ${policy.id.substring(0, 8)}...`,
        description: `Scope: ${policy.scope}, Priority: ${policy.priority}`,
        matched: false,
        children: [],
        metadata: {
          policyId: policy.id,
          scope: policy.scope,
          priority: policy.priority,
        },
      };

      // Evaluate conditions
      const { matched, reason, conditionNodes } = this.evaluatePolicyWithExplain(policy, subject);

      policyNode.children = conditionNodes;
      policyNode.matched = matched;

      policiesEvaluated.push({
        policyId: policy.id,
        scope: policy.scope,
        priority: policy.priority,
        matched,
        reason,
      });

      policiesNode.children!.push(policyNode);

      if (matched && !finalDecision) {
        policiesNode.matched = true;
        finalDecision = {
          allowed: true,
          reason: `Matched policy ${policy.id.substring(0, 8)}`,
          maskStrategy: action === "read" ? policy.maskStrategy : undefined,
        };
      }
    }

    // Default decision if no policy matched
    if (!finalDecision) {
      finalDecision = {
        allowed: false,
        reason: "No matching policy found",
      };
    }

    // Add result node
    const resultNode: ExplainNode = {
      type: "result",
      label: finalDecision.allowed ? "ALLOWED" : "DENIED",
      description: finalDecision.reason,
      matched: true,
      metadata: {
        maskStrategy: finalDecision.maskStrategy,
      },
    };
    explainTree.children!.push(resultNode);
    explainTree.matched = finalDecision.allowed;

    return {
      entityId,
      fieldPath,
      action,
      subject: {
        id: subject.id,
        type: subject.type,
        roles: subject.roles,
        groups: subject.groups,
      },
      decision: finalDecision,
      explainTree,
      policiesEvaluated,
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Batch explain for multiple fields
   */
  async explainBatch(
    entityId: string,
    fieldPaths: string[],
    action: "read" | "write",
    subject: SubjectSnapshot,
    context: FieldAccessContext
  ): Promise<BatchExplainResult> {
    const results: BatchExplainResult["fields"] = [];

    for (const fieldPath of fieldPaths) {
      const explain = await this.explainFieldAccess(entityId, fieldPath, action, subject, context);
      results.push({
        fieldPath,
        allowed: explain.decision.allowed,
        maskStrategy: explain.decision.maskStrategy,
        reason: explain.decision.reason,
        policyId: explain.policiesEvaluated.find((p) => p.matched)?.policyId,
      });
    }

    const allowed = results.filter((r) => r.allowed).length;
    const masked = results.filter((r) => r.allowed && r.maskStrategy).length;

    return {
      entityId,
      action,
      subject: {
        id: subject.id,
        type: subject.type,
        roles: subject.roles,
      },
      fields: results,
      summary: {
        totalFields: results.length,
        allowed,
        denied: results.length - allowed,
        masked,
      },
    };
  }

  /**
   * Evaluate policy and return explain nodes
   */
  private evaluatePolicyWithExplain(
    policy: FieldSecurityPolicy,
    subject: SubjectSnapshot
  ): { matched: boolean; reason: string; conditionNodes: ExplainNode[] } {
    const conditionNodes: ExplainNode[] = [];

    // Check role-based access
    if (policy.roleList && policy.roleList.length > 0) {
      const matchedRoles = policy.roleList.filter((role) => subject.roles.includes(role));
      const roleMatched = matchedRoles.length > 0;

      conditionNodes.push({
        type: "condition",
        label: "Role Check",
        description: `Required: [${policy.roleList.join(", ")}], Subject has: [${subject.roles.join(", ")}]`,
        matched: roleMatched,
        metadata: {
          requiredRoles: policy.roleList,
          subjectRoles: subject.roles,
          matchedRoles,
        },
      });

      if (roleMatched) {
        return {
          matched: true,
          reason: `Role matched: ${matchedRoles.join(", ")}`,
          conditionNodes,
        };
      }
    }

    // Check ABAC condition
    if (policy.abacCondition) {
      const { matched: abacMatched, nodes: abacNodes } = this.evaluateAbacWithExplain(
        policy.abacCondition,
        subject
      );

      conditionNodes.push({
        type: "condition",
        label: "ABAC Condition",
        matched: abacMatched,
        children: abacNodes,
      });

      if (abacMatched) {
        return {
          matched: true,
          reason: "ABAC condition matched",
          conditionNodes,
        };
      }
    }

    // Neither matched
    if (!policy.roleList?.length && !policy.abacCondition) {
      return {
        matched: false,
        reason: "Policy has no conditions (invalid)",
        conditionNodes,
      };
    }

    return {
      matched: false,
      reason: "No conditions matched",
      conditionNodes,
    };
  }

  /**
   * Evaluate ABAC condition with explain nodes
   */
  private evaluateAbacWithExplain(
    condition: AbacCondition,
    subject: SubjectSnapshot
  ): { matched: boolean; nodes: ExplainNode[] } {
    const nodes: ExplainNode[] = [];

    // Handle logical operators
    if (condition.operator) {
      const subResults: { matched: boolean; nodes: ExplainNode[] }[] = [];

      for (const subCondition of condition.conditions ?? []) {
        subResults.push(this.evaluateAbacWithExplain(subCondition, subject));
      }

      let matched: boolean;
      let label: string;

      switch (condition.operator) {
        case "and":
          matched = subResults.every((r) => r.matched);
          label = `AND (${subResults.length} conditions)`;
          break;
        case "or":
          matched = subResults.some((r) => r.matched);
          label = `OR (${subResults.length} conditions)`;
          break;
        case "not":
          matched = subResults.length > 0 ? !subResults[0].matched : false;
          label = "NOT";
          break;
        default:
          matched = false;
          label = "Unknown operator";
      }

      nodes.push({
        type: "condition",
        label,
        matched,
        children: subResults.flatMap((r) => r.nodes),
      });

      return { matched, nodes };
    }

    // Handle attribute comparison
    if (condition.attribute && condition.comparison) {
      const subjectValue = this.getSubjectAttribute(subject, condition.attribute);
      const matched = this.compareValues(subjectValue, condition.comparison, condition.value);

      nodes.push({
        type: "condition",
        label: `${condition.attribute} ${condition.comparison} ${JSON.stringify(condition.value)}`,
        description: `Subject value: ${JSON.stringify(subjectValue)}`,
        matched,
        metadata: {
          attribute: condition.attribute,
          comparison: condition.comparison,
          expectedValue: condition.value,
          actualValue: subjectValue,
        },
      });

      return { matched, nodes };
    }

    return { matched: false, nodes };
  }

  /**
   * Get attribute value from subject
   */
  private getSubjectAttribute(subject: SubjectSnapshot, attributePath: string): unknown {
    if (attributePath === "roles") return subject.roles;
    if (attributePath === "groups") return subject.groups;
    if (attributePath === "tenantId") return subject.tenantId;
    if (attributePath === "type") return subject.type;

    if (attributePath.startsWith("attributes.")) {
      const attrName = attributePath.substring("attributes.".length);
      return subject.attributes?.[attrName];
    }

    if (attributePath.startsWith("ouMembership.")) {
      const ouField = attributePath.substring("ouMembership.".length);
      if (ouField === "nodeId") return subject.ouMembership?.nodeId;
      if (ouField === "path") return subject.ouMembership?.path;
    }

    return undefined;
  }

  /**
   * Compare values
   */
  private compareValues(subjectValue: unknown, comparison: string, conditionValue: unknown): boolean {
    switch (comparison) {
      case "eq":
        return subjectValue === conditionValue;
      case "neq":
        return subjectValue !== conditionValue;
      case "in":
        if (Array.isArray(conditionValue)) return conditionValue.includes(subjectValue);
        if (Array.isArray(subjectValue)) return subjectValue.some((v) => v === conditionValue);
        return false;
      case "nin":
        if (Array.isArray(conditionValue)) return !conditionValue.includes(subjectValue);
        if (Array.isArray(subjectValue)) return !subjectValue.some((v) => v === conditionValue);
        return true;
      case "contains":
        if (typeof subjectValue === "string" && typeof conditionValue === "string") {
          return subjectValue.includes(conditionValue);
        }
        if (Array.isArray(subjectValue)) return subjectValue.includes(conditionValue);
        return false;
      default:
        return false;
    }
  }
}
