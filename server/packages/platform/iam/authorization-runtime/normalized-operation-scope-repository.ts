import { CompiledQuery, type Kysely } from "kysely";

import {
  CANONICAL_AUTHORIZATION_CONTRACT_VERSION,
  type AllowProof,
  type CanonicalAuthorizationRepository,
  type CanonicalDecisionRequest,
  type DecisionFacts,
  type DelegationAllowProof,
  type DenyProof,
  type EntitlementEvidence,
  type ResolvedPermission,
  type ScopeConstraint,
  type ScopeDimension,
} from "../authorization-evaluator/index.js";

type AnyDb = Kysely<Record<string, never>>;
type ConsumerPlane = "neon" | "mesh";

export interface NormalizedEntitlementResolver {
  resolve(input: {
    plane: ConsumerPlane;
    tenantId: string;
    principalId: string;
    permissionId: string;
    moduleId: string;
    evaluatedAt: Date;
  }): Promise<EntitlementEvidence & { nextAuthorityChangeAt?: Date }>;
}

export interface NormalizedOperationScopeRepositoryConfig {
  plane: ConsumerPlane;
  expectedDatabaseName: string;
  entitlementResolver: NormalizedEntitlementResolver;
}

interface EntitlementRow {
  available:boolean;
  evidence_id:string;
  reason_code:string|null;
  next_authority_change_at:Date|string|null;
}

/** Reuses each consumer plane's existing commercial entitlement authority;
 * normalized operation scope changes authorization structure, not licensing. */
export class SqlNormalizedEntitlementResolver implements NormalizedEntitlementResolver {
  constructor(private readonly db:AnyDb,private readonly plane:ConsumerPlane){}

  async resolve(input:Parameters<NormalizedEntitlementResolver["resolve"]>[0]) {
    if(input.plane!==this.plane)throw new Error("normalized entitlement resolver rejects a cross-plane request");
    const statement=this.plane==="neon"
      ? `SELECT available,evidence_id,reason_code,next_authority_change_at FROM master.resolve_neon_permission_entitlement($1::uuid,$2::uuid,$3::timestamptz)`
      : `SELECT available,evidence_id,reason_code,next_authority_change_at FROM mesh.resolve_account_permission_entitlement($1::uuid,$2::uuid,$3::timestamptz)`;
    const result=await this.db.executeQuery<EntitlementRow>(CompiledQuery.raw(statement,[input.tenantId,input.permissionId,input.evaluatedAt]));
    const row=result.rows[0];
    return {
      available:row?.available??false,
      evidenceId:row?.evidence_id??`${this.plane}:missing-entitlement`,
      semantics:this.plane==="mesh"?"mesh_account_product" as const:"neon_plan_module_feature" as const,
      ...(row?.reason_code?{reason:row.reason_code}:{}),
      ...(row?.next_authority_change_at?{nextAuthorityChangeAt:new Date(row.next_authority_change_at)}:{}),
    };
  }
}

interface BindingRow {
  permission_id: string;
  canonical_code: string;
  resource_code: string;
  module_id: string;
  entity_id: string;
  entity_operation_id: string;
  source_release_hash: string;
  source_compiled_hash: string;
  is_shareable: boolean;
  is_delegable: boolean;
  requires_mfa: boolean;
  requires_sod: boolean;
  scope_kind: string;
}

interface GateRow {
  identity_active: boolean;
  tenant_active: boolean;
  principal_active: boolean;
  membership_id: string | null;
  membership_until: Date | string | null;
}

interface ScopeRow {
  proof_id: string;
  group_id?: string;
  role_id?: string;
  delegation_id?: string;
  delegator_id?: string;
  scope_id: string;
  scope_kind: string;
  target_id: string;
  effective_until: Date | string | null;
}

interface DenyRow extends ScopeRow {
  subject_kind: "tenant" | "principal" | "group";
}

interface AclRow {
  proof_id: string;
  record_id: string;
  effective_until: Date | string | null;
}

interface OverrideRow extends ScopeRow {
  expires_at: Date | string;
}

/**
 * Candidate-only repository for the normalized plane-local authz model.
 * It is intentionally not selected by any default runtime factory. Missing,
 * ambiguous, or unsupported artifact coordinates produce request_not_exact.
 */
