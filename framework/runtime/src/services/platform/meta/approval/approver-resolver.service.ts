/**
 * Approver Resolver Service
 *
 * Resolves approval assignees from routing rules using multiple strategies:
 * - direct: Explicit principal_id / group_id (Phase 1 behavior)
 * - role: Expand principals with a given role (optionally scoped to OU)
 * - group: Expand members of a principal group
 * - hierarchy: Find manager N levels up from the requester
 * - department: Find principals in a given OU
 * - custom_field: Match principals by metadata field value
 *
 * Integrates the shared condition evaluator for rule condition matching.
 * Results are cached in Redis with a 300s TTL.
 */

import { sql } from "kysely";

import {
  evaluateConditionGroup,
  type ConditionGroup,
  type EvaluationContext,
} from "../../shared/condition-evaluator.js";

import type { LifecycleDB_Type } from "../data/db-helpers.js";
import type { Redis } from "ioredis";

// ============================================================================
// Types
// ============================================================================

/**
 * A resolved assignee for an approval task.
 */
export type ResolvedAssignee = {
  principalId?: string;
  groupId?: string;
  ruleId?: string;
};

/**
 * A routing rule from meta.approval_template_rule.
 */
export type RoutingRule = {
  id: string;
  conditions: unknown;
  assign_to: unknown;
  priority?: number;
};

/**
 * Supported assignment strategies.
 */
export type AssignmentStrategy =
  | "direct"
  | "role"
  | "group"
  | "hierarchy"
  | "department"
  | "custom_field";

/**
 * Parsed assignment target from rule's assign_to JSON.
 */
type AssignmentTarget = {
  strategy: AssignmentStrategy;

  // direct
  principal_id?: string;
  group_id?: string;
  assignees?: Array<{ principal_id?: string; group_id?: string }>;

  // role
  role_code?: string;
  ou_scope?: string;

  // group
  group_code?: string;

  // hierarchy
  skip_levels?: number;

  // department / OU
  department_code?: string;
  ou_code?: string;

  // custom_field
  field_path?: string;
  field_value?: unknown;
};

// ============================================================================
// Service
// ============================================================================

const CACHE_TTL = 300; // 5 minutes
const CACHE_PREFIX = "approver";

export class ApproverResolverService {
  constructor(
    private readonly db: LifecycleDB_Type,
    private readonly cache?: Redis,
  ) {}

  /**
   * Resolve assignees from routing rules using condition evaluation + strategies.
   * Rules are evaluated in priority order; first matching rule wins.
   */
  async resolveAssignees(
    rules: RoutingRule[],
    context: EvaluationContext,
    tenantId: string,
  ): Promise<ResolvedAssignee[]> {
    if (rules.length === 0) return [];

    // Sort by priority (lower = higher priority)
    const sorted = [...rules].sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
    );

    for (const rule of sorted) {
      // Evaluate conditions (if present) using shared condition evaluator
      if (rule.conditions && typeof rule.conditions === "object") {
        const condGroup = rule.conditions as ConditionGroup;
        // Only evaluate if it has conditions array (skip empty/null)
        if (condGroup.conditions && condGroup.conditions.length > 0) {
          if (!evaluateConditionGroup(condGroup, context)) {
            continue; // Conditions not met — skip this rule
          }
        }
      }

      // Resolve the assignment target
      const assignTo = rule.assign_to as Record<string, unknown> | null;
      if (!assignTo) continue;

      const assignees = await this.resolveTarget(assignTo, context, tenantId, rule.id);
      if (assignees.length > 0) return assignees;
    }

