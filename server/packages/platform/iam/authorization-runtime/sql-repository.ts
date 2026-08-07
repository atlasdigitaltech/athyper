import { CompiledQuery, type Kysely, type Transaction } from "kysely";

import {
  CANONICAL_AUTHORIZATION_CONTRACT_VERSION,
  type AllowProof,
  type CanonicalAuthorizationRepository,
  type CanonicalDecisionRequest,
  type CanonicalPlane,
  type DecisionFacts,
  type DelegationAllowProof,
  type DenyProof,
  type ResolvedPermission,
  type ScopeConstraint,
  type ScopeDimension,
} from "../authorization-evaluator/index.js";

type AnyDb = Kysely<Record<string, never>>;
type AnyTransaction = Transaction<Record<string, never>>;

interface SqlRepositoryConfig {
  readonly authority: "neon_admin" | "mesh";
  readonly plane: CanonicalPlane;
  readonly databasePlane: "athyper" | "neon" | "mesh";
  readonly expectedDatabaseName?: string;
  readonly evaluatorRevision?: string;
}

interface PermissionRow {
  permission_id: string;
  canonical_code: string;
  entity_id: string | null;
  entity_operation_id: string | null;
  registered_non_entity: boolean;
  is_shareable: boolean;
  is_delegable: boolean;
  requires_mfa: boolean;
  requires_sod: boolean;
}

interface GateRow {
  identity_active: boolean;
  tenant_active: boolean;
  principal_active: boolean;
  plane_membership_id: string | null;
  plane_membership_effective_until: Date | string | null;
}

interface ScopeRow {
  proof_id: string;
  scope_id: string;
  scope_kind: string;
  target_id: string;
  scope_key: string;
  effective_until: Date | string | null;
}

interface GroupAllowRow extends ScopeRow {
  group_member_id: string;
  group_role_id: string;
  role_id: string;
}

interface DenyRow extends ScopeRow {
  subject_kind: "tenant" | "principal" | "group";
  group_membership_active: boolean;
}

interface AclRow {
  proof_id: string;
  record_id: string;
  effective_until: Date | string | null;
}

interface OverrideRow extends ScopeRow {
  expires_at: Date | string;
}

interface DelegationRow extends ScopeRow {
  delegation_id: string;
  delegator_id: string;
}

/**
 * DDL-native repository shared by all three physical planes. Database choice is
 * made by the caller; this class never reaches into another plane and never
 * falls back from Admin or Mesh to Neon.
 */
