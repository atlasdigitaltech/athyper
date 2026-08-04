import { sql, type Kysely } from "kysely";

export interface TargetCapabilityScope {
  kind: "tenant" | "module";
  targetId: string;
}

export interface TargetCapabilityAuthorizationInput {
  tenantId: string;
  principalId: string;
  permissionCode: string;
  scope: TargetCapabilityScope;
}

export interface TargetCapabilityDecision {
  granted: boolean;
  reason:
    | "granted"
    | "permission_not_published"
    | "scope_not_found"
    | "plane_membership_required"
    | "explicit_deny"
    | "grant_required";
  requiresMfa: boolean;
  requiresSod: boolean;
  grantSource: "group_role" | "delegation" | null;
}

interface DecisionRow {
  permission_exists: boolean;
  scope_exists: boolean;
  membership_exists: boolean;
  group_grant_exists: boolean;
  delegation_grant_exists: boolean;
  deny_exists: boolean;
  requires_mfa: boolean | null;
  requires_sod: boolean | null;
}

/**
 * Exact-code adapter for the normalized plane-local authz authority.
 *
 * This deliberately does not consult the legacy control/master authorization
 * catalog and does not recognize wildcard permission strings. It is suitable
 * for consumers that have completed their canonical authz.* cutover while the
 * broader Admin runtime remains in staged migration.
 */
export class TargetCapabilityAuthorizer {
  // The target DDL is intentionally accessed through schema-qualified SQL and
  // does not depend on the legacy generated database model.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: Kysely<any>) {}

  async authorize(input: TargetCapabilityAuthorizationInput): Promise<TargetCapabilityDecision> {
    return this.db.transaction().execute(async (tx) => {
      await sql`
        SELECT
          set_config('app.current_tenant_id', ${input.tenantId}, true),
          set_config('app.current_principal_id', ${input.principalId}, true),
          set_config('app.database_plane', 'athyper', true),
          set_config('application_name', 'target-capability-authorizer', true)
      `.execute(tx);

      const result = await sql<DecisionRow>`
        WITH requested_permission AS (
          SELECT DISTINCT id, requires_mfa, requires_sod
            FROM authz.permission_catalog
           WHERE canonical_code = ${input.permissionCode}
        ),
        requested_scope AS (
          SELECT id
            FROM authz.scope_target
           WHERE tenant_id = ${input.tenantId}::uuid
             AND scope_kind = ${input.scope.kind}::authz.scope_kind_d
             AND target_id = ${input.scope.targetId}::uuid
             AND status = 'active'
        ),
        membership AS (
          SELECT 1
            FROM authz.current_plane_membership
           WHERE tenant_id = ${input.tenantId}::uuid
             AND principal_id = ${input.principalId}::uuid
        ),
        group_allow AS (
          SELECT 1
            FROM authz.current_principal_group_role_grant AS grant_row
            JOIN requested_permission AS permission
              ON permission.id = grant_row.permission_id
            JOIN requested_scope AS requested ON true
           WHERE authz.fn_scope_assignment_covers_target(
                   ${input.tenantId}::uuid,
                   grant_row.scope_target_id,
                   requested.id,
                   grant_row.propagation_mode
                 )
        ),
        delegation_allow AS (
          SELECT 1
            FROM authz.delegation_grant AS grant_row
            JOIN authz.delegation AS delegation
              ON delegation.tenant_id = grant_row.tenant_id
             AND delegation.id = grant_row.delegation_id
            JOIN requested_permission AS permission
              ON permission.id = grant_row.permission_id
            JOIN authz.permission_catalog AS policy
              ON policy.id = grant_row.permission_id
            JOIN authz.scope_target AS assigned
              ON assigned.tenant_id = grant_row.tenant_id
             AND assigned.id = grant_row.scope_target_id
             AND assigned.scope_kind = policy.scope_kind
            JOIN requested_scope AS requested ON true
           WHERE grant_row.tenant_id = ${input.tenantId}::uuid
             AND delegation.delegate_id = ${input.principalId}::uuid
             AND delegation.status = 'active'
             AND delegation.effective_from <= statement_timestamp()
             AND delegation.effective_until > statement_timestamp()
             AND authz.fn_scope_assignment_covers_target(
                   ${input.tenantId}::uuid,
                   grant_row.scope_target_id,
                   requested.id,
                   policy.propagation_mode
                 )
        ),
        explicit_deny AS (
          SELECT 1
            FROM authz.deny_rule AS deny
            JOIN requested_permission AS permission
              ON permission.id = deny.permission_id
            JOIN authz.permission_catalog AS policy
              ON policy.id = deny.permission_id
            JOIN authz.scope_target AS assigned
              ON assigned.tenant_id = deny.tenant_id
             AND assigned.id = deny.scope_target_id
             AND assigned.scope_kind = policy.scope_kind
             AND assigned.status = 'active'
            JOIN requested_scope AS requested ON true
           WHERE deny.tenant_id = ${input.tenantId}::uuid
             AND deny.status = 'active'
             AND deny.effective_from <= statement_timestamp()
             AND (deny.effective_until IS NULL OR deny.effective_until > statement_timestamp())
             AND (
               deny.subject_kind = 'tenant'
               OR (deny.subject_kind = 'principal' AND deny.principal_id = ${input.principalId}::uuid)
               OR (
                 deny.subject_kind = 'group'
                 AND EXISTS (
                   SELECT 1
                     FROM authz.current_group_member AS member
                    WHERE member.tenant_id = deny.tenant_id
                      AND member.group_id = deny.group_id
                      AND member.principal_id = ${input.principalId}::uuid
                 )
               )
             )
             AND authz.fn_scope_assignment_covers_target(
                   ${input.tenantId}::uuid,
                   deny.scope_target_id,
                   requested.id,
                   policy.propagation_mode
                 )
        )
        SELECT
          EXISTS (SELECT 1 FROM requested_permission) AS permission_exists,
          EXISTS (SELECT 1 FROM requested_scope) AS scope_exists,
          EXISTS (SELECT 1 FROM membership) AS membership_exists,
          EXISTS (SELECT 1 FROM group_allow) AS group_grant_exists,
          EXISTS (SELECT 1 FROM delegation_allow) AS delegation_grant_exists,
          EXISTS (SELECT 1 FROM explicit_deny) AS deny_exists,
          (SELECT requires_mfa FROM requested_permission LIMIT 1) AS requires_mfa,
          (SELECT requires_sod FROM requested_permission LIMIT 1) AS requires_sod
      `.execute(tx);

      const row = result.rows[0]!;
      const grantSource = row.group_grant_exists
        ? "group_role"
        : row.delegation_grant_exists
          ? "delegation"
          : null;
      const reason: TargetCapabilityDecision["reason"] = !row.permission_exists
        ? "permission_not_published"
        : !row.scope_exists
          ? "scope_not_found"
          : !row.membership_exists
            ? "plane_membership_required"
            : row.deny_exists
              ? "explicit_deny"
              : grantSource === null
                ? "grant_required"
                : "granted";

      return {
        granted: reason === "granted",
        reason,
        requiresMfa: row.requires_mfa ?? false,
        requiresSod: row.requires_sod ?? false,
        grantSource,
      };
    });
  }
}
