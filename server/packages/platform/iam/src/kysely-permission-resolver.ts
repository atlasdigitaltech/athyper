import { createHash } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import type {
  EffectiveAuthorizationEvidence,
  EffectiveAuthorizationScope,
  EffectiveOperationBinding,
  EffectivePermissionEntry,
  EffectivePermissionRequirement,
  EffectivePermissionSnapshot,
  PermissionResolver,
  VerifiedIdentity,
} from "@athyper/server-contract-auth";

type AuthorizationTransaction = Kysely<Record<string, never>> | Transaction<Record<string, never>>;

export interface ExactPlaneAuthorizationTransactions {
  run<Result>(identity: VerifiedIdentity, work: (transaction: AuthorizationTransaction) => Promise<Result>): Promise<Result>;
}

type EvidenceRow = {
  permission_code: string;
  effect: "allow" | "deny";
  proof: "role" | "delegation" | "record_acl" | "override" | "deny";
  scope_target_id: string;
  scope_kind: string;
  target_id: string;
  propagation_mode: EffectiveAuthorizationEvidence["propagationMode"];
  resource_code: string | null;
  record_id: string | null;
  effective_until: Date | string | null;
};

type RequirementRow = {
  permission_code: string; module_id: string; risk_tier: EffectivePermissionRequirement["riskTier"];
  requires_mfa: boolean; requires_sod: boolean; entitled: boolean;
};
type OperationBindingRow = {
  entity_code: string; operation_key: string; permission_code: string; decision_mode: string; required_scope_kinds: string[] | null;
};

export class ExactPlaneAuthorizationError extends Error {
  constructor(readonly code: "AUTHZ_PLANE_ADMISSION_INACTIVE" | "AUTHZ_PLANE_DATABASE_UNAVAILABLE") {
    super(code);
  }
}