    return [];
  }

  // =========================================================================
  // Target Resolution
  // =========================================================================

  private async resolveTarget(
    assignTo: Record<string, unknown>,
    context: EvaluationContext,
    tenantId: string,
    ruleId: string,
  ): Promise<ResolvedAssignee[]> {
    const strategy = (assignTo.strategy as AssignmentStrategy) ?? "direct";

    switch (strategy) {
      case "direct":
        return this.resolveDirect(assignTo as AssignmentTarget, ruleId);

      case "role":
        return this.resolveByRole(
          assignTo.role_code as string,
          tenantId,
          ruleId,
          assignTo.ou_scope as string | undefined,
        );

      case "group":
        return this.resolveByGroup(
          assignTo.group_code as string,
          tenantId,
          ruleId,
        );

      case "hierarchy":
        return this.resolveByHierarchy(
          context.requester_id as string ?? context.userId as string ?? "",
          tenantId,
          ruleId,
          (assignTo.skip_levels as number) ?? 1,
        );

      case "department": {
        const code = (assignTo.department_code ?? assignTo.ou_code) as string;
        return this.resolveByDepartment(code, tenantId, ruleId);
      }

      case "custom_field":
        return this.resolveByCustomField(
          assignTo.field_path as string,
          assignTo.field_value as unknown,
          tenantId,
          ruleId,
        );

      default:
        // Unknown strategy — fall back to direct
        return this.resolveDirect(assignTo as AssignmentTarget, ruleId);
    }
  }

  // =========================================================================
  // Strategy: Direct (Phase 1 compatible)
  // =========================================================================

  private resolveDirect(
    target: AssignmentTarget,
    ruleId: string,
  ): ResolvedAssignee[] {
    const assignees: ResolvedAssignee[] = [];

    // Support array of assignees (backward compat)
    const assignments = Array.isArray(target.assignees)
      ? target.assignees
      : [target];

    for (const a of assignments) {
      const pid = a.principal_id as string | undefined;
      const gid = a.group_id as string | undefined;
      if (pid || gid) {
        assignees.push({ principalId: pid, groupId: gid, ruleId });
      }
    }

    return assignees;
  }

  // =========================================================================
  // Strategy: Role
  // =========================================================================

  /**
   * Find all principals with the given role (optionally scoped to an OU subtree).
   */
  private async resolveByRole(
    roleCode: string,
    tenantId: string,
    ruleId: string,
    ouScope?: string,
  ): Promise<ResolvedAssignee[]> {
    if (!roleCode) return [];

    const cacheKey = `${CACHE_PREFIX}:${tenantId}:role:${roleCode}:${ouScope ?? "*"}`;
    const cached = await this.getCache(cacheKey);
    if (cached) return cached.map((pid: string) => ({ principalId: pid, ruleId }));

    let principalIds: string[];

    if (ouScope) {
      // Role + OU scope: principals who have the role AND belong to the OU
      const rows = await sql`
        SELECT DISTINCT pr.principal_id
        FROM core.principal_role pr
          JOIN core.role r ON r.id = pr.role_id AND r.tenant_id = ${tenantId}
          JOIN core.principal_ou po ON po.principal_id = pr.principal_id AND po.tenant_id = ${tenantId}
          JOIN core.organizational_unit ou ON ou.id = po.ou_id AND ou.tenant_id = ${tenantId}
        WHERE r.code = ${roleCode}
          AND r.tenant_id = ${tenantId}
          AND ou.code = ${ouScope}
          AND (pr.expires_at IS NULL OR pr.expires_at > NOW())
      `.execute(this.db);

      principalIds = rows.rows.map((r: any) => r.principal_id as string);
    } else {
      // Role only: all principals with this role
      const rows = await sql`
        SELECT DISTINCT pr.principal_id
        FROM core.principal_role pr
          JOIN core.role r ON r.id = pr.role_id AND r.tenant_id = ${tenantId}
        WHERE r.code = ${roleCode}
          AND r.tenant_id = ${tenantId}
          AND (pr.expires_at IS NULL OR pr.expires_at > NOW())
      `.execute(this.db);

      principalIds = rows.rows.map((r: any) => r.principal_id as string);
    }

    await this.setCache(cacheKey, principalIds);
    return principalIds.map((pid) => ({ principalId: pid, ruleId }));
  }

  // =========================================================================
  // Strategy: Group
  // =========================================================================

  /**
   * Find all members of a principal group by group code.
   */
  private async resolveByGroup(
    groupCode: string,
    tenantId: string,
    ruleId: string,
  ): Promise<ResolvedAssignee[]> {
    if (!groupCode) return [];

    const cacheKey = `${CACHE_PREFIX}:${tenantId}:group:${groupCode}`;
    const cached = await this.getCache(cacheKey);
    if (cached) return cached.map((pid: string) => ({ principalId: pid, ruleId }));

    const rows = await sql`
      SELECT DISTINCT gm.principal_id
      FROM core.group_member gm
        JOIN core.principal_group pg ON pg.id = gm.group_id AND pg.tenant_id = ${tenantId}
      WHERE pg.code = ${groupCode}
        AND gm.tenant_id = ${tenantId}
    `.execute(this.db);

    const principalIds = rows.rows.map((r: any) => r.principal_id as string);
    await this.setCache(cacheKey, principalIds);
    return principalIds.map((pid) => ({ principalId: pid, ruleId }));
  }

  // =========================================================================
  // Strategy: Hierarchy
  // =========================================================================

  /**
   * Walk the OU parent chain from the requester's OU to find a manager.
   * skip_levels = 1 means direct manager (one level up).
   */
  private async resolveByHierarchy(
    userId: string,
    tenantId: string,
    ruleId: string,
    skipLevels: number,
  ): Promise<ResolvedAssignee[]> {
    if (!userId) return [];

    // 1. Find the requester's OU
    const ouRow = await sql`
      SELECT ou.id, ou.parent_id
      FROM core.principal_ou po
        JOIN core.organizational_unit ou ON ou.id = po.ou_id
      WHERE po.principal_id = ${userId}
        AND po.tenant_id = ${tenantId}
      LIMIT 1
    `.execute(this.db);

    if (ouRow.rows.length === 0) return [];

    // 2. Walk parent chain skip_levels times
    let currentOuId = (ouRow.rows[0] as any).parent_id as string | null;
    let level = 1;
    while (currentOuId && level < skipLevels) {
      const parentRow = await sql`
        SELECT parent_id FROM core.organizational_unit
        WHERE id = ${currentOuId} AND tenant_id = ${tenantId}
      `.execute(this.db);

      if (parentRow.rows.length === 0) break;
      currentOuId = (parentRow.rows[0] as any).parent_id as string | null;
      level++;
    }

    if (!currentOuId) return [];

    // 3. Find principals assigned to the target OU (managers)
    const cacheKey = `${CACHE_PREFIX}:${tenantId}:hierarchy:${currentOuId}`;
    const cached = await this.getCache(cacheKey);
    if (cached) return cached.map((pid: string) => ({ principalId: pid, ruleId }));

    const rows = await sql`
      SELECT DISTINCT po.principal_id
      FROM core.principal_ou po
      WHERE po.ou_id = ${currentOuId}
        AND po.tenant_id = ${tenantId}
    `.execute(this.db);

    const principalIds = rows.rows.map((r: any) => r.principal_id as string);
    await this.setCache(cacheKey, principalIds);
    return principalIds.map((pid) => ({ principalId: pid, ruleId }));
  }

  // =========================================================================
  // Strategy: Department / OU
  // =========================================================================

  /**
   * Find all principals assigned to an organizational unit by code.
   */
  private async resolveByDepartment(
    ouCode: string,
    tenantId: string,
    ruleId: string,
  ): Promise<ResolvedAssignee[]> {
    if (!ouCode) return [];

    const cacheKey = `${CACHE_PREFIX}:${tenantId}:dept:${ouCode}`;
    const cached = await this.getCache(cacheKey);
    if (cached) return cached.map((pid: string) => ({ principalId: pid, ruleId }));

    const rows = await sql`
      SELECT DISTINCT po.principal_id
      FROM core.principal_ou po
        JOIN core.organizational_unit ou ON ou.id = po.ou_id AND ou.tenant_id = ${tenantId}
      WHERE ou.code = ${ouCode}
        AND po.tenant_id = ${tenantId}
    `.execute(this.db);

    const principalIds = rows.rows.map((r: any) => r.principal_id as string);
    await this.setCache(cacheKey, principalIds);
    return principalIds.map((pid) => ({ principalId: pid, ruleId }));
  }

  // =========================================================================
  // Strategy: Custom Field
  // =========================================================================

  /**
   * Find principals whose metadata contains a specific field value.
   * Uses JSONB containment on core.principal.metadata.
   */
  private async resolveByCustomField(
    fieldPath: string,
    fieldValue: unknown,
    tenantId: string,
    ruleId: string,
  ): Promise<ResolvedAssignee[]> {
    if (!fieldPath) return [];

    const cacheKey = `${CACHE_PREFIX}:${tenantId}:custom:${fieldPath}:${String(fieldValue)}`;
    const cached = await this.getCache(cacheKey);
    if (cached) return cached.map((pid: string) => ({ principalId: pid, ruleId }));

    // Use JSONB containment operator for metadata lookup
    // For a field like "cost_center", this checks metadata @> '{"cost_center": "CC-100"}'
    const containment = JSON.stringify({ [fieldPath]: fieldValue });

    const rows = await sql`
      SELECT DISTINCT p.id as principal_id
      FROM core.principal p
      WHERE p.tenant_id = ${tenantId}
        AND p.metadata @> ${containment}::jsonb
    `.execute(this.db);

    const principalIds = rows.rows.map((r: any) => r.principal_id as string);
    await this.setCache(cacheKey, principalIds);
    return principalIds.map((pid) => ({ principalId: pid, ruleId }));
  }

  // =========================================================================
  // Cache Helpers
  // =========================================================================

  private async getCache(key: string): Promise<string[] | null> {
    if (!this.cache) return null;
    try {
      const raw = await this.cache.get(key);
      return raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      return null;
    }
  }

  private async setCache(key: string, value: string[]): Promise<void> {
    if (!this.cache) return;
    try {
      await this.cache.set(key, JSON.stringify(value), "EX", CACHE_TTL);
    } catch {
      // Cache write failure is non-fatal
    }
  }
}