export class CanonicalSqlAuthorizationRepository
  implements CanonicalAuthorizationRepository {
  readonly authority: "neon_admin" | "mesh";
  readonly contractVersion = CANONICAL_AUTHORIZATION_CONTRACT_VERSION;

  constructor(
    private readonly db: AnyDb,
    private readonly config: SqlRepositoryConfig,
  ) {
    this.authority = config.authority;
  }

  async loadDecisionFacts(
    requests: readonly CanonicalDecisionRequest[],
  ): Promise<readonly DecisionFacts[]> {
    await this.assertRepositoryContract();
    return Promise.all(requests.map((request) => this.loadOne(request)));
  }

  private async loadOne(request: CanonicalDecisionRequest): Promise<DecisionFacts> {
    this.assertRequestBoundary(request);
    const tenantId = request.subject.tenantId
      ?? request.subject.tenantOrAccountId;
    return this.db.transaction().execute(async (trx) => {
      await this.query(trx, `
        SELECT
          set_config('app.current_tenant_id', $1, true),
          set_config('app.current_principal_id', $2, true),
          set_config('app.database_plane', $3, true)
      `, [tenantId, request.subject.principalId, this.config.databasePlane]);

      const permission = await this.resolvePermission(trx, request, tenantId);
      if (!permission) return this.unresolvedFacts(request);

      const gates = await this.loadGates(trx, tenantId, request.subject.principalId);
      const [groupAllows, denies, aclAllows, overrides, delegations] =
        await Promise.all([
          this.loadGroupAllows(trx, request, tenantId, permission),
          this.loadDenies(trx, request, tenantId, permission),
          this.loadAcls(trx, request, tenantId, permission),
          this.loadOverrides(trx, request, tenantId, permission),
          this.loadDelegations(trx, request, tenantId, permission),
        ]);
      const allowProofs: AllowProof[] = [
        ...groupAllows,
        ...delegations,
        ...aclAllows,
        ...overrides,
      ];
      const nextAuthorityChangeAt = earliestDate([
        asDate(gates.plane_membership_effective_until),
        ...denies.map((proof) => proof.nextAuthorityChangeAt),
        ...allowProofs.map((proof) => proof.nextAuthorityChangeAt),
      ]);
      const version = this.config.evaluatorRevision
        ? `${this.contractVersion}:${this.config.evaluatorRevision}`
        : this.contractVersion;

      return {
        requestId: request.requestId,
        permission: toResolvedPermission(permission),
        gates: {
          identityActive: gates.identity_active,
          principalActive: gates.tenant_active && gates.principal_active,
          planeMembershipActive: gates.plane_membership_id !== null,
          requestResolvedExactly: true,
          permissionPlaneEligible: true,
          hardPolicySatisfied: request.assurance?.hardPolicySatisfied !== false,
          mfaSatisfied: !permission.requires_mfa
            || request.assurance?.mfaSatisfied === true,
          sodSatisfied: !permission.requires_sod
            || request.assurance?.sodSatisfied === true,
        },
        entitlement: request.subject.plane === "admin"
          ? {
              available: true,
              evidenceId: `${this.config.databasePlane}:plane-local-catalog`,
              semantics: "admin_platform_managed",
            }
          : {
              available: false,
              evidenceId: `${this.config.databasePlane}:entitlement-projection-missing`,
              semantics: request.subject.plane === "mesh"
                ? "mesh_account_product"
                : "neon_plan_module_feature",
              reason: "canonical_entitlement_projection_missing",
            },
        denies,
        allowProofs,
        catalogVersion: version,
        policyVersion: version,
        ...(gates.plane_membership_id
          ? { planeMembershipEvidenceId: gates.plane_membership_id }
          : {}),
        ...(nextAuthorityChangeAt ? { nextAuthorityChangeAt } : {}),
      };
    });
  }

  private async resolvePermission(
    trx: AnyTransaction,
    request: CanonicalDecisionRequest,
    tenantId: string,
  ): Promise<PermissionRow | undefined> {
    if (request.mode === "registered_capability") {
      return (await this.query<PermissionRow>(trx, `
        SELECT p.id::text AS permission_id, p.canonical_code,
               NULL::text AS entity_id, NULL::text AS entity_operation_id,
               true AS registered_non_entity, p.is_shareable, p.is_delegable,
               p.requires_mfa, p.requires_sod
          FROM authz.permission p
         WHERE p.id = $1::uuid AND p.status = 'published'
         LIMIT 1
      `, [request.permissionId]))[0];
    }

    // Entity operation authoring is Athyper-local. Runtime planes must provide
    // an immutable projection before this exact coordinate can be evaluated.
    if (this.config.databasePlane !== "athyper") return undefined;
    return (await this.query<PermissionRow>(trx, `
      SELECT p.id::text AS permission_id, p.canonical_code,
             operation.entity_id::text AS entity_id,
             operation.id::text AS entity_operation_id,
             false AS registered_non_entity, p.is_shareable, p.is_delegable,
             (p.requires_mfa OR operation.requires_mfa) AS requires_mfa,
             p.requires_sod
        FROM metadata.entity_operation operation
        JOIN authz.permission p ON p.canonical_code = operation.permission_code
       WHERE operation.id = $1::uuid
         AND (operation.tenant_id IS NULL OR operation.tenant_id = $2::uuid)
         AND operation.status = 'active'
         AND p.status = 'published'
       LIMIT 1
    `, [request.entityOperationId, tenantId]))[0];
  }

  private async loadGates(
    trx: AnyTransaction,
    tenantId: string,
    principalId: string,
  ): Promise<GateRow> {
    return (await this.query<GateRow>(trx, `
      SELECT
        EXISTS (
          SELECT 1 FROM master.principal_identity_binding binding
           WHERE binding.tenant_id = $1::uuid
             AND binding.principal_id = $2::uuid
             AND binding.status = 'active'
        ) AS identity_active,
        EXISTS (
          SELECT 1 FROM master.tenant tenant
           WHERE tenant.id = $1::uuid AND tenant.status = 'active'
        ) AS tenant_active,
        EXISTS (
          SELECT 1 FROM master.principal principal
           WHERE principal.tenant_id = $1::uuid
             AND principal.id = $2::uuid
             AND principal.status = 'active'
        ) AS principal_active,
        membership.id::text AS plane_membership_id,
        membership.effective_until AS plane_membership_effective_until
      FROM master.tenant tenant
      LEFT JOIN authz.current_plane_membership membership
        ON membership.tenant_id = tenant.id
       AND membership.principal_id = $2::uuid
      WHERE tenant.id = $1::uuid
      LIMIT 1
    `, [tenantId, principalId]))[0] ?? {
      identity_active: false,
      tenant_active: false,
      principal_active: false,
      plane_membership_id: null,
      plane_membership_effective_until: null,
    };
  }

  private async loadGroupAllows(
    trx: AnyTransaction,
    request: CanonicalDecisionRequest,
    tenantId: string,
    permission: PermissionRow,
    principalId = request.subject.principalId,
  ): Promise<AllowProof[]> {
    const rows = await this.loadGroupRows(
      trx, tenantId, principalId, permission.permission_id,
    );
    return rows.map((row) => ({
      kind: "group_role",
      proofId: row.proof_id,
      permissionId: permission.permission_id,
      active: true,
      constraints: [this.scope(row, request)],
      groupActive: true,
      groupMembershipActive: true,
      roleAssignmentActive: true,
      ...(asDate(row.effective_until)
        ? { nextAuthorityChangeAt: asDate(row.effective_until)! }
        : {}),
    }));
  }

  private loadGroupRows(
    trx: AnyTransaction,
    tenantId: string,
    principalId: string,
    permissionId: string,
  ): Promise<GroupAllowRow[]> {
    return this.query<GroupAllowRow>(trx, `
      SELECT role_grant.id::text AS proof_id,
             member.id::text AS group_member_id,
             role_grant.id::text AS group_role_id,
             role_grant.role_id::text AS role_id,
             scope.id::text AS scope_id, scope.scope_kind::text,
             scope.target_id::text AS target_id, scope.scope_key,
             NULLIF(LEAST(
               COALESCE(member.effective_until, 'infinity'::timestamptz),
               COALESCE(role_grant.effective_until, 'infinity'::timestamptz)
             ), 'infinity'::timestamptz) AS effective_until
        FROM authz.current_group_member member
        JOIN authz.current_group_role role_grant
          ON role_grant.tenant_id = member.tenant_id
         AND role_grant.group_id = member.group_id
        JOIN authz.published_role_permission role_permission
          ON role_permission.tenant_id = role_grant.tenant_id
         AND role_permission.role_id = role_grant.role_id
         AND role_permission.permission_id = $3::uuid
        JOIN authz.scope_target scope
          ON scope.tenant_id = role_grant.tenant_id
         AND scope.id = role_grant.scope_target_id
         AND scope.status = 'active'
       WHERE member.tenant_id = $1::uuid
         AND member.principal_id = $2::uuid
    `, [tenantId, principalId, permissionId]);
  }

  private async loadDenies(
    trx: AnyTransaction,
    request: CanonicalDecisionRequest,
    tenantId: string,
    permission: PermissionRow,
  ): Promise<DenyProof[]> {
    const rows = await this.query<DenyRow>(trx, `
      SELECT deny.id::text AS proof_id, deny.subject_kind::text,
             scope.id::text AS scope_id, scope.scope_kind::text,
             scope.target_id::text AS target_id, scope.scope_key,
             deny.effective_until,
             CASE WHEN deny.subject_kind = 'group'
                  THEN member.id IS NOT NULL ELSE true END
               AS group_membership_active
        FROM authz.deny_rule deny
        JOIN authz.scope_target scope
          ON scope.tenant_id = deny.tenant_id
         AND scope.id = deny.scope_target_id
         AND scope.status = 'active'
        LEFT JOIN authz.current_group_member member
          ON deny.subject_kind = 'group'
         AND member.tenant_id = deny.tenant_id
         AND member.group_id = deny.group_id
         AND member.principal_id = $2::uuid
       WHERE deny.tenant_id = $1::uuid
         AND deny.permission_id = $3::uuid
         AND deny.status = 'active'
         AND deny.effective_from <= $4::timestamptz
         AND (deny.effective_until IS NULL OR deny.effective_until > $4::timestamptz)
         AND (
           deny.subject_kind = 'tenant'
           OR (deny.subject_kind = 'principal' AND deny.principal_id = $2::uuid)
           OR (deny.subject_kind = 'group' AND member.id IS NOT NULL)
         )
    `, [tenantId, request.subject.principalId, permission.permission_id,
      request.evaluatedAt]);
    return rows.map((row) => ({
      denyRuleId: row.proof_id,
      permissionId: permission.permission_id,
      subjectKind: row.subject_kind === "tenant"
        ? "hard_policy"
        : row.subject_kind,
      active: true,
      ...(row.subject_kind === "group"
        ? { groupMembershipActive: row.group_membership_active }
        : {}),
      scope: this.scope(row, request),
      ...(asDate(row.effective_until)
        ? { nextAuthorityChangeAt: asDate(row.effective_until)! }
        : {}),
    }));
  }

  private async loadAcls(
    trx: AnyTransaction,
    request: CanonicalDecisionRequest,
    tenantId: string,
    permission: PermissionRow,
  ): Promise<AllowProof[]> {
    if (!permission.is_shareable || request.mode === "registered_capability") {
      return [];
    }
    const rows = await this.query<AclRow>(trx, `
      SELECT acl.id::text AS proof_id, acl.record_id::text,
             acl.effective_until
        FROM authz.record_acl acl
        LEFT JOIN authz.current_group_member member
          ON acl.subject_kind = 'group'
         AND member.tenant_id = acl.tenant_id
         AND member.group_id = acl.group_id
         AND member.principal_id = $2::uuid
       WHERE acl.tenant_id = $1::uuid
         AND acl.permission_id = $3::uuid
         AND acl.resource_code = $4
         AND acl.status = 'active'
         AND acl.effective_from <= $5::timestamptz
         AND (acl.effective_until IS NULL OR acl.effective_until > $5::timestamptz)
         AND ((acl.subject_kind = 'principal' AND acl.principal_id = $2::uuid)
              OR (acl.subject_kind = 'group' AND member.id IS NOT NULL))
    `, [tenantId, request.subject.principalId, permission.permission_id,
      permission.canonical_code.split(".").slice(0, -1).join("."),
      request.evaluatedAt]);
    return rows.map((row) => ({
      kind: "record_acl",
      proofId: row.proof_id,
      recordAclId: row.proof_id,
      permissionId: permission.permission_id,
      active: true,
      constraints: [tenantScope(request, `acl:${row.proof_id}`)],
      permissionShareable: permission.is_shareable,
      entityId: permission.entity_id!,
      recordId: row.record_id,
      ...(asDate(row.effective_until)
        ? { nextAuthorityChangeAt: asDate(row.effective_until)! }
        : {}),
    }));
  }

  private async loadOverrides(
    trx: AnyTransaction,
    request: CanonicalDecisionRequest,
    tenantId: string,
    permission: PermissionRow,
  ): Promise<AllowProof[]> {
    const rows = await this.query<OverrideRow>(trx, `
      SELECT exceptional.id::text AS proof_id,
             scope.id::text AS scope_id, scope.scope_kind::text,
             scope.target_id::text AS target_id, scope.scope_key,
             exceptional.effective_until AS effective_until,
             exceptional.effective_until AS expires_at
        FROM authz.override exceptional
        JOIN authz.scope_target scope
          ON scope.tenant_id = exceptional.tenant_id
         AND scope.id = exceptional.scope_target_id
         AND scope.status = 'active'
       WHERE exceptional.tenant_id = $1::uuid
         AND exceptional.principal_id = $2::uuid
         AND exceptional.permission_id = $3::uuid
         AND exceptional.status = 'active'
         AND exceptional.effective_from <= $4::timestamptz
         AND exceptional.effective_until > $4::timestamptz
    `, [tenantId, request.subject.principalId, permission.permission_id,
      request.evaluatedAt]);
    return rows.map((row) => ({
      kind: "override",
      proofId: row.proof_id,
      overrideId: row.proof_id,
      permissionId: permission.permission_id,
      active: true,
      approved: true,
      expiresAt: asDate(row.expires_at)!,
      constraints: [this.scope(row, request)],
      nextAuthorityChangeAt: asDate(row.expires_at)!,
    }));
  }

  private async loadDelegations(
    trx: AnyTransaction,
    request: CanonicalDecisionRequest,
    tenantId: string,
    permission: PermissionRow,
  ): Promise<DelegationAllowProof[]> {
    if (!permission.is_delegable) return [];
    const rows = await this.query<DelegationRow>(trx, `
      SELECT grant_row.id::text AS proof_id,
             grant_row.delegation_id::text, grant_row.delegator_id::text,
             scope.id::text AS scope_id, scope.scope_kind::text,
             scope.target_id::text AS target_id, scope.scope_key,
             grant_row.effective_until
        FROM authz.current_delegation_grant grant_row
        JOIN authz.scope_target scope
          ON scope.tenant_id = grant_row.tenant_id
         AND scope.id = grant_row.scope_target_id
         AND scope.status = 'active'
       WHERE grant_row.tenant_id = $1::uuid
         AND grant_row.delegate_id = $2::uuid
         AND grant_row.permission_id = $3::uuid
    `, [tenantId, request.subject.principalId, permission.permission_id]);
    const proofs: DelegationAllowProof[] = [];
    for (const row of rows) {
      const ordinary = await this.loadGroupRows(
        trx, tenantId, row.delegator_id, permission.permission_id,
      );
      if (ordinary.length === 0) continue;
      const delegatedScope = this.scope(row, request);
      proofs.push({
        kind: "delegation",
        proofId: row.proof_id,
        delegationId: row.delegation_id,
        permissionId: permission.permission_id,
        active: true,
        constraints: [delegatedScope],
        permissionDelegable: true,
        delegatorOrdinaryProofIds: ordinary.map((proof) => proof.proof_id),
        upstreamAuthorityKinds: ordinary.map(() => "group_role" as const),
        delegatedScopes: [delegatedScope],
        delegatorOrdinaryScopes: ordinary.map((proof) =>
          this.scope(proof, request)
        ),
        ...(asDate(row.effective_until)
          ? { nextAuthorityChangeAt: asDate(row.effective_until)! }
          : {}),
      });
    }
    return proofs;
  }

  private scope(row: ScopeRow, request: CanonicalDecisionRequest): ScopeConstraint {
    if (row.scope_kind === "tenant") return tenantScope(request, row.scope_id);
    const knownDimensions: readonly ScopeDimension[] = [
      "workspace", "module", "company_code", "legal_entity",
      "operating_organization", "network_account", "network_relationship",
      "resource",
    ];
    const dimension = knownDimensions.includes(row.scope_kind as ScopeDimension)
      ? row.scope_kind as ScopeDimension
      : "resource";
    return {
      scopeId: row.scope_id,
      tenantOrAccountId: request.subject.tenantOrAccountId,
      tenantWide: false,
      dimensions: { [dimension]: [row.target_id] },
    };
  }

  private unresolvedFacts(request: CanonicalDecisionRequest): DecisionFacts {
    const permissionId = request.mode === "registered_capability"
      ? request.permissionId
      : request.entityOperationId;
    return {
      requestId: request.requestId,
      permission: {
        permissionId,
        canonicalCode: "unresolved.request",
        registeredNonEntity: request.mode === "registered_capability",
        shareable: false,
        delegable: false,
      },
      gates: {
        identityActive: false,
        principalActive: false,
        planeMembershipActive: false,
        requestResolvedExactly: false,
        permissionPlaneEligible: false,
        hardPolicySatisfied: false,
        mfaSatisfied: false,
        sodSatisfied: false,
      },
      entitlement: {
        available: false,
        evidenceId: `${request.subject.plane}:unresolved`,
        semantics: request.subject.plane === "mesh"
          ? "mesh_account_product"
          : request.subject.plane === "admin"
          ? "admin_platform_managed"
          : "neon_plan_module_feature",
        reason: "exact_request_unresolved",
      },
      denies: [],
      allowProofs: [],
      catalogVersion: "unresolved",
      policyVersion: "unresolved",
    };
  }

  private assertRequestBoundary(request: CanonicalDecisionRequest): void {
    if (request.subject.plane !== this.config.plane) {
      throw new Error(
        `authorization repository for ${this.config.plane} rejects ${request.subject.plane}`,
      );
    }
  }

  private async assertRepositoryContract(): Promise<void> {
    const row = (await this.query<{
      database_name: string;
      database_plane: string | null;
      master_present: boolean;
      authz_present: boolean;
    }>(this.db, `
      SELECT current_database() AS database_name,
             current_setting('app.database_plane', true) AS database_plane,
             to_regnamespace('master') IS NOT NULL AS master_present,
             to_regnamespace('authz') IS NOT NULL AS authz_present
    `, []))[0];
    if (!row || !row.master_present || !row.authz_present
      || (this.config.expectedDatabaseName
        && row.database_name !== this.config.expectedDatabaseName)
      || (row.database_plane && row.database_plane !== this.config.databasePlane)) {
      throw new Error(`${this.config.plane} authorization repository contract mismatch`);
    }
  }

  private async query<Row>(
    executor: AnyDb | AnyTransaction,
    text: string,
    parameters: readonly unknown[],
  ): Promise<Row[]> {
    const result = await executor.executeQuery<Row>(
      CompiledQuery.raw(text, [...parameters]),
    );
    return [...result.rows];
  }
}

