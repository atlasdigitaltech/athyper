/**
 * ApproverResolverService
 *
 * Resolves `assign_to` specifications from compiled workflow template rules into
 * concrete work_item assignees. Called by the WorkflowEngine during createRequest
 * and stage activation.
 *
 * Supported strategies (assign_to.type):
 *
 *   direct_principal  — assign_to.value is a principal UUID.
 *                       Returned directly as a single principal assignee.
 *
 *   role_based        — assign_to.value is a role code (e.g. "finance_approver").
 *                       Resolves all active principals that have been granted that
 *                       role via iam.access_grant for the tenant. Returns one
 *                       principal assignee per matching principal.
 *
 *   group_based       — assign_to.value is a group code or UUID.
 *                       Returns a single group assignee so that any member of the
 *                       group can claim and action the work_item. The engine maps
 *                       this to event.work_item.assignee_group_id.
 *
 *   hierarchy_based   — assign_to.value is "manager" (default) or any string
 *                       (reserved for future relation types).
 *                       Looks up the requester's active employee record and returns
 *                       the manager's principal as a single principal assignee.
 *                       Falls back gracefully if no employee / manager record exists.
 *
 * Back-compat alias: "principal" maps to direct_principal, "group" maps to group_based.
 *
 * Fail behaviour: each strategy logs and returns [] on lookup error; the engine
 * will log a warning when assignees is empty but will not crash the transaction.
 */

import type { Kysely, Transaction } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApproverResolverDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  logger?: {
    warn(event: string, fields?: Record<string, unknown>): void;
    error?(event: string, fields?: Record<string, unknown>): void;
  };
}

export interface AssignToSpec {
  type: string;
  value?: string;
}

export interface ResolvedAssignee {
  /** "principal" → assignee_id; "group" → assignee_group_id */
  type: "principal" | "group";
  id: string;
}