export function createKyselyPermissionResolver(
  transactions: ExactPlaneAuthorizationTransactions,
  now: () => number = Date.now,
): PermissionResolver {
  return {
    resolve(identity) {
      return transactions.run(identity, async (transaction) => {
        const admission = await sql<{ admitted: boolean }>`
          SELECT EXISTS(
            SELECT 1
            FROM master.tenant tenant
            JOIN master.principal principal ON principal.tenant_id=tenant.id
            JOIN authz.plane_membership membership
              ON membership.tenant_id=principal.tenant_id AND membership.principal_id=principal.id
            WHERE tenant.id=${identity.tenantId}::uuid AND tenant.status='active'
              AND principal.id=${identity.principalId}::uuid AND principal.status='active'
              AND membership.status='active' AND membership.effective_from<=statement_timestamp()
              AND (membership.effective_until IS NULL OR membership.effective_until>statement_timestamp())
          ) AS admitted
        `.execute(transaction);
        if (!admission.rows[0]?.admitted) throw new ExactPlaneAuthorizationError("AUTHZ_PLANE_ADMISSION_INACTIVE");

        const result = await sql<EvidenceRow>`
          WITH RECURSIVE scope_tree AS (
            SELECT scope.id AS ancestor_id,scope.id AS descendant_id,scope.tenant_id
            FROM authz.scope_target scope
            WHERE scope.tenant_id=${identity.tenantId}::uuid AND scope.status='active'
            UNION ALL
            SELECT tree.ancestor_id,child.id,child.tenant_id
            FROM scope_tree tree
            JOIN authz.scope_target child
              ON child.tenant_id=tree.tenant_id AND child.parent_scope_target_id=tree.descendant_id
             AND child.status='active'
          ), current_groups AS (
            SELECT member.group_id
            FROM authz.group_member member
            JOIN authz.principal_group principal_group
              ON principal_group.tenant_id=member.tenant_id AND principal_group.id=member.group_id
             AND principal_group.status='active'
            WHERE member.tenant_id=${identity.tenantId}::uuid
              AND member.principal_id=${identity.principalId}::uuid
              AND member.status='active' AND member.effective_from<=statement_timestamp()
              AND (member.effective_until IS NULL OR member.effective_until>statement_timestamp())
          ), evidence AS (
            SELECT permission.canonical_code AS permission_code,'allow'::text AS effect,'role'::text AS proof,
                   target.id::text AS scope_target_id,target.scope_kind::text AS scope_kind,target.target_id::text AS target_id,
                   assignment.propagation_mode::text AS propagation_mode,NULL::text AS resource_code,NULL::text AS record_id,
                   assignment.effective_until
            FROM current_groups current_group
            JOIN authz.group_role assignment ON assignment.tenant_id=${identity.tenantId}::uuid
             AND assignment.group_id=current_group.group_id AND assignment.status='active'
             AND assignment.effective_from<=statement_timestamp()
             AND (assignment.effective_until IS NULL OR assignment.effective_until>statement_timestamp())
            JOIN authz.role role ON role.tenant_id=assignment.tenant_id AND role.id=assignment.role_id AND role.status='active'
            JOIN authz.role_permission role_permission ON role_permission.tenant_id=role.tenant_id AND role_permission.role_id=role.id
            JOIN authz.permission permission ON permission.id=role_permission.permission_id AND permission.status='published'
            JOIN authz.scope_target anchor ON anchor.tenant_id=assignment.tenant_id AND anchor.id=assignment.scope_target_id AND anchor.status='active'
            JOIN authz.permission_scope_kind compatibility ON compatibility.permission_id=permission.id
             AND compatibility.scope_kind=anchor.scope_kind AND compatibility.propagation_mode=assignment.propagation_mode
             AND compatibility.status='active'
            JOIN scope_tree tree ON tree.tenant_id=assignment.tenant_id AND tree.ancestor_id=assignment.scope_target_id
             AND (assignment.propagation_mode='subtree' OR tree.descendant_id=assignment.scope_target_id)
            JOIN authz.scope_target target ON target.tenant_id=tree.tenant_id AND target.id=tree.descendant_id
            UNION ALL
            SELECT permission.canonical_code,'allow','delegation',target.id::text,target.scope_kind::text,target.target_id::text,
                   'exact',NULL,NULL,delegation.effective_until
            FROM authz.delegation delegation
            JOIN authz.delegation_grant grant_row ON grant_row.tenant_id=delegation.tenant_id AND grant_row.delegation_id=delegation.id
            JOIN authz.permission permission ON permission.id=grant_row.permission_id AND permission.status='published'
            JOIN authz.scope_target target ON target.tenant_id=grant_row.tenant_id AND target.id=grant_row.scope_target_id AND target.status='active'
            JOIN authz.permission_scope_kind compatibility ON compatibility.permission_id=permission.id
             AND compatibility.scope_kind=target.scope_kind AND compatibility.propagation_mode='exact' AND compatibility.status='active'
            WHERE delegation.tenant_id=${identity.tenantId}::uuid AND delegation.delegate_id=${identity.principalId}::uuid
              AND delegation.status='active' AND delegation.effective_from<=statement_timestamp()
              AND delegation.effective_until>statement_timestamp()
              AND EXISTS(
                SELECT 1
                FROM master.principal delegator
                JOIN authz.plane_membership delegator_plane
                  ON delegator_plane.tenant_id=delegator.tenant_id AND delegator_plane.principal_id=delegator.id
                 AND delegator_plane.status='active' AND delegator_plane.effective_from<=statement_timestamp()
                 AND (delegator_plane.effective_until IS NULL OR delegator_plane.effective_until>statement_timestamp())
                WHERE delegator.tenant_id=delegation.tenant_id AND delegator.id=delegation.delegator_id
                  AND delegator.status='active'
              )
              AND EXISTS(
                SELECT 1
                FROM authz.group_member delegator_member
                JOIN authz.principal_group delegator_group
                  ON delegator_group.tenant_id=delegator_member.tenant_id AND delegator_group.id=delegator_member.group_id
                 AND delegator_group.status='active'
                JOIN authz.group_role delegator_assignment
                  ON delegator_assignment.tenant_id=delegator_member.tenant_id AND delegator_assignment.group_id=delegator_member.group_id
                 AND delegator_assignment.status='active' AND delegator_assignment.effective_from<=statement_timestamp()
                 AND (delegator_assignment.effective_until IS NULL OR delegator_assignment.effective_until>statement_timestamp())
                JOIN authz.role delegator_role
                  ON delegator_role.tenant_id=delegator_assignment.tenant_id AND delegator_role.id=delegator_assignment.role_id
                 AND delegator_role.status='active'
                JOIN authz.role_permission delegator_permission
                  ON delegator_permission.tenant_id=delegator_role.tenant_id AND delegator_permission.role_id=delegator_role.id
                 AND delegator_permission.permission_id=grant_row.permission_id
                WHERE delegator_member.tenant_id=delegation.tenant_id AND delegator_member.principal_id=delegation.delegator_id
                  AND delegator_member.status='active' AND delegator_member.effective_from<=statement_timestamp()
                  AND (delegator_member.effective_until IS NULL OR delegator_member.effective_until>statement_timestamp())
                  AND authz.fn_scope_assignment_covers_target(
                    delegation.tenant_id,delegator_assignment.scope_target_id,grant_row.scope_target_id,delegator_assignment.propagation_mode
                  )
              )
              AND NOT EXISTS(
                SELECT 1
                FROM authz.deny_rule delegator_deny
                WHERE delegator_deny.tenant_id=delegation.tenant_id
                  AND delegator_deny.permission_id=grant_row.permission_id
                  AND delegator_deny.status='active' AND delegator_deny.effective_from<=statement_timestamp()
                  AND (delegator_deny.effective_until IS NULL OR delegator_deny.effective_until>statement_timestamp())
                  AND (
                    delegator_deny.subject_kind='tenant'
                    OR (delegator_deny.subject_kind='principal' AND delegator_deny.principal_id=delegation.delegator_id)
                    OR (delegator_deny.subject_kind='group' AND EXISTS(
                      SELECT 1 FROM authz.group_member denied_member
                      WHERE denied_member.tenant_id=delegation.tenant_id AND denied_member.group_id=delegator_deny.group_id
                        AND denied_member.principal_id=delegation.delegator_id AND denied_member.status='active'
                        AND denied_member.effective_from<=statement_timestamp()
                        AND (denied_member.effective_until IS NULL OR denied_member.effective_until>statement_timestamp())
                    ))
                  )
                  AND authz.fn_scope_assignment_covers_target(
                    delegation.tenant_id,delegator_deny.scope_target_id,grant_row.scope_target_id,'subtree'
                  )
              )
            UNION ALL
            SELECT permission.canonical_code,'allow','record_acl',tenant_scope.id::text,tenant_scope.scope_kind::text,
                   tenant_scope.target_id::text,'exact',acl.resource_code,acl.record_id::text,acl.effective_until
            FROM authz.record_acl acl
            JOIN authz.permission permission ON permission.id=acl.permission_id AND permission.status='published' AND permission.is_shareable
            JOIN authz.scope_target tenant_scope ON tenant_scope.tenant_id=acl.tenant_id AND tenant_scope.scope_kind='tenant'
             AND tenant_scope.target_id=acl.tenant_id AND tenant_scope.status='active'
            WHERE acl.tenant_id=${identity.tenantId}::uuid AND acl.status='active'
              AND acl.effective_from<=statement_timestamp() AND (acl.effective_until IS NULL OR acl.effective_until>statement_timestamp())
              AND (acl.principal_id=${identity.principalId}::uuid OR acl.group_id IN (SELECT group_id FROM current_groups))
            UNION ALL
            SELECT permission.canonical_code,'allow','override',target.id::text,target.scope_kind::text,target.target_id::text,
                   'exact',NULL,NULL,override_row.effective_until
            FROM authz.override override_row
            JOIN authz.permission permission ON permission.id=override_row.permission_id AND permission.status='published' AND permission.is_overridable
            JOIN authz.scope_target target ON target.tenant_id=override_row.tenant_id AND target.id=override_row.scope_target_id AND target.status='active'
            JOIN authz.permission_scope_kind compatibility ON compatibility.permission_id=permission.id
             AND compatibility.scope_kind=target.scope_kind AND compatibility.propagation_mode='exact' AND compatibility.status='active'
            WHERE override_row.tenant_id=${identity.tenantId}::uuid AND override_row.principal_id=${identity.principalId}::uuid
              AND override_row.status='active' AND override_row.effective_from<=statement_timestamp()
              AND override_row.effective_until>statement_timestamp()
            UNION ALL
            SELECT permission.canonical_code,'deny','deny',target.id::text,target.scope_kind::text,target.target_id::text,
                   CASE WHEN target.id=deny.scope_target_id THEN 'exact' ELSE 'subtree' END,NULL,NULL,deny.effective_until
            FROM authz.deny_rule deny
            JOIN authz.permission permission ON permission.id=deny.permission_id AND permission.status='published'
            JOIN scope_tree tree ON tree.tenant_id=deny.tenant_id AND tree.ancestor_id=deny.scope_target_id
            JOIN authz.scope_target target ON target.tenant_id=tree.tenant_id AND target.id=tree.descendant_id
            WHERE deny.tenant_id=${identity.tenantId}::uuid AND deny.status='active'
              AND deny.effective_from<=statement_timestamp() AND (deny.effective_until IS NULL OR deny.effective_until>statement_timestamp())
              AND (deny.subject_kind='tenant' OR deny.principal_id=${identity.principalId}::uuid
                   OR deny.group_id IN (SELECT group_id FROM current_groups))
          )
          SELECT * FROM evidence
          ORDER BY permission_code,effect,proof,scope_kind,target_id,record_id NULLS FIRST
        `.execute(transaction);
        const evidenceCodes = [...new Set(result.rows.map((row) => row.permission_code))];
        const catalog = { rows: await readEntitlementRequirements(transaction, identity.tenantId, evidenceCodes) };
        const operationRows = await sql<OperationBindingRow>`
          SELECT binding.entity_code,binding.operation_key,permission.canonical_code AS permission_code,
                 binding.decision_mode::text AS decision_mode,
                 COALESCE(array_agg(scope.scope_kind::text ORDER BY scope.scope_kind)
                   FILTER (WHERE scope.id IS NOT NULL),'{}'::text[]) AS required_scope_kinds
          FROM authz.entity_operation_binding binding
          JOIN authz.permission permission ON permission.id=binding.permission_id AND permission.status='published'
          LEFT JOIN authz.entity_operation_scope_binding scope ON scope.entity_operation_binding_id=binding.id
          WHERE binding.plane_code=${identity.planeKey} AND (binding.tenant_id IS NULL OR binding.tenant_id=${identity.tenantId}::uuid)
            AND binding.status='published' AND binding.effective_from<=statement_timestamp()
            -- Select bindings from the same active tenant artifact as metadata.
            -- A missing/revoked binding in that artifact must not fall back to a
            -- global catalog or another release of the entity.
            AND NOT EXISTS (
              SELECT 1 FROM runtime_meta.entity_descriptor selected
              JOIN runtime_meta.entity_contract contract ON contract.id=selected.entity_contract_id
              JOIN runtime_meta.release_activation_head head ON head.applied_release_id=selected.applied_release_id
              WHERE selected.tenant_id=${identity.tenantId}::uuid
                AND selected.plane_code=binding.plane_code AND contract.entity_code=binding.entity_code
                AND selected.status='active'
                AND selected.applied_release_id IS DISTINCT FROM binding.applied_release_id
            )
            AND (binding.effective_until IS NULL OR binding.effective_until>statement_timestamp())
          GROUP BY binding.id,binding.entity_code,binding.operation_key,permission.canonical_code,binding.decision_mode
        `.execute(transaction);
        return snapshotFromEvidence(identity, result.rows.map(evidenceFromRow), now(), catalog.rows.map(requirementFromRow), operationRows.rows.map(operationBindingFromRow));
      });
    },
  };
}