export function createNeonSqlAuthorizationRepository(input: {
  readonly db: AnyDb;
  readonly plane: "neon" | "admin";
  readonly expectedDatabaseName?: string;
  readonly expectedEvaluatorRevision?: string;
  readonly requiredReleaseState?: "shadow" | "active";
}): CanonicalSqlAuthorizationRepository {
  if (!input.db) throw new Error(`${input.plane} database configuration is required`);
  return new CanonicalSqlAuthorizationRepository(input.db, {
    authority: "neon_admin",
    plane: input.plane,
    databasePlane: input.plane === "admin" ? "athyper" : "neon",
    ...(input.expectedDatabaseName
      ? { expectedDatabaseName: input.expectedDatabaseName }
      : {}),
    ...(input.expectedEvaluatorRevision
      ? { evaluatorRevision: input.expectedEvaluatorRevision }
      : {}),
  });
}

export function createMeshSqlAuthorizationRepository(input: {
  readonly meshDb: AnyDb;
  readonly expectedDatabaseName?: string;
  readonly expectedEvaluatorRevision?: string;
  readonly requiredReleaseState?: "shadow" | "active";
}): CanonicalSqlAuthorizationRepository {
  if (!input.meshDb) throw new Error("Mesh database configuration is required");
  return new CanonicalSqlAuthorizationRepository(input.meshDb, {
    authority: "mesh",
    plane: "mesh",
    databasePlane: "mesh",
    ...(input.expectedDatabaseName
      ? { expectedDatabaseName: input.expectedDatabaseName }
      : {}),
    ...(input.expectedEvaluatorRevision
      ? { evaluatorRevision: input.expectedEvaluatorRevision }
      : {}),
  });
}

function tenantScope(
  request: CanonicalDecisionRequest,
  scopeId: string,
): ScopeConstraint {
  return {
    scopeId,
    tenantOrAccountId: request.subject.tenantOrAccountId,
    tenantWide: true,
    dimensions: {},
  };
}

function toResolvedPermission(row: PermissionRow): ResolvedPermission {
  return {
    permissionId: row.permission_id,
    canonicalCode: row.canonical_code,
    ...(row.entity_id ? { entityId: row.entity_id } : {}),
    ...(row.entity_operation_id
      ? { entityOperationId: row.entity_operation_id }
      : {}),
    registeredNonEntity: row.registered_non_entity,
    shareable: row.is_shareable,
    delegable: row.is_delegable,
  };
}

function asDate(value: Date | string | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function earliestDate(values: readonly (Date | undefined)[]): Date | undefined {
  return values
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0];
}
