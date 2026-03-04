/**
 * Audit Query Policy Gate
 *
 * Enforces role-based access control on audit queries.
 * Restricts what events a caller can see and which fields are exposed.
 *
 * Roles:
 *   - "view_own_events"    → caller sees only their own events (actor_user_id filter)
 *   - "view_tenant_events" → caller sees all events in their tenant
 *   - "security_admin"     → full access including ip_address, user_agent, privileged events
 *
 * Audit-of-audit: every query is logged to core.security_event as AUDIT_VIEWED.
 */

import type {
  AuditEvent,
  AuditEventQueryOptions,
} from "../../workflow-engine/audit/types.js";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export type AuditAccessRole =
  | "view_own_events"
  | "view_tenant_events"
  | "security_admin";

export interface AuditCaller {
  userId: string;
  tenantId: string;
  roles: AuditAccessRole[];
  ipAddress?: string;
}

export interface AuditQueryPermission {
  /** Whether the query is allowed at all */
  allowed: boolean;

  /** Reason if denied */
  reason?: string;

  /** Enforced filter overrides (caller cannot bypass) */
  enforcedFilters: Partial<AuditEventQueryOptions>;

  /** Fields to strip from results */
  redactedFields: string[];
}

// ============================================================================
// Gate
// ============================================================================

export class AuditQueryPolicyGate {
  constructor(private readonly db?: Kysely<DB>) {}

  /**
   * Authorize an audit query and return enforced constraints.
   */
  authorize(
    caller: AuditCaller,
    query: AuditEventQueryOptions,
  ): AuditQueryPermission {
    // Security admin gets full access
    if (caller.roles.includes("security_admin")) {
      return {
        allowed: true,
        enforcedFilters: {},
        redactedFields: [],
      };
    }

    // Tenant-level access — can see all events in their tenant
    if (caller.roles.includes("view_tenant_events")) {
      return {
        allowed: true,
        enforcedFilters: {},
        redactedFields: ["ip_address", "user_agent"], // Non-admin can't see PII
      };
    }

    // Own-events access — filter forced to caller's userId
    if (caller.roles.includes("view_own_events")) {
      return {
        allowed: true,
        enforcedFilters: {
          actorUserId: caller.userId,
        },
        redactedFields: ["ip_address", "user_agent"],
      };
    }

    // No matching role — deny
    return {
      allowed: false,
      reason: "Insufficient audit access permissions",
      enforcedFilters: {},
      redactedFields: [],
    };
  }

  /**
   * Apply permission to query options (merge enforced filters).
   */
  applyPermission(
    query: AuditEventQueryOptions,
    permission: AuditQueryPermission,
  ): AuditEventQueryOptions {
    return {
      ...query,
      ...permission.enforcedFilters,
    };
  }

  /**
   * Strip redacted fields from audit event results.
   */
  redactResults(
    events: AuditEvent[],
    permission: AuditQueryPermission,
  ): AuditEvent[] {
    if (permission.redactedFields.length === 0) return events;

    return events.map((event) => {
      const redacted = { ...event };
      for (const field of permission.redactedFields) {
        if (field === "ip_address") {
          redacted.ipAddress = undefined;
        }
        if (field === "user_agent") {
          redacted.userAgent = undefined;
        }
      }
      return redacted;
    });
  }

  /**
   * Log audit query access to core.security_event (audit-of-audit).
   */
  async logAccess(
    caller: AuditCaller,
    query: AuditEventQueryOptions,
  ): Promise<void> {
    if (!this.db) return;

    try {
      await this.db
        .insertInto("sec.security_event" as any)
        .values({
          id: crypto.randomUUID(),
          tenant_id: caller.tenantId,
          principal_id: null,
          event_type: "AUDIT_VIEWED",
          severity: "info",
          occurred_at: new Date(),
          ip_address: caller.ipAddress ?? null,
          user_agent: null,
          correlation_id: null,
          details: JSON.stringify({
            userId: caller.userId,
            roles: caller.roles,
            queryFilters: {
              instanceId: query.instanceId,
              entityType: query.entityType,
              eventTypes: query.eventTypes,
              startDate: query.startDate?.toISOString(),
              endDate: query.endDate?.toISOString(),
            },
          }),
          created_at: new Date(),
        })
        .execute();
    } catch {
      // Best-effort — don't break the query if audit-of-audit fails
    }
  }
}