export class NormalizedOperationScopeAuthorizationRepository
  implements CanonicalAuthorizationRepository {
  readonly authority: "neon_admin" | "mesh";
  readonly contractVersion = CANONICAL_AUTHORIZATION_CONTRACT_VERSION;

  constructor(
    private readonly db: AnyDb,
    private readonly config: NormalizedOperationScopeRepositoryConfig,
  ) {
    this.authority = config.plane === "mesh" ? "mesh" : "neon_admin";
  }

  async loadDecisionFacts(
    requests: readonly CanonicalDecisionRequest[],
  ): Promise<readonly DecisionFacts[]> {
    await this.assertBoundary(requests);
    return Promise.all(requests.map((request) => this.loadOne(request)));
  }

  private async loadOne(request: CanonicalDecisionRequest): Promise<DecisionFacts> {
    if (request.mode === "registered_capability") return unresolvedFacts(request);
    const bindings = await this.loadBindings(request);
    if (!isOneExactBindingSet(bindings)) return unresolvedFacts(request);

    const first = bindings[0]!;
    if (request.mode === "entity_resource"
        && request.resource.entityId !== first.entity_id) {
      return unresolvedFacts(request);
    }
    const permission = toPermission(first);
    const requiredScopes = new Set(bindings.map((row) => row.scope_kind));
    const [gates, entitlement, groupAllows, denies, aclAllows, overrides] = await Promise.all([
      this.loadGates(request),
      this.config.entitlementResolver.resolve({
        plane: this.config.plane,
        tenantId: request.subject.tenantOrAccountId,
        principalId: request.subject.principalId,
        permissionId: permission.permissionId,
        moduleId: first.module_id,
        evaluatedAt: request.evaluatedAt,
      }),
      this.loadGroupAllows(request, permission, requiredScopes),
      this.loadDenies(request, permission),
      this.loadAclAllows(request, permission, first.resource_code),
      this.loadOverrides(request, permission),
    ]);
    const delegations = await this.loadDelegations(request, permission, requiredScopes);
    const allowProofs: AllowProof[] = [...groupAllows, ...delegations, ...aclAllows, ...overrides];
    const nextAuthorityChangeAt = earliest([
      asDate(gates.membership_until),
      entitlement.nextAuthorityChangeAt,
      ...denies.map((proof) => proof.nextAuthorityChangeAt),
      ...allowProofs.map((proof) => proof.nextAuthorityChangeAt),
    ]);

    return {
      requestId: request.requestId,
      permission,
      gates: {
        identityActive: gates.identity_active,
        principalActive: gates.tenant_active && gates.principal_active,
        planeMembershipActive: gates.membership_id !== null,
        requestResolvedExactly: true,
        permissionPlaneEligible: request.subject.plane === this.config.plane,
        hardPolicySatisfied: request.assurance?.hardPolicySatisfied !== false,
        mfaSatisfied: !first.requires_mfa || request.assurance?.mfaSatisfied === true,
        sodSatisfied: !first.requires_sod || request.assurance?.sodSatisfied === true,
      },
      entitlement,
      denies,
      allowProofs,
      catalogVersion: `normalized:${first.source_compiled_hash}`,
      policyVersion: `release:${first.source_release_hash}`,
      ...(gates.membership_id ? { planeMembershipEvidenceId: gates.membership_id } : {}),
      ...(nextAuthorityChangeAt ? { nextAuthorityChangeAt } : {}),
    };
  }

  private async assertBoundary(requests: readonly CanonicalDecisionRequest[]): Promise<void> {
    if (requests.some((request) => request.subject.plane !== this.config.plane)) {
      throw new Error("normalized_authz.plane_mismatch");
    }
    const database = await this.query<{ database_name: string }>("SELECT current_database() AS database_name", []);
    if (database[0]?.database_name !== this.config.expectedDatabaseName) {
      throw new Error("normalized_authz.database_mismatch");
    }
  }

  private loadBindings(request: Exclude<CanonicalDecisionRequest, { mode: "registered_capability" }>): Promise<BindingRow[]> {
    return this.query<BindingRow>(`
      SELECT b.permission_id::text,p.canonical_code,p.resource_code,p.module_id::text,
             b.source_entity_id::text AS entity_id,b.source_entity_operation_id::text AS entity_operation_id,
             b.source_release_hash,b.source_compiled_hash,p.is_shareable,p.is_delegable,
             p.requires_mfa,p.requires_sod,b.scope_kind::text
        FROM authz.entity_operation_scope_binding b
        JOIN authz.permission p ON p.id=b.permission_id
        JOIN authz.permission_scope_policy policy
          ON policy.permission_id=p.id AND policy.scope_kind=b.scope_kind
       WHERE (b.tenant_id IS NULL OR b.tenant_id=$1::uuid)
         AND NOT (b.tenant_id IS NULL AND EXISTS (
           SELECT 1 FROM authz.entity_operation_scope_binding tenant_binding
            WHERE tenant_binding.tenant_id=$1::uuid
              AND tenant_binding.plane_code=b.plane_code
              AND tenant_binding.source_entity_operation_id=b.source_entity_operation_id
              AND tenant_binding.scope_kind=b.scope_kind
              AND tenant_binding.decision_mode=b.decision_mode
              AND tenant_binding.status='published'
              AND tenant_binding.effective_from <= $5::timestamptz
              AND (tenant_binding.effective_until IS NULL OR tenant_binding.effective_until > $5::timestamptz)
         ))
         AND b.plane_code=$2 AND b.source_entity_operation_id=$3::uuid
         AND b.decision_mode=$4 AND b.status='published'
         AND b.effective_from <= $5::timestamptz
         AND (b.effective_until IS NULL OR b.effective_until > $5::timestamptz)
         AND p.permission_kind='entity_operation' AND p.status='published'
       ORDER BY b.scope_kind
    `, [request.subject.tenantOrAccountId, this.config.plane, request.entityOperationId, request.mode, request.evaluatedAt]);
  }

  private async loadGates(request: CanonicalDecisionRequest): Promise<GateRow> {
    const rows = await this.query<GateRow>(`
      SELECT
        EXISTS (SELECT 1 FROM master.principal_identity_binding i
                 WHERE i.tenant_id=$1::uuid AND i.principal_id=$2::uuid
                   AND i.status='active' AND i.sync_status='synced') AS identity_active,
        EXISTS (SELECT 1 FROM master.tenant t WHERE t.id=$1::uuid AND t.status='active') AS tenant_active,
        EXISTS (SELECT 1 FROM master.principal p
                 WHERE p.tenant_id=$1::uuid AND p.id=$2::uuid AND p.status='active') AS principal_active,
        membership.id::text AS membership_id,membership.effective_until AS membership_until
      FROM (SELECT 1) seed
      LEFT JOIN authz.plane_membership membership
        ON membership.tenant_id=$1::uuid AND membership.principal_id=$2::uuid
       AND membership.status='active' AND membership.effective_from <= $3::timestamptz
       AND (membership.effective_until IS NULL OR membership.effective_until > $3::timestamptz)
      LIMIT 1
    `, [request.subject.tenantOrAccountId, request.subject.principalId, request.evaluatedAt]);
    return rows[0] ?? {
      identity_active: false, tenant_active: false, principal_active: false,
      membership_id: null, membership_until: null,
    };
  }

  private async loadGroupAllows(
    request: CanonicalDecisionRequest,
    permission: ResolvedPermission,
    requiredScopes: ReadonlySet<string>,
    principalId = request.subject.principalId,
  ): Promise<AllowProof[]> {
    const rows = await this.loadGroupRows(request, permission.permissionId, principalId);
    const grouped = groupRows(rows, (row) => `${row.group_id}:${row.role_id}`);
    return [...grouped.entries()].flatMap(([proofId, proofRows]) => {
      if (![...requiredScopes].every((kind) => proofRows.some((row) => row.scope_kind === kind))) return [];
      const until = earliest(proofRows.map((row) => asDate(row.effective_until)));
      return [{
        kind: "group_role" as const,
        proofId,
        permissionId: permission.permissionId,
        active: true,
        constraints: proofRows.map((row) => toScope(row, request)),
        groupActive: true,
        groupMembershipActive: true,
        roleAssignmentActive: true,
        ...(until ? { nextAuthorityChangeAt: until } : {}),
      }];
    });
  }

  private loadGroupRows(request: CanonicalDecisionRequest, permissionId: string, principalId: string): Promise<ScopeRow[]> {
    return this.query<ScopeRow>(`
      SELECT gr.id::text AS proof_id,gr.group_id::text,gr.role_id::text,
             scope.id::text AS scope_id,scope.scope_kind::text,scope.target_id::text,
             NULLIF(LEAST(COALESCE(gm.effective_until,'infinity'),COALESCE(gr.effective_until,'infinity')),'infinity') AS effective_until
        FROM authz.group_member gm
        JOIN authz.principal_group g ON g.tenant_id=gm.tenant_id AND g.id=gm.group_id AND g.status='active'
        JOIN authz.group_role gr ON gr.tenant_id=gm.tenant_id AND gr.group_id=gm.group_id
        JOIN authz.role r ON r.tenant_id=gr.tenant_id AND r.id=gr.role_id AND r.status='active'
        JOIN authz.role_permission rp ON rp.tenant_id=r.tenant_id AND rp.role_id=r.id AND rp.permission_id=$4::uuid
        JOIN authz.scope_target scope ON scope.tenant_id=gr.tenant_id AND scope.id=gr.scope_target_id AND scope.status='active'
       WHERE gm.tenant_id=$1::uuid AND gm.principal_id=$2::uuid
         AND gm.status='active' AND gm.effective_from <= $3::timestamptz
         AND (gm.effective_until IS NULL OR gm.effective_until > $3::timestamptz)
         AND gr.status='active' AND gr.effective_from <= $3::timestamptz
         AND (gr.effective_until IS NULL OR gr.effective_until > $3::timestamptz)
    `, [request.subject.tenantOrAccountId, principalId, request.evaluatedAt, permissionId]);
  }

  private async loadDenies(request: CanonicalDecisionRequest, permission: ResolvedPermission): Promise<DenyProof[]> {
    const rows = await this.query<DenyRow>(`
      SELECT deny.id::text AS proof_id,deny.subject_kind::text,scope.id::text AS scope_id,
             scope.scope_kind::text,scope.target_id::text,deny.effective_until
        FROM authz.deny_rule deny
        JOIN authz.scope_target scope ON scope.tenant_id=deny.tenant_id AND scope.id=deny.scope_target_id AND scope.status='active'
        LEFT JOIN authz.group_member gm ON deny.subject_kind='group' AND gm.tenant_id=deny.tenant_id
          AND gm.group_id=deny.group_id AND gm.principal_id=$2::uuid AND gm.status='active'
          AND gm.effective_from <= $4::timestamptz AND (gm.effective_until IS NULL OR gm.effective_until > $4::timestamptz)
       WHERE deny.tenant_id=$1::uuid AND deny.permission_id=$3::uuid
         AND deny.status='active' AND deny.effective_from <= $4::timestamptz
         AND (deny.effective_until IS NULL OR deny.effective_until > $4::timestamptz)
         AND (deny.subject_kind='tenant'
           OR (deny.subject_kind='principal' AND deny.principal_id=$2::uuid)
           OR (deny.subject_kind='group' AND gm.id IS NOT NULL))
    `, [request.subject.tenantOrAccountId, request.subject.principalId, permission.permissionId, request.evaluatedAt]);
    return rows.map((row) => ({
      denyRuleId: row.proof_id,
      permissionId: permission.permissionId,
      subjectKind: row.subject_kind === "tenant" ? "hard_policy" : row.subject_kind,
      active: true,
      ...(row.subject_kind === "group" ? { groupMembershipActive: true } : {}),
      scope: toScope(row, request),
      ...(asDate(row.effective_until) ? { nextAuthorityChangeAt: asDate(row.effective_until)! } : {}),
    }));
  }

  private async loadAclAllows(request: CanonicalDecisionRequest, permission: ResolvedPermission, resourceCode: string): Promise<AllowProof[]> {
    if (!permission.shareable || request.mode !== "entity_resource") return [];
    const rows = await this.query<AclRow>(`
      SELECT acl.id::text AS proof_id,acl.record_id::text,acl.effective_until
        FROM authz.record_acl acl
        LEFT JOIN authz.group_member gm ON acl.subject_kind='group' AND gm.tenant_id=acl.tenant_id
          AND gm.group_id=acl.group_id AND gm.principal_id=$2::uuid AND gm.status='active'
          AND gm.effective_from <= $5::timestamptz AND (gm.effective_until IS NULL OR gm.effective_until > $5::timestamptz)
       WHERE acl.tenant_id=$1::uuid AND acl.permission_id=$3::uuid AND acl.resource_code=$4
         AND acl.status='active' AND acl.effective_from <= $5::timestamptz
         AND (acl.effective_until IS NULL OR acl.effective_until > $5::timestamptz)
         AND ((acl.subject_kind='principal' AND acl.principal_id=$2::uuid)
           OR (acl.subject_kind='group' AND gm.id IS NOT NULL))
    `, [request.subject.tenantOrAccountId, request.subject.principalId, permission.permissionId, resourceCode, request.evaluatedAt]);
    return rows.map((row) => ({
      kind: "record_acl", proofId: row.proof_id, recordAclId: row.proof_id,
      permissionId: permission.permissionId, active: true,
      constraints: [tenantScope(request, `acl:${row.proof_id}`)],
      permissionShareable: true, entityId: permission.entityId!, recordId: row.record_id,
      ...(asDate(row.effective_until) ? { nextAuthorityChangeAt: asDate(row.effective_until)! } : {}),
    }));
  }

  private async loadOverrides(request: CanonicalDecisionRequest, permission: ResolvedPermission): Promise<AllowProof[]> {
    const rows = await this.query<OverrideRow>(`
      SELECT o.id::text AS proof_id,scope.id::text AS scope_id,scope.scope_kind::text,
             scope.target_id::text,o.effective_until AS expires_at,o.effective_until
        FROM authz.override o JOIN authz.scope_target scope
          ON scope.tenant_id=o.tenant_id AND scope.id=o.scope_target_id AND scope.status='active'
       WHERE o.tenant_id=$1::uuid AND o.principal_id=$2::uuid AND o.permission_id=$3::uuid
         AND o.status='active' AND o.effective_from <= $4::timestamptz AND o.effective_until > $4::timestamptz
    `, [request.subject.tenantOrAccountId, request.subject.principalId, permission.permissionId, request.evaluatedAt]);
    return rows.map((row) => ({
      kind: "override", proofId: row.proof_id, overrideId: row.proof_id,
      permissionId: permission.permissionId, active: true, approved: true,
      expiresAt: asDate(row.expires_at)!, constraints: [toScope(row, request)],
      nextAuthorityChangeAt: asDate(row.expires_at)!,
    }));
  }

  private async loadDelegations(
    request: CanonicalDecisionRequest,
    permission: ResolvedPermission,
    requiredScopes: ReadonlySet<string>,
  ): Promise<DelegationAllowProof[]> {
    if (!permission.delegable) return [];
    const rows = await this.query<ScopeRow>(`
      SELECT d.id::text AS proof_id,d.id::text AS delegation_id,d.delegator_id::text,
             scope.id::text AS scope_id,scope.scope_kind::text,scope.target_id::text,d.effective_until
        FROM authz.delegation d JOIN authz.delegation_grant grant_row
          ON grant_row.tenant_id=d.tenant_id AND grant_row.delegation_id=d.id AND grant_row.permission_id=$3::uuid
        JOIN authz.scope_target scope ON scope.tenant_id=grant_row.tenant_id
          AND scope.id=grant_row.scope_target_id AND scope.status='active'
        JOIN authz.plane_membership delegator_membership ON delegator_membership.tenant_id=d.tenant_id
          AND delegator_membership.principal_id=d.delegator_id AND delegator_membership.status='active'
          AND delegator_membership.effective_from <= $4::timestamptz
          AND (delegator_membership.effective_until IS NULL OR delegator_membership.effective_until > $4::timestamptz)
       WHERE d.tenant_id=$1::uuid AND d.delegate_id=$2::uuid AND d.status='active'
         AND d.effective_from <= $4::timestamptz AND d.effective_until > $4::timestamptz
    `, [request.subject.tenantOrAccountId, request.subject.principalId, permission.permissionId, request.evaluatedAt]);
    const grouped = groupRows(rows, (row) => row.delegation_id!);
    const proofs: DelegationAllowProof[] = [];
    for (const [delegationId, delegated] of grouped) {
      if (![...requiredScopes].every((kind) => delegated.some((row) => row.scope_kind === kind))) continue;
      const ordinaryRows = await this.loadGroupRows(request, permission.permissionId, delegated[0]!.delegator_id!);
      const ordinary = groupRows(ordinaryRows, (row) => `${row.group_id}:${row.role_id}`);
      const completeOrdinary = [...ordinary.entries()].filter(([, proofRows]) =>
        [...requiredScopes].every((kind) => proofRows.some((row) => row.scope_kind === kind)));
      if (completeOrdinary.length === 0) continue;
      const ordinaryRowsComplete = completeOrdinary.flatMap(([, proofRows]) => proofRows);
      proofs.push({
        kind: "delegation", proofId: delegationId, delegationId,
        permissionId: permission.permissionId, active: true,
        constraints: delegated.map((row) => toScope(row, request)),
        permissionDelegable: true,
        delegatorOrdinaryProofIds: completeOrdinary.map(([id]) => id),
        upstreamAuthorityKinds: completeOrdinary.map(() => "group_role"),
        delegatedScopes: delegated.map((row) => toScope(row, request)),
        delegatorOrdinaryScopes: ordinaryRowsComplete.map((row) => toScope(row, request)),
        ...(earliest(delegated.map((row) => asDate(row.effective_until)))
          ? { nextAuthorityChangeAt: earliest(delegated.map((row) => asDate(row.effective_until)))! } : {}),
      });
    }
    return proofs;
  }

  private async query<T>(sql: string, parameters: readonly unknown[]): Promise<T[]> {
    const result = await this.db.executeQuery<T>(CompiledQuery.raw(sql, [...parameters]));
    return [...result.rows];
  }
}