export function snapshotFromEvidence(
  identity: VerifiedIdentity,
  evidence: readonly EffectiveAuthorizationEvidence[],
  resolvedAt: number,
  requirements: readonly EffectivePermissionRequirement[] = [],
  operationBindings: readonly EffectiveOperationBinding[] = [],
): EffectivePermissionSnapshot {
  const deniedCodes = new Set(evidence
    .filter((item) => item.effect === "deny" && item.scopeKind === "tenant")
    .map((item) => item.permissionCode));
  const candidates = [...new Set(evidence
    .filter((item) => item.effect === "allow" && !deniedCodes.has(item.permissionCode))
    .map((item) => item.permissionCode))].sort();
  const locked = new Set(requirements.filter((item) => !item.entitled).map((item) => item.permissionCode));
  const allowedCodes = candidates.filter((code) => !locked.has(code));
  const planLocked = candidates.filter((code) => locked.has(code));
  const denied = [...deniedCodes].sort();
  const entries: EffectivePermissionEntry[] = [
    ...allowedCodes.map((code) => ({ code, status: "allow" as const, reason: "allowed" as const })),
    ...denied.map((code) => ({ code, status: "deny" as const, reason: "denied_by_grant" as const })),
    ...planLocked.map((code) => ({ code, status: "not_in_plan" as const, reason: "plan_locked" as const })),
  ].sort((left, right) => left.code.localeCompare(right.code));
  const canonicalEvidence = [...evidence].sort(compareEvidence);
  const canonicalRequirements = [...requirements].sort((left, right) => left.permissionCode.localeCompare(right.permissionCode));
  const canonicalBindings = [...operationBindings].sort((left, right) => `${left.entityCode}\0${left.operationKey}`.localeCompare(`${right.entityCode}\0${right.operationKey}`));
  const profileHash = digest(JSON.stringify({ evidence: canonicalEvidence, requirements: canonicalRequirements, operationBindings: canonicalBindings }));
  return Object.freeze({
    planeKey: identity.planeKey,
    tenantId: identity.tenantId,
    principalId: identity.principalId,
    principalFingerprint: digest(identity.principalId),
    profileHash,
    schemaHash: digest("athyper.exact-plane-authorization.v2"),
    resolvedAt,
    allowed: Object.freeze(allowedCodes),
    denied: Object.freeze(denied),
    planLocked: Object.freeze(planLocked),
    planeExcluded: Object.freeze([]),
    entries: Object.freeze(entries),
    authorizationScopes: Object.freeze(scopes(allowedCodes, canonicalEvidence)),
    evidence: Object.freeze(canonicalEvidence),
    requirements: Object.freeze(canonicalRequirements),
    operationBindings: Object.freeze(canonicalBindings),
  });
}

