/**
 * Field Access Service
 *
 * Core service for field-level security.
 * Handles access decisions, field filtering, and audit logging.
 */

import type { IFieldSecurityRepository } from "./field-security.repository.js";
import type { MaskingService } from "./masking.service.js";
import type {
  AbacCondition,
  FieldAccessAuditEntry,
  FieldAccessContext,
  FieldAccessDecision,
  FieldFilterResult,
  FieldSecurityPolicy,
  SubjectSnapshot,
} from "./types.js";
import type { Logger } from "../../../../../kernel/logger.js";

// ============================================================================
// Field Access Service
// ============================================================================

/**
 * Service for field-level access control.
 * Evaluates policies, filters fields, applies masking, and logs access.
 */
export class FieldAccessService {
  // Cache for policies (entity-level)
  private policyCache = new Map<string, { policies: FieldSecurityPolicy[]; expiresAt: number }>();
  private readonly cacheTtlMs = 60000; // 1 minute cache

  constructor(
    private repo: IFieldSecurityRepository,
    private masking: MaskingService,
    private logger: Logger
  ) {}

  // ============================================================================
  // Access Check Methods
  // ============================================================================

  /**
   * Check if subject can read a specific field
   */
  async canRead(
    entityId: string,
    fieldPath: string,
    subject: SubjectSnapshot,
    context?: FieldAccessContext
  ): Promise<FieldAccessDecision> {
    return this.checkAccess(entityId, fieldPath, "read", subject, context);
  }

  /**
   * Check if subject can write a specific field
   */
  async canWrite(
    entityId: string,
    fieldPath: string,
    subject: SubjectSnapshot,
    context?: FieldAccessContext
  ): Promise<FieldAccessDecision> {
    return this.checkAccess(entityId, fieldPath, "write", subject, context);
  }

  /**
   * Internal method to check access for a specific action
   */
  private async checkAccess(
    entityId: string,
    fieldPath: string,
    action: "read" | "write",
    subject: SubjectSnapshot,
    context?: FieldAccessContext
  ): Promise<FieldAccessDecision> {
    // Get applicable policies
    const policies = await this.getApplicablePolicies(
      entityId,
      fieldPath,
      action,
      context?.tenantId ?? subject.tenantId,
      context?.recordId
    );

    // If no policies, allow by default
    if (policies.length === 0) {
      return { allowed: true, reason: "no_policy" };
    }

    // Evaluate policies in priority order (first match wins)
    for (const policy of policies) {
      const matches = this.evaluatePolicyConditions(policy, subject);

      if (matches) {
        // Policy matches - apply it
        return {
          allowed: true,
          maskStrategy: action === "read" ? policy.maskStrategy : undefined,
          maskConfig: action === "read" ? policy.maskConfig : undefined,
          policyId: policy.id,
          reason: "policy_match",
        };
      }
    }

    // No policy matched - deny by default
    return {
      allowed: false,
      reason: "no_matching_policy",
    };
  }

  // ============================================================================
  // Field Filtering Methods
  // ============================================================================

  /**
   * Filter readable fields from a record.
   * Returns record with only allowed fields, masked as needed.
   */
  async filterReadable(
    entityId: string,
    record: Record<string, unknown>,
    subject: SubjectSnapshot,
    context: FieldAccessContext
  ): Promise<FieldFilterResult> {
    const result: Record<string, unknown> = {};
    const allowedFields: string[] = [];
    const maskedFields: string[] = [];
    const removedFields: string[] = [];
    const auditEntries: FieldAccessAuditEntry[] = [];

    // Get all field paths in the record
    const fieldPaths = this.extractFieldPaths(record);

    for (const fieldPath of fieldPaths) {
      const decision = await this.canRead(entityId, fieldPath, subject, context);

      // Create audit entry
      auditEntries.push({
        entityKey: entityId,
        recordId: context.recordId,
        subjectId: subject.id,
        subjectType: subject.type,
        action: "read",
        fieldPath,
        wasAllowed: decision.allowed,
        maskApplied: decision.maskStrategy,
        policyId: decision.policyId,
        requestId: context.requestId,
        traceId: context.traceId,
        tenantId: context.tenantId,
      });

      if (!decision.allowed) {
        removedFields.push(fieldPath);
        continue;
      }

      const value = this.getValueAtPath(record, fieldPath);

      // Apply masking if needed
      if (decision.maskStrategy) {
        const maskedValue = this.masking.mask(value, decision.maskStrategy, decision.maskConfig);

        if (maskedValue === undefined) {
          // 'remove' strategy
          removedFields.push(fieldPath);
        } else {
          this.setValueAtPath(result, fieldPath, maskedValue);
          maskedFields.push(fieldPath);
          allowedFields.push(fieldPath);
        }
      } else {
        this.setValueAtPath(result, fieldPath, value);
        allowedFields.push(fieldPath);
      }
    }

    // Log access (batch)
    if (auditEntries.length > 0) {
      await this.repo.logAccessBatch(auditEntries).catch((err) => {
        this.logger.warn({
          msg: "field_access_audit_failed",
          error: err instanceof Error ? err.message : String(err),
          entryCount: auditEntries.length,
        });
      });
    }

    return { record: result, allowedFields, maskedFields, removedFields };
  }