function isOneExactBindingSet(rows: readonly BindingRow[]): boolean {
  if (rows.length === 0) return false;
  const first = rows[0]!;
  return new Set(rows.map((row) => row.scope_kind)).size === rows.length
    && rows.every((row) => row.permission_id === first.permission_id
      && row.entity_id === first.entity_id
      && row.entity_operation_id === first.entity_operation_id
      && row.source_release_hash === first.source_release_hash
      && row.source_compiled_hash === first.source_compiled_hash);
}

function toPermission(row: BindingRow): ResolvedPermission {
  return {
    permissionId: row.permission_id, canonicalCode: row.canonical_code,
    entityId: row.entity_id, entityOperationId: row.entity_operation_id,
    registeredNonEntity: false, shareable: row.is_shareable, delegable: row.is_delegable,
  };
}

function toScope(row: Pick<ScopeRow, "scope_id" | "scope_kind" | "target_id">, request: CanonicalDecisionRequest): ScopeConstraint {
  if (row.scope_kind === "tenant") return tenantScope(request, row.scope_id);
  return {
    scopeId: row.scope_id,
    tenantOrAccountId: request.subject.tenantOrAccountId,
    tenantWide: false,
    dimensions: { [row.scope_kind as ScopeDimension]: [row.target_id] },
  };
}