function requirementFromRow(row: RequirementRow): EffectivePermissionRequirement {
  return Object.freeze({ permissionCode: row.permission_code, moduleId: row.module_id, riskTier: row.risk_tier, requiresMfa: row.requires_mfa, requiresSod: row.requires_sod, entitled: row.entitled });
}
function operationBindingFromRow(row: OperationBindingRow): EffectiveOperationBinding {
  return Object.freeze({ entityCode: row.entity_code, operationKey: row.operation_key, permissionCode: row.permission_code, decisionMode: row.decision_mode, requiredScopeKinds: Object.freeze(row.required_scope_kinds ?? []) });
}

function evidenceFromRow(row: EvidenceRow): EffectiveAuthorizationEvidence {
  return Object.freeze({
    permissionCode: row.permission_code,
    effect: row.effect,
    proof: row.proof,
    scopeTargetId: row.scope_target_id,
    scopeKind: row.scope_kind,
    targetId: row.target_id,
    propagationMode: row.propagation_mode,
    ...(row.resource_code ? { resourceCode: row.resource_code } : {}),
    ...(row.record_id ? { recordId: row.record_id } : {}),
    ...(row.effective_until ? { effectiveUntil: new Date(row.effective_until).toISOString() } : {}),
  });
}

function scopes(codes: readonly string[], evidence: readonly EffectiveAuthorizationEvidence[]): EffectiveAuthorizationScope[] {
  return codes.map((permissionCode) => {
    const rows = evidence.filter((item) => item.effect === "allow" && item.permissionCode === permissionCode && item.proof !== "record_acl");
    const values = (kind: string) => [...new Set(rows.filter((item) => item.scopeKind === kind).map((item) => item.targetId))].sort();
    const tenantWide = rows.some((item) => item.scopeKind === "tenant");
    return Object.freeze({
      permissionCode,
      tenantWide,
      legalEntityIds: Object.freeze(values("legal_entity")),
      companyCodeIds: Object.freeze(values("company_code")),
      operatingOrganizationIds: Object.freeze(values("operating_organization")),
      networkMembershipIds: Object.freeze([...values("network_account"), ...values("network_relationship")]),
      visibility: tenantWide ? "all" as const : "team" as const,
    });
  });
}