  /**
   * Filter writable fields from input.
   * Returns input with only allowed fields.
   */
  async filterWritable(
    entityId: string,
    input: Record<string, unknown>,
    subject: SubjectSnapshot,
    context: FieldAccessContext
  ): Promise<FieldFilterResult> {
    const result: Record<string, unknown> = {};
    const allowedFields: string[] = [];
    const maskedFields: string[] = []; // Not applicable for write
    const removedFields: string[] = [];
    const auditEntries: FieldAccessAuditEntry[] = [];

    // Get all field paths in the input
    const fieldPaths = this.extractFieldPaths(input);

    for (const fieldPath of fieldPaths) {
      const decision = await this.canWrite(entityId, fieldPath, subject, context);

      // Create audit entry
      auditEntries.push({
        entityKey: entityId,
        recordId: context.recordId,
        subjectId: subject.id,
        subjectType: subject.type,
        action: "write",
        fieldPath,
        wasAllowed: decision.allowed,
        policyId: decision.policyId,
        requestId: context.requestId,
        traceId: context.traceId,
        tenantId: context.tenantId,
      });

      if (!decision.allowed) {
        removedFields.push(fieldPath);
        continue;
      }

      const value = this.getValueAtPath(input, fieldPath);
      this.setValueAtPath(result, fieldPath, value);
      allowedFields.push(fieldPath);
    }

    // Log access (batch)
    if (auditEntries.length > 0) {
      await this.repo.logAccessBatch(auditEntries).catch((err) => {
        this.logger.warn({
          msg: "field_access_audit_failed",
          error: err instanceof Error ? err.message : String(err),
          entryCount: auditEntries.length,
        });
      });
    }

    return { record: result, allowedFields, maskedFields, removedFields };
  }

  // ============================================================================
  // Field List Methods
  // ============================================================================

  /**
   * Get list of readable field paths for subject
   */
  async getReadableFields(
    entityId: string,
    allFields: string[],
    subject: SubjectSnapshot,
    tenantId: string
  ): Promise<string[]> {
    const readable: string[] = [];

    for (const fieldPath of allFields) {
      const decision = await this.canRead(entityId, fieldPath, subject, { tenantId });
      if (decision.allowed) {
        readable.push(fieldPath);
      }
    }

    return readable;
  }

  /**
   * Get list of writable field paths for subject
   */
  async getWritableFields(
    entityId: string,
    allFields: string[],
    subject: SubjectSnapshot,
    tenantId: string
  ): Promise<string[]> {
    const writable: string[] = [];

    for (const fieldPath of allFields) {
      const decision = await this.canWrite(entityId, fieldPath, subject, { tenantId });
      if (decision.allowed) {
        writable.push(fieldPath);
      }
    }

    return writable;
  }

  // ============================================================================
  // Policy Evaluation
  // ============================================================================

  /**
   * Get applicable policies for a field, sorted by priority
   */
  private async getApplicablePolicies(
    entityId: string,
    fieldPath: string,
    action: "read" | "write",
    tenantId: string,
    recordId?: string
  ): Promise<FieldSecurityPolicy[]> {
    // Check cache first
    const cacheKey = `${tenantId}:${entityId}`;
    const cached = this.policyCache.get(cacheKey);

    let allPolicies: FieldSecurityPolicy[];

    if (cached && cached.expiresAt > Date.now()) {
      allPolicies = cached.policies;
    } else {
      allPolicies = await this.repo.findPoliciesForEntity(entityId, tenantId);
      this.policyCache.set(cacheKey, {
        policies: allPolicies,
        expiresAt: Date.now() + this.cacheTtlMs,
      });
    }

    // Filter to applicable policies
    return allPolicies
      .filter((p) => {
        // Match field path
        if (p.fieldPath !== fieldPath && p.fieldPath !== "*") {
          // Check for wildcard patterns (e.g., "address.*")
          if (p.fieldPath.endsWith(".*")) {
            const prefix = p.fieldPath.slice(0, -1);
            if (!fieldPath.startsWith(prefix)) {
              return false;
            }
          } else {
            return false;
          }
        }

        // Match policy type
        if (p.policyType !== "both" && p.policyType !== action) {
          return false;
        }

        // Match scope (if recordId provided, include record-scoped policies)
        if (p.scope === "record" && p.scopeRef !== recordId) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by scope specificity first, then priority
        const scopeOrder = { record: 0, entity_version: 1, entity: 2, module: 3, global: 4 };
        const aScopeOrder = scopeOrder[a.scope] ?? 99;
        const bScopeOrder = scopeOrder[b.scope] ?? 99;

        if (aScopeOrder !== bScopeOrder) {
          return aScopeOrder - bScopeOrder;
        }

        return a.priority - b.priority;
      });
  }