function tenantScope(request: CanonicalDecisionRequest, scopeId: string): ScopeConstraint {
  return { scopeId, tenantOrAccountId: request.subject.tenantOrAccountId, tenantWide: true, dimensions: {} };
}

function unresolvedFacts(request: CanonicalDecisionRequest): DecisionFacts {
  const permissionId = request.mode === "registered_capability" ? request.permissionId : request.entityOperationId;
  return {
    requestId: request.requestId,
    permission: { permissionId, canonicalCode: "unresolved.request", registeredNonEntity: request.mode === "registered_capability", shareable: false, delegable: false },
    gates: { identityActive: false, principalActive: false, planeMembershipActive: false, requestResolvedExactly: false, permissionPlaneEligible: false, hardPolicySatisfied: false, mfaSatisfied: false, sodSatisfied: false },
    entitlement: { available: false, evidenceId: `${request.subject.plane}:unresolved`, semantics: request.subject.plane === "mesh" ? "mesh_account_product" : "neon_plan_module_feature", reason: "request_not_exact" },
    denies: [], allowProofs: [], catalogVersion: "normalized:unresolved", policyVersion: "normalized:unresolved",
  };
}

function groupRows<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

function asDate(value: Date | string | null | undefined): Date | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
}

function earliest(values: readonly (Date | undefined)[]): Date | undefined {
  const present = values.filter((value): value is Date => value !== undefined);
  return present.length ? new Date(Math.min(...present.map((value) => value.getTime()))) : undefined;
}