export interface ResolveContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trx: Transaction<any>;
  tenantId: string;
  /** Principal UUID of the person who submitted the workflow request */
  requestedBy: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ApproverResolverService {
  constructor(private readonly deps: ApproverResolverDeps) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Given compiled template rules and request context, evaluate rule conditions
   * (via JSONLogic) and resolve assignees for the first matching rule.
   *
   * Mirrors the synchronous resolveAssignees() in the engine but adds async
   * DB resolution for role_based, group_based, and hierarchy_based strategies.
   */
  async resolveFromRules(
    rules: Array<{ priority?: number; conditions?: unknown; assign_to: AssignToSpec }>,
    context: ResolveContext & { payload: Record<string, unknown> },
  ): Promise<ResolvedAssignee[]> {
    const { evaluateJsonLogic } = await import("./jsonlogic.js");

    const sorted = [...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    for (const rule of sorted) {
      const matches =
        rule.conditions == null || evaluateJsonLogic(rule.conditions, context.payload);
      if (!matches) continue;

      return this.resolveSpec(rule.assign_to, context);
    }

    return [];
  }

  /**
   * Resolve a single assign_to spec into assignees using the appropriate strategy.
   */
  async resolveSpec(
    spec: AssignToSpec,
    context: ResolveContext,
  ): Promise<ResolvedAssignee[]> {
    const effectiveType = normaliseType(spec.type);

    switch (effectiveType) {
      case "direct_principal":
        return this.resolveDirect(spec, context);

      case "role_based":
        return this.resolveByRole(spec, context);

      case "group_based":
        return this.resolveByGroup(spec, context);

      case "hierarchy_based":
        return this.resolveByHierarchy(spec, context);

      default:
        this.deps.logger?.warn("approver_resolver_unknown_type", { type: spec.type });
        return [];
    }
  }

  // ── Strategy: direct_principal ─────────────────────────────────────────────

  private resolveDirect(
    spec: AssignToSpec,
    _context: ResolveContext,
  ): ResolvedAssignee[] {
    if (!spec.value) return [];
    return [{ type: "principal", id: spec.value }];
  }

  // ── Strategy: role_based ───────────────────────────────────────────────────

  /**
   * Find all active principals in the tenant that have been explicitly granted
   * the specified role. Works via:
   *   shared.role (code → id)  →  iam.access_grant (role_id, principal_id, tenant_id)
   *
   * Returns one principal assignee per match. If the role grants many principals
   * the stage will run in parallel or serial depending on stage mode.
   */
  private async resolveByRole(
    spec: AssignToSpec,
    context: ResolveContext,
  ): Promise<ResolvedAssignee[]> {
    const { trx, tenantId } = context;

    if (!spec.value) {
      this.deps.logger?.warn("approver_resolver_role_based_missing_value");
      return [];
    }

    try {
      // Resolve role code → role UUID
      const roleRow = await trx
        .selectFrom("shared.role as r" as never)
        .select("r.id" as never)
        .where("r.code" as never, "=", spec.value as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!roleRow) {
        this.deps.logger?.warn("approver_resolver_role_not_found", { roleCode: spec.value });
        return [];
      }

      const roleId = roleRow["id"] as string;

      // Find all active principals with that role for this tenant
      const grants = await trx
        .selectFrom("iam.access_grant as ag" as never)
        .select("ag.principal_id" as never)
        .where("ag.tenant_id" as never, "=", tenantId as never)
        .where("ag.role_id" as never, "=", roleId as never)
        .where("ag.status" as never, "=", "active" as never)
        .where("ag.principal_id" as never, "is not" as never, null as never)
        .execute() as Record<string, unknown>[];

      return grants
        .map((g) => g["principal_id"] as string)
        .filter(Boolean)
        .map((id) => ({ type: "principal" as const, id }));
    } catch (err) {
      this.deps.logger?.warn("approver_resolver_role_based_error", {
        roleCode: spec.value,
        err: String(err),
      });
      return [];
    }
  }

  // ── Strategy: group_based ──────────────────────────────────────────────────

  /**
   * Resolve a group UUID or code to a single group assignee.
   * The engine maps group assignees to work_item.assignee_group_id so that
   * any member of the group can claim the item.
   *
   * spec.value may be:
   *   - a UUID  → used directly
   *   - a code  → looked up in iam.auth_group
   */
  private async resolveByGroup(
    spec: AssignToSpec,
    context: ResolveContext,
  ): Promise<ResolvedAssignee[]> {
    const { trx, tenantId } = context;

    if (!spec.value) {
      this.deps.logger?.warn("approver_resolver_group_based_missing_value");
      return [];
    }

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        spec.value,
      );

      if (isUuid) {
        // Verify the group exists in this tenant
        const row = await trx
          .selectFrom("iam.auth_group as ag" as never)
          .select("ag.id" as never)
          .where("ag.id" as never, "=", spec.value as never)
          .where("ag.tenant_id" as never, "=", tenantId as never)
          .executeTakeFirst() as Record<string, unknown> | undefined;

        if (!row) {
          this.deps.logger?.warn("approver_resolver_group_not_found", { groupId: spec.value });
          return [];
        }
        return [{ type: "group", id: spec.value }];
      }

      // Lookup by code
      const row = await trx
        .selectFrom("iam.auth_group as ag" as never)
        .select("ag.id" as never)
        .where("ag.code" as never, "=", spec.value as never)
        .where("ag.tenant_id" as never, "=", tenantId as never)
        .where("ag.status" as never, "=", "active" as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) {
        this.deps.logger?.warn("approver_resolver_group_not_found", { groupCode: spec.value });
        return [];
      }

      return [{ type: "group", id: row["id"] as string }];
    } catch (err) {
      this.deps.logger?.warn("approver_resolver_group_based_error", {
        groupValue: spec.value,
        err: String(err),
      });
      return [];
    }
  }

  // ── Strategy: hierarchy_based ──────────────────────────────────────────────

  /**
   * Resolve the requester's manager as the approver.
   *
   * Lookup path:
   *   hr.employee WHERE principal_id = requestedBy AND tenant_id = tenantId
   *   → manager_id (another employee row)
   *   → employee.principal_id of the manager
   *
   * Falls back to [] with a warning if:
   *   - the requester has no employee record
   *   - the employee has no manager_id
   *   - the manager employee has no linked principal
   */
  private async resolveByHierarchy(
    spec: AssignToSpec,
    context: ResolveContext,
  ): Promise<ResolvedAssignee[]> {
    const { trx, tenantId, requestedBy } = context;
    const relation = spec.value ?? "manager";

    if (relation !== "manager") {
      this.deps.logger?.warn("approver_resolver_hierarchy_unsupported_relation", { relation });
      return [];
    }

    try {
      // Step 1: Find the requester's employee record
      const empRow = await trx
        .selectFrom("hr.employee as e" as never)
        .select(["e.id" as never, "e.manager_id" as never])
        .where("e.tenant_id" as never, "=", tenantId as never)
        .where("e.principal_id" as never, "=", requestedBy as never)
        .where("e.status" as never, "=", "active" as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!empRow || !empRow["manager_id"]) {
        this.deps.logger?.warn("approver_resolver_hierarchy_no_manager", {
          requestedBy,
          hasEmployee: !!empRow,
        });
        return [];
      }

      // Step 2: Find the manager's principal_id
      const managerRow = await trx
        .selectFrom("hr.employee as e" as never)
        .select("e.principal_id" as never)
        .where("e.tenant_id" as never, "=", tenantId as never)
        .where("e.id" as never, "=", empRow["manager_id"] as never)
        .where("e.status" as never, "=", "active" as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!managerRow || !managerRow["principal_id"]) {
        this.deps.logger?.warn("approver_resolver_hierarchy_manager_no_principal", {
          managerId: empRow["manager_id"],
        });
        return [];
      }

      return [{ type: "principal", id: managerRow["principal_id"] as string }];
    } catch (err) {
      this.deps.logger?.warn("approver_resolver_hierarchy_error", {
        requestedBy,
        err: String(err),
      });
      return [];
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise legacy type aliases to canonical names. */
function normaliseType(type: string): string {
  switch (type) {
    case "principal":       return "direct_principal";
    case "group":           return "group_based";
    case "requester_manager": return "hierarchy_based";
    default:                return type;
  }
}