function compareEvidence(left: EffectiveAuthorizationEvidence, right: EffectiveAuthorizationEvidence): number {
  return [left.permissionCode,left.effect,left.proof,left.scopeKind,left.targetId,left.resourceCode ?? "",left.recordId ?? ""]
    .join("\0").localeCompare([right.permissionCode,right.effect,right.proof,right.scopeKind,right.targetId,right.resourceCode ?? "",right.recordId ?? ""].join("\0"));
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

/** Shared by permission snapshot construction and the database integration tests. */
export async function readEntitlementRequirements(transaction: AuthorizationTransaction, tenantId: string, evidenceCodes: readonly string[]): Promise<readonly RequirementRow[]> {
  if (!evidenceCodes.length) return [];
  return (await sql<RequirementRow>`
          SELECT permission.canonical_code AS permission_code,permission.module_id::text AS module_id,
                 permission.risk_tier::text AS risk_tier,permission.requires_mfa,permission.requires_sod,
                 EXISTS(
                   SELECT 1 FROM control.module m
                   WHERE m.id=permission.module_id AND m.status='active'
                     AND (control.effective_tenant_entitlement(${tenantId}::uuid,statement_timestamp())->'modules') ? m.code
                 ) AS entitled
          FROM authz.permission permission
          WHERE permission.status='published' AND permission.canonical_code = ANY(${sql.val(evidenceCodes)}::text[])
        `.execute(transaction)).rows;
}