  /**
   * Evaluate if a policy's conditions match the subject
   */
  private evaluatePolicyConditions(
    policy: FieldSecurityPolicy,
    subject: SubjectSnapshot
  ): boolean {
    // Check role-based access first (simpler, more common)
    if (policy.roleList && policy.roleList.length > 0) {
      const hasRole = policy.roleList.some((role) => subject.roles.includes(role));
      if (hasRole) {
        return true;
      }
    }

    // Check ABAC condition
    if (policy.abacCondition) {
      return this.evaluateAbac(policy.abacCondition, subject);
    }

    // If no conditions specified, policy doesn't match
    // (policies should have at least roleList or abacCondition)
    return false;
  }

  /**
   * Evaluate ABAC condition against subject
   */
  private evaluateAbac(condition: AbacCondition, subject: SubjectSnapshot): boolean {
    // Handle logical operators
    if (condition.operator) {
      const subConditions = condition.conditions ?? [];

      switch (condition.operator) {
        case "and":
          return subConditions.every((c) => this.evaluateAbac(c, subject));

        case "or":
          return subConditions.some((c) => this.evaluateAbac(c, subject));

        case "not":
          return subConditions.length > 0 ? !this.evaluateAbac(subConditions[0], subject) : false;
      }
    }

    // Handle attribute comparison
    if (condition.attribute && condition.comparison) {
      const subjectValue = this.getSubjectAttribute(subject, condition.attribute);
      return this.compareValues(subjectValue, condition.comparison, condition.value);
    }

    return false;
  }

  /**
   * Get attribute value from subject
   */
  private getSubjectAttribute(subject: SubjectSnapshot, attributePath: string): unknown {
    // Handle special paths
    if (attributePath === "roles") {
      return subject.roles;
    }
    if (attributePath === "groups") {
      return subject.groups;
    }
    if (attributePath === "tenantId") {
      return subject.tenantId;
    }
    if (attributePath === "type") {
      return subject.type;
    }

    // Handle nested attributes
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
   * Compare values according to comparison operator
   */
  private compareValues(
    subjectValue: unknown,
    comparison: string,
    conditionValue: unknown
  ): boolean {
    switch (comparison) {
      case "eq":
        return subjectValue === conditionValue;

      case "neq":
        return subjectValue !== conditionValue;

      case "in":
        if (Array.isArray(conditionValue)) {
          return conditionValue.includes(subjectValue);
        }
        if (Array.isArray(subjectValue)) {
          return subjectValue.some((v) => v === conditionValue);
        }
        return false;

      case "nin":
        if (Array.isArray(conditionValue)) {
          return !conditionValue.includes(subjectValue);
        }
        if (Array.isArray(subjectValue)) {
          return !subjectValue.some((v) => v === conditionValue);
        }
        return true;

      case "gt":
        return typeof subjectValue === "number" && typeof conditionValue === "number"
          ? subjectValue > conditionValue
          : false;

      case "gte":
        return typeof subjectValue === "number" && typeof conditionValue === "number"
          ? subjectValue >= conditionValue
          : false;

      case "lt":
        return typeof subjectValue === "number" && typeof conditionValue === "number"
          ? subjectValue < conditionValue
          : false;

      case "lte":
        return typeof subjectValue === "number" && typeof conditionValue === "number"
          ? subjectValue <= conditionValue
          : false;

      case "contains":
        return typeof subjectValue === "string" && typeof conditionValue === "string"
          ? subjectValue.includes(conditionValue)
          : Array.isArray(subjectValue)
            ? subjectValue.includes(conditionValue)
            : false;

      case "starts":
        return typeof subjectValue === "string" && typeof conditionValue === "string"
          ? subjectValue.startsWith(conditionValue)
          : false;

      case "ends":
        return typeof subjectValue === "string" && typeof conditionValue === "string"
          ? subjectValue.endsWith(conditionValue)
          : false;

      case "matches":
        if (typeof subjectValue === "string" && typeof conditionValue === "string") {
          try {
            return new RegExp(conditionValue).test(subjectValue);
          } catch {
            return false;
          }
        }
        return false;

      default:
        return false;
    }
  }

  // ============================================================================
  // Path Manipulation Helpers
  // ============================================================================

  /**
   * Extract all field paths from a record (flattened)
   */
  private extractFieldPaths(obj: Record<string, unknown>, prefix = ""): string[] {
    const paths: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
        // Recurse into nested objects
        paths.push(...this.extractFieldPaths(value as Record<string, unknown>, path));
      } else {
        paths.push(path);
      }
    }

    return paths;
  }

  /**
   * Get value at a dot-notation path
   */
  private getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Set value at a dot-notation path
   */
  private setValueAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split(".");
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Clear policy cache for an entity
   */
  clearCache(entityId?: string, tenantId?: string): void {
    if (entityId && tenantId) {
      this.policyCache.delete(`${tenantId}:${entityId}`);
    } else {
      this.policyCache.clear();
    }
  }
}
