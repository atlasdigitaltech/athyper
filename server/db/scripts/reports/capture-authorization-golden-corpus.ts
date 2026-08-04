#!/usr/bin/env tsx
/**
 * Read-only Wave 0 authorization baseline exporter.
 *
 * The exporter deliberately preserves the current single, batch, and Admin
 * evaluator semantics separately. It does not call service methods that write
 * decision logs and it never mutates source authority.
 *
 * Environment corpus files contain stable principal UUIDs and belong in a
 * restricted evidence store, not source control.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Plane = "neon" | "admin" | "mesh";
type LegacyEngine =
  | "legacy_single"
  | "legacy_batch"
  | "legacy_admin"
  | "legacy_mesh";

interface ExternalIdentitySubject {
  subjectKeySha256: string;
  realmKey: string;
  providerCode: string;
  subjectSha256: string;
  subjectType: "user" | "service_account" | "integration_user";
  enabled: true;
  expectedPlanes: Plane[];
}

interface ExternalIdentityEvidence {
  schemaVersion: 1;
  evidenceId: string;
  generatedAt: string;
  source: {
    authoritySystem: string;
    sourceInstanceIdSha256: string;
    snapshotId: string;
    snapshotSha256: string;
    subjectSelection: "enabled_only";
  };
  subjects: ExternalIdentitySubject[];
  hashes: {
    subjectsSha256: string;
  };
}

interface SupplementalDecisionPrincipal {
  principalId: string;
  principalClass: "active_inventory" | "certification_fixture";
}

interface SupplementalDecisionAction {
  operationId: string;
  permissionId: string;
  permissionCode: string;
  riskLevel: "high" | "critical";
}

interface SupplementalDecisionCase {
  caseId: string;
  plane: Plane;
  authorityScopeId: string;
  membershipId: string;
  principalId: string;
  operationId: string;
  permissionId: string;
  permissionCode: string;
  contextClass: string;
  resourceType: string | null;
  resourceIdSha256: string | null;
  resourceSentinel: string | null;
  engine: LegacyEngine;
  decision: string;
  decisionEvidenceSha256: string;
}

interface SupplementalDecisionDisagreement {
  caseId: string;
  comparison: string;
  left: string;
  right: string;
  classification: string | null;
  approval: string;
}

interface SupplementalDecisionEvidence {
  schemaVersion: 1;
  evidenceId: string;
  generatedAt: string;
  repositoryRevision: string;
  governanceCatalogSha256: string;
  source: {
    plane: Plane;
    sourceDatabaseId: string;
    captureWatermark: string;
    actionSelection: "all_active_high_critical";
    principalSelection: "all_active_plus_certification_fixtures";
    decisionCatalogSha256: string;
    evaluatorId: string;
    evaluatorRevision: string;
  };
  principals: SupplementalDecisionPrincipal[];
  actions: SupplementalDecisionAction[];
  cases: SupplementalDecisionCase[];
  engineDisagreements: SupplementalDecisionDisagreement[];
  hashes: {
    principalsSha256: string;
    actionsSha256: string;
    casesSha256: string;
    engineDisagreementsSha256: string;
  };
}

interface PrincipalRow {
  id: string;
  tenant_id: string;
  principal_type: string;
  status: string;
  is_locked: boolean;
  is_service_account: boolean;
  auth_epoch: number;
  bindings: Array<{
    id: string;
    realmKey: string;
    providerCode: string;
    subjectId: string;
    issuer: string | null;
    audience: string | null;
    clientId: string | null;
    idpEnabled: boolean;
    syncStatus: string;
  }>;
}

interface ActionRow {
  id: string;
  code: string;
  risk_level: "high" | "critical";
  scope_type: string;
  is_plan_restricted: boolean;
  plane_eligibility: string[];
  operations: Array<{
    id: string;
    tenantId: string | null;
    entityName: string;
    surface: string;
    handlerType: string;
    handlerTarget: string | null;
    executionTarget: string | null;
    recordRequired: boolean;
  }>;
}

interface DecisionRow {
  tenant_id: string;
  principal_id: string;
  permission_id: string;
  permission_code: string;
  risk_level: "high" | "critical";
  plane_eligibility: string[];
  persona_id: string | null;
  legacy_single: string;
  legacy_batch: string;
  legacy_admin: string | null;
}

interface MeshPrincipalRow {
  id: string;
  principal_type: string;
  status: string;
  bindings: Array<{
    id: string;
    realmKey: string;
    providerCode: string;
    subjectId: string;
    syncStatus: string;
  }>;
  account_grants: Array<{
    id: string;
    accountId: string;
    roleCode: string;
    status: string;
  }>;
}

if (process.argv.includes("--help")) {
  process.stdout.write(
    "Usage: capture-authorization-golden-corpus.ts "
      + "[--output=PATH] [--catalog=PATH] "
      + "[--identity-evidence=PATH] "
      + "[--supplemental-decision-evidence=PATH ...] [--strict]\n"
      + "Requires DATABASE_URL; set MESH_DATABASE_URL to capture the separate "
      + "Mesh identity boundary. External identity evidence must conform to "
      + "config/governance/authorization-external-identity-evidence.schema.json; "
      + "supplemental evaluator evidence must conform to "
      + "config/governance/authorization-supplemental-decision-evidence.schema.json.\n",
  );
  process.exit(0);
}

const neonUrl = process.env.DATABASE_URL?.trim();
if (!neonUrl) throw new Error("DATABASE_URL is required.");
const meshUrl = process.env.MESH_DATABASE_URL?.trim();
const strict = process.argv.includes("--strict");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const outputArgument = valueArgument("--output=");
const outputPath = outputArgument
  ? resolve(outputArgument)
  : resolve(repositoryRoot, "artifacts/authorization-wave0/golden-decision-corpus.json");
const catalogArgument = valueArgument("--catalog=");
const catalogPath = catalogArgument
  ? resolve(catalogArgument)
  : resolve(
      repositoryRoot,
      "config/governance/authorization-high-risk-action-catalog.v1.json",
    );
const catalogRepositoryPath = repositoryRelativePath(catalogPath);
const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as Json;
const requiredLegacyEngines = readRequiredLegacyEngines(catalog);
const requiredContextClasses = readRequiredContextClasses(catalog);
const identityEvidenceArgument = valueArgument("--identity-evidence=");
const identityEvidence = identityEvidenceArgument
  ? normalizeExternalIdentityEvidence(
      JSON.parse(
        await readFile(resolve(identityEvidenceArgument), "utf8"),
      ) as unknown,
    )
  : null;
const repositoryRevision = gitRevision();
const repositoryStateClean = gitWorkingTreeClean();
const catalogSha256 = hashCanonical(catalog);
const supplementalDecisionEvidence = await Promise.all(
  valueArguments("--supplemental-decision-evidence=").map(async (path) =>
    normalizeSupplementalDecisionEvidence(
      JSON.parse(await readFile(resolve(path), "utf8")) as unknown,
      {
        repositoryRevision,
        governanceCatalogSha256: catalogSha256,
      },
    )
  ),
);
assertUniqueSupplementalEvidence(supplementalDecisionEvidence);

const neon = new pg.Client({ connectionString: neonUrl });
const mesh = meshUrl ? new pg.Client({ connectionString: meshUrl }) : null;
await neon.connect();
if (mesh) await mesh.connect();

try {
  await neon.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  if (mesh) {
    await mesh.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  }

  const neonBoundary = await captureBoundary(neon, "neon");
  const principals = (await neon.query<PrincipalRow>(`
    SELECT
      principal.id::text,
      principal.tenant_id::text,
      principal.principal_type,
      principal.status::text,
      principal.is_locked,
      principal.is_service_account,
      principal.auth_epoch,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', binding.id::text,
            'realmKey', binding.realm_key,
            'providerCode', binding.provider_code,
            'subjectId', binding.subject_id,
            'issuer', binding.issuer,
            'audience', binding.audience,
            'clientId', binding.client_id,
            'idpEnabled', binding.idp_enabled,
            'syncStatus', binding.sync_status
          )
          ORDER BY binding.realm_key, binding.provider_code, binding.subject_id
        ) FILTER (WHERE binding.id IS NOT NULL),
        '[]'::jsonb
      ) AS bindings
    FROM master.principal principal
    LEFT JOIN master.principal_identity_binding binding
      ON binding.tenant_id = principal.tenant_id
     AND binding.principal_id = principal.id
     AND binding.idp_enabled = true
     AND binding.sync_status = 'synced'
    WHERE principal.status = 'active'
    GROUP BY principal.id
    ORDER BY principal.tenant_id, principal.id
  `)).rows.map(redactPrincipal);

  const actions = (await neon.query<ActionRow>(`
    SELECT
      permission.id::text,
      permission.code,
      permission.risk_level,
      permission.scope_type,
      permission.is_plan_restricted,
      permission.plane_eligibility,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', operation.id::text,
            'tenantId', operation.tenant_id::text,
            'entityName', operation.entity_name,
            'surface', operation.surface,
            'handlerType', operation.handler_type,
            'handlerTarget', operation.handler_target,
            'executionTarget', operation.execution_target,
            'recordRequired', operation.is_record_required
          )
          ORDER BY operation.tenant_id NULLS FIRST, operation.entity_name, operation.id
        ) FILTER (WHERE operation.id IS NOT NULL),
        '[]'::jsonb
      ) AS operations
    FROM shared.permission permission
    LEFT JOIN control.entity_operation operation
      ON operation.permission_code = permission.code
     AND operation.is_enabled = true
    WHERE permission.status = 'active'
      AND permission.risk_level IN ('high', 'critical')
    GROUP BY permission.id
    ORDER BY permission.code
  `)).rows;

  const decisions = (await neon.query<DecisionRow>(`
    WITH active_principal AS (
      SELECT
        principal.id,
        principal.tenant_id,
        persona.persona_id
      FROM master.principal principal
      LEFT JOIN master.principal_persona persona
        ON persona.tenant_id = principal.tenant_id
       AND persona.principal_id = principal.id
       AND (persona.expires_at IS NULL OR persona.expires_at > statement_timestamp())
      WHERE principal.status = 'active'
    ),
    high_permission AS (
      SELECT
        permission.id,
        permission.code,
        permission.risk_level,
        permission.is_plan_restricted,
        permission.plane_eligibility
      FROM shared.permission permission
      WHERE permission.status = 'active'
        AND permission.risk_level IN ('high', 'critical')
    ),
    decision_case AS (
      SELECT
        principal.id AS principal_id,
        principal.tenant_id,
        principal.persona_id,
        permission.id AS permission_id,
        permission.code AS permission_code,
        permission.risk_level,
        permission.is_plan_restricted,
        permission.plane_eligibility
      FROM active_principal principal
      CROSS JOIN high_permission permission
    )
    SELECT
      candidate.tenant_id::text,
      candidate.principal_id::text,
      candidate.permission_id::text,
      candidate.permission_code,
      candidate.risk_level,
      candidate.plane_eligibility,
      candidate.persona_id::text,
      master.check_permission(
        candidate.tenant_id,
        candidate.principal_id,
        candidate.permission_id
      ) AS legacy_single,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM master.access_grant denied
          WHERE denied.tenant_id = candidate.tenant_id
            AND denied.principal_id = candidate.principal_id
            AND denied.permission_id = candidate.permission_id
            AND denied.effect = 'deny'
            AND denied.status = 'active'
            AND denied.assignment_scope_type = 'tenant'
            AND denied.resource_type IS NULL
            AND denied.resource_id IS NULL
            AND (denied.expires_at IS NULL OR denied.expires_at > statement_timestamp())
        ) THEN 'deny'
        WHEN candidate.is_plan_restricted
          AND NOT EXISTS (
            SELECT 1
            FROM master.tenant_permission_override override
            WHERE override.tenant_id = candidate.tenant_id
              AND override.permission_id = candidate.permission_id
              AND override.is_granted = true
              AND (override.expires_at IS NULL OR override.expires_at > statement_timestamp())
          )
          AND NOT EXISTS (
            SELECT 1
            FROM master.tenant tenant
            JOIN shared.subscription_plan plan
              ON plan.code = tenant.subscription
            JOIN shared.subscription_plan_version version
              ON version.plan_id = plan.id
             AND version.valid_to IS NULL
             AND version.status = 'active'
            JOIN shared.plan_permission_access access
              ON access.plan_version_id = version.id
             AND access.permission_id = candidate.permission_id
             AND access.is_included = true
            WHERE tenant.id = candidate.tenant_id
          ) THEN 'not_in_plan'
        WHEN candidate.persona_id IS NULL THEN 'not_evaluable_no_persona'
        WHEN EXISTS (
          SELECT 1
          FROM shared.persona_permission direct_allow
          WHERE direct_allow.persona_id = candidate.persona_id
            AND direct_allow.permission_id = candidate.permission_id
            AND direct_allow.is_granted = true
        ) THEN 'allow'
        WHEN EXISTS (
          SELECT 1
          FROM master.auth_group_member membership
          JOIN master.auth_group_role assignment
            ON assignment.tenant_id = membership.tenant_id
           AND assignment.group_id = membership.group_id
           AND assignment.is_active = true
           AND (assignment.expires_at IS NULL OR assignment.expires_at > statement_timestamp())
          JOIN shared.role role
            ON role.id = assignment.role_id
           AND role.status = 'active'
          JOIN shared.persona_permission role_allow
            ON role_allow.persona_id = role.persona_id
           AND role_allow.permission_id = candidate.permission_id
           AND role_allow.is_granted = true
          WHERE membership.tenant_id = candidate.tenant_id
            AND membership.principal_id = candidate.principal_id
        ) THEN 'allow'
        WHEN EXISTS (
          SELECT 1
          FROM master.access_grant allowed
          WHERE allowed.tenant_id = candidate.tenant_id
            AND allowed.permission_id = candidate.permission_id
            AND allowed.effect = 'allow'
            AND allowed.status = 'active'
            AND (allowed.expires_at IS NULL OR allowed.expires_at > statement_timestamp())
            AND (
              allowed.principal_id = candidate.principal_id
              OR allowed.group_id IN (
                SELECT membership.group_id
                FROM master.auth_group_member membership
                WHERE membership.tenant_id = candidate.tenant_id
                  AND membership.principal_id = candidate.principal_id
              )
              OR allowed.role_id IN (
                SELECT assignment.role_id
                FROM master.auth_group_member membership
                JOIN master.auth_group_role assignment
                  ON assignment.tenant_id = membership.tenant_id
                 AND assignment.group_id = membership.group_id
                 AND assignment.is_active = true
                 AND (
                   assignment.expires_at IS NULL
                   OR assignment.expires_at > statement_timestamp()
                 )
                WHERE membership.tenant_id = candidate.tenant_id
                  AND membership.principal_id = candidate.principal_id
              )
            )
        ) THEN 'allow'
        ELSE 'not_found'
      END AS legacy_batch,
      CASE
        WHEN NOT ('admin' = ANY(candidate.plane_eligibility)) THEN NULL
        WHEN EXISTS (
          SELECT 1
          FROM master.access_grant denied
          WHERE denied.permission_id = candidate.permission_id
            AND denied.effect = 'deny'
            AND denied.status = 'active'
            AND denied.principal_id = candidate.principal_id
            AND (denied.expires_at IS NULL OR denied.expires_at > statement_timestamp())
        ) THEN 'deny'
        WHEN EXISTS (
          SELECT 1
          FROM shared.persona_permission persona_allow
          WHERE persona_allow.persona_id = candidate.persona_id
            AND persona_allow.permission_id = candidate.permission_id
            AND persona_allow.is_granted = true
        ) THEN 'allow'
        WHEN EXISTS (
          SELECT 1
          FROM master.access_grant allowed
          WHERE allowed.permission_id = candidate.permission_id
            AND allowed.effect = 'allow'
            AND allowed.status = 'active'
            AND (allowed.expires_at IS NULL OR allowed.expires_at > statement_timestamp())
            AND (
              allowed.principal_id = candidate.principal_id
              OR allowed.group_id IN (
                SELECT membership.group_id
                FROM master.auth_group_member membership
                WHERE membership.tenant_id = candidate.tenant_id
                  AND membership.principal_id = candidate.principal_id
              )
              OR allowed.role_id IN (
                SELECT assignment.role_id
                FROM master.auth_group_member membership
                JOIN master.auth_group_role assignment
                  ON assignment.tenant_id = membership.tenant_id
                 AND assignment.group_id = membership.group_id
                 AND assignment.is_active = true
                 AND (
                   assignment.expires_at IS NULL
                   OR assignment.expires_at > statement_timestamp()
                 )
                WHERE membership.tenant_id = candidate.tenant_id
                  AND membership.principal_id = candidate.principal_id
              )
            )
        ) THEN 'allow'
        ELSE 'missing'
      END AS legacy_admin
    FROM decision_case candidate
    ORDER BY candidate.tenant_id, candidate.principal_id, candidate.permission_code
  `)).rows;

  let meshBoundary: Awaited<ReturnType<typeof captureBoundary>> | null = null;
  let meshPrincipals: ReturnType<typeof redactMeshPrincipal>[] = [];
  if (mesh) {
    meshBoundary = await captureBoundary(mesh, "mesh");
    const meshRows = (await mesh.query<MeshPrincipalRow>(`
      SELECT
        principal.id::text,
        principal.principal_type,
        principal.status,
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', binding.id::text,
                'realmKey', binding.realm_key,
                'providerCode', binding.provider_code,
                'subjectId', binding.subject_id,
                'syncStatus', binding.sync_status
              )
              ORDER BY binding.realm_key, binding.provider_code, binding.subject_id
            )
            FROM mesh.principal_identity_binding binding
            WHERE binding.principal_id = principal.id
              AND binding.sync_status = 'synced'
          ),
          '[]'::jsonb
        ) AS bindings,
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', account_grant.id::text,
                'accountId', account_grant.account_id::text,
                'roleCode', account_grant.role_code,
                'status', account_grant.status
              )
              ORDER BY account_grant.account_id, account_grant.id
            )
            FROM mesh.account_grant account_grant
            WHERE account_grant.principal_id = principal.id
              AND account_grant.status = 'active'
          ),
          '[]'::jsonb
        ) AS account_grants
      FROM mesh.principal principal
      WHERE principal.status = 'active'
      ORDER BY principal.id
    `)).rows;
    meshPrincipals = meshRows.map(redactMeshPrincipal);
  }

  const cases = decisions.map((row) => ({
    caseId: hashCanonical({
      tenantId: row.tenant_id,
      principalId: row.principal_id,
      permissionId: row.permission_id,
      contextClass: "tenant_capability",
    }),
    contextClass: "tenant_capability",
    tenantId: row.tenant_id,
    principalId: row.principal_id,
    permissionId: row.permission_id,
    permissionCode: row.permission_code,
    riskLevel: row.risk_level,
    planeEligibility: [...row.plane_eligibility].sort(),
    personaId: row.persona_id,
    legacy: {
      single: row.legacy_single,
      batch: row.legacy_batch,
      admin: row.legacy_admin,
      mesh: null,
    },
  }));

  const engineDisagreements = cases
    .filter(
      (item) =>
        item.legacy.batch !== "not_evaluable_no_persona" &&
        item.legacy.single !== item.legacy.batch,
    )
    .map((item) => ({
      caseId: item.caseId,
      comparison: "legacy_single_vs_legacy_batch",
      left: item.legacy.single,
      right: item.legacy.batch,
      classification: null as string | null,
      approval: "pending",
    }));
  const missingIdentityBindings = principals
    .filter((principal) => principal.bindings.length === 0)
    .map((principal) => principal.id);
  const missingMeshIdentityBindings = meshPrincipals
    .filter((principal) => principal.bindings.length === 0)
    .map((principal) => principal.id);
  const unmappedActions = actions
    .filter((action) => action.operations.length === 0)
    .map((action) => action.code);
  const supplementalEvidenceStatus = supplementalDecisionEvidence.map(
    (evidence) => ({
      evidence,
      boundaryMatches: supplementalBoundaryMatches(
        evidence,
        neonBoundary,
        meshBoundary,
      ),
    }),
  );
  const eligibleSupplementalEvidence = supplementalEvidenceStatus
    .filter((item) => item.boundaryMatches)
    .map((item) => item.evidence);
  const supplementalCases = eligibleSupplementalEvidence.flatMap(
    (evidence) => evidence.cases,
  );
  const supplementalDisagreements = eligibleSupplementalEvidence.flatMap(
    (evidence) => evidence.engineDisagreements,
  );
  const capturedContextClasses = uniqueSorted(
    [
      ...cases.map((item) => item.contextClass),
      ...supplementalCases.map((item) => item.contextClass),
    ],
  );
  const missingContextClasses = requiredContextClasses.filter(
    (context) => !capturedContextClasses.includes(context),
  );
  const capturedLegacyEngines = uniqueSorted([
    ...(
    [
      cases.length > 0 && cases.every((item) => typeof item.legacy.single === "string")
        ? "legacy_single"
        : null,
      cases.length > 0 && cases.every((item) => typeof item.legacy.batch === "string")
        ? "legacy_batch"
        : null,
      cases.some((item) => item.planeEligibility.includes("admin")) &&
      cases
        .filter((item) => item.planeEligibility.includes("admin"))
        .every((item) => typeof item.legacy.admin === "string")
        ? "legacy_admin"
        : null,
      // No Mesh decision is evaluated by this Wave 0 scaffold.
      null,
    ] as Array<LegacyEngine | null>
    ).filter((engine): engine is LegacyEngine => engine !== null),
    ...supplementalCases.map((item) => item.engine),
  ]);
  const missingLegacyEngines = requiredLegacyEngines.filter(
    (engine) => !capturedLegacyEngines.includes(engine),
  );
  const expectedCases = principals.length * actions.length;
  const capturedPrincipalIds = new Set(cases.map((item) => item.principalId));
  const activeUserIds = principals
    .filter((principal) => principal.principalType === "user")
    .map((principal) => principal.id);
  const activeMeshUserIds = meshPrincipals
    .filter((principal) => isMeshUserPrincipalType(principal.principalType))
    .map((principal) => principal.id);
  const identityAuthorityEvidence = reconcileExternalIdentityEvidence(
    identityEvidence,
    principals,
    meshPrincipals,
  );
  const neonCaptureBoundaryComplete = isCompleteCaptureBoundary(
    neonBoundary,
    "neon",
  );
  const meshCaptureBoundaryComplete =
    meshBoundary !== null && isCompleteCaptureBoundary(meshBoundary, "mesh");
  const distinctPlaneSourceDatabaseIds =
    neonCaptureBoundaryComplete &&
    meshCaptureBoundaryComplete &&
    meshBoundary !== null &&
    neonBoundary.source_database_id !== meshBoundary.source_database_id;
  const meshDecisionCorpusCaptured = hasCompleteMeshDecisionEvidence(
    eligibleSupplementalEvidence,
    meshPrincipals,
  );
  const allDisagreements = [
    ...engineDisagreements,
    ...supplementalDisagreements,
  ];
  const gates = {
    activeNeonPrincipalInventoryNonEmpty: principals.length > 0,
    activeNeonUserInventoryNonEmpty: activeUserIds.length > 0,
    everyActiveNeonPrincipalIncluded:
      principals.every((principal) => capturedPrincipalIds.has(principal.id)),
    everyActiveNeonUserIncluded:
      activeUserIds.every((principalId) => capturedPrincipalIds.has(principalId)),
    highRiskActionInventoryNonEmpty: actions.length > 0,
    everyHighRiskActionIncluded:
      new Set(cases.map((item) => item.permissionId)).size === actions.length,
    exactNeonPrincipalActionCrossProduct: cases.length === expectedCases,
    everyActivePrincipalHasIdentityBinding: missingIdentityBindings.length === 0,
    everyActionMappedOrClassified: unmappedActions.length === 0,
    allRequiredContextClassesCaptured: missingContextClasses.length === 0,
    allRequiredLegacyEnginesCaptured: missingLegacyEngines.length === 0,
    allLegacyEngineDisagreementsClassified:
      allDisagreements.every(
        (item) =>
          typeof item.classification === "string" &&
          item.classification.trim().length > 0,
      ),
    meshIdentityInventoryCaptured: mesh !== null,
    activeMeshPrincipalInventoryNonEmpty: meshPrincipals.length > 0,
    activeMeshUserInventoryNonEmpty: activeMeshUserIds.length > 0,
    everyActiveMeshPrincipalHasIdentityBinding:
      missingMeshIdentityBindings.length === 0,
    meshDecisionCorpusCaptured,
    neonCaptureBoundaryComplete,
    meshCaptureBoundaryComplete,
    distinctPlaneSourceDatabaseIds,
    identityAuthorityEvidenceCaptured:
      identityAuthorityEvidence.status === "captured",
    identityAuthorityReconciled:
      identityAuthorityEvidence.status === "captured" &&
      identityAuthorityEvidence.reconciliation.passed,
    repositoryCatalogProvenanceRecorded:
      repositoryRevision !== "unavailable" &&
      catalogRepositoryPath.length > 0,
    repositoryStateClean,
  };
  const gaps = [
    ...missingIdentityBindings.map((principalId) => ({
      kind: "active_principal_without_identity_binding",
      principalId,
    })),
    ...unmappedActions.map((permissionCode) => ({
      kind: "high_risk_permission_without_entity_operation",
      permissionCode,
    })),
    ...missingMeshIdentityBindings.map((principalId) => ({
      kind: "active_mesh_principal_without_synced_identity_binding",
      principalId,
    })),
    ...missingContextClasses.map((contextClass) => ({
      kind: "required_context_not_captured_by_baseline_exporter",
      contextClass,
    })),
    ...missingLegacyEngines.map((engine) => ({
      kind: "required_legacy_engine_not_captured",
      engine,
    })),
    ...supplementalEvidenceStatus
      .filter((item) => !item.boundaryMatches)
      .map((item) => ({
        kind: "supplemental_decision_evidence_boundary_mismatch",
        evidenceId: item.evidence.evidenceId,
        plane: item.evidence.source.plane,
      })),
    ...(!neonCaptureBoundaryComplete
      ? [{ kind: "neon_durable_capture_boundary_missing" }]
      : []),
    ...(!meshCaptureBoundaryComplete
      ? [{ kind: "mesh_durable_capture_boundary_missing" }]
      : []),
    ...(neonCaptureBoundaryComplete &&
    meshCaptureBoundaryComplete &&
    !distinctPlaneSourceDatabaseIds
      ? [{ kind: "neon_mesh_source_database_id_not_distinct" }]
      : []),
    ...(identityAuthorityEvidence.status === "captured"
      ? identityAuthorityEvidence.reconciliation.gaps
      : [{
          kind: "external_identity_authority_evidence_not_captured",
          requiredArgument: "--identity-evidence=PATH",
        }]),
    ...(mesh
      ? [{
          kind: "mesh_decision_context_requires_approved_account_to_tenant_mapping",
          detail:
            "The exporter does not infer a Neon tenant from Mesh network_account.source_ref.",
        }]
      : [{ kind: "mesh_database_not_captured", requiredEnvironment: "MESH_DATABASE_URL" }]),
  ];

  const report = {
    schemaVersion: 1,
    readOnly: true,
    capture: {
      generatedAt: new Date().toISOString(),
      repositoryRevision,
      repositoryStateClean,
      catalogPath: catalogRepositoryPath,
      neon: neonBoundary,
      mesh: meshBoundary ?? {
        status: "not_captured",
        reason: "MESH_DATABASE_URL was not supplied",
      },
    },
    identityInventory: {
      neonActivePrincipals: principals,
      meshActivePrincipals: meshPrincipals,
    },
    identityAuthorityEvidence,
    supplementalDecisionEvidence: supplementalDecisionEvidence.length > 0
      ? {
          status: "captured",
          items: supplementalDecisionEvidence,
          evidenceSetSha256: hashCanonical(supplementalDecisionEvidence),
        }
      : {
          status: "not_captured",
          reason: "--supplemental-decision-evidence was not supplied",
          items: [],
          evidenceSetSha256: null,
        },
    actions,
    cases,
    engineDisagreements,
    coverage: {
      expectedNeonPrincipalActionCases: expectedCases,
      capturedNeonPrincipalActionCases: cases.length,
      activeNeonPrincipals: principals.length,
      activeNeonUsers: activeUserIds.length,
      activeMeshPrincipals: meshPrincipals.length,
      activeMeshUsers: activeMeshUserIds.length,
      highRiskActions: actions.length,
      missingIdentityBindings,
      missingMeshIdentityBindings,
      unmappedActions,
      requiredLegacyEngines,
      capturedLegacyEngines,
      missingLegacyEngines,
      requiredContextClasses,
      capturedContextClasses,
      missingContextClasses,
      supplementalDecisionEvidence: supplementalDecisionEvidence.length,
      supplementalDecisionCases: supplementalCases.length,
      gates,
      gaps,
    },
    hashes: {
      catalogSha256,
      identitySha256: hashCanonical({
        neon: principals,
        mesh: meshPrincipals,
      }),
      identityAuthorityEvidenceSha256:
        identityAuthorityEvidence.status === "captured"
          ? hashCanonical(identityAuthorityEvidence)
          : null,
      actionsSha256: hashCanonical(actions),
      casesSha256: hashCanonical(cases),
      engineDisagreementsSha256: hashCanonical(engineDisagreements),
      supplementalDecisionEvidenceSha256:
        supplementalDecisionEvidence.length > 0
          ? hashCanonical(supplementalDecisionEvidence)
          : null,
    },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(
    `WROTE ${outputPath}\n${JSON.stringify({
      activeNeonPrincipals: principals.length,
      activeMeshPrincipals: meshPrincipals.length,
      highRiskActions: actions.length,
      cases: cases.length,
      disagreements: engineDisagreements.length,
      gaps: gaps.length,
    })}\n`,
  );
  if (strict && Object.values(gates).some((value) => !value)) process.exitCode = 1;

  await neon.query("ROLLBACK");
  if (mesh) await mesh.query("ROLLBACK");
} catch (error) {
  await neon.query("ROLLBACK").catch(() => undefined);
  if (mesh) await mesh.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await neon.end();
  if (mesh) await mesh.end();
}

async function captureBoundary(client: pg.Client, plane: string) {
  const clockRelation = plane === "mesh"
    ? "mesh_log.authorization_capture_clock"
    : "event.authorization_capture_clock";
  const result = await client.query<{
    database_name: string;
    database_oid: string;
    wal_lsn: string;
    snapshot_id: string;
    captured_at: string;
    has_capture_clock: boolean;
  }>(`
    SELECT
      current_database() AS database_name,
      (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS database_oid,
      pg_current_wal_lsn()::text AS wal_lsn,
      txid_current_snapshot()::text AS snapshot_id,
      statement_timestamp()::text AS captured_at,
      to_regclass($1) IS NOT NULL AS has_capture_clock
  `, [clockRelation]);
  const boundary = result.rows[0];
  if (!boundary) throw new Error(`Unable to capture ${plane} database boundary.`);
  const clockSql = plane === "mesh"
    ? `
        SELECT
          source_database_id::text,
          current_watermark::text,
          capture_contract_version,
          installed_at::text
        FROM mesh_log.authorization_capture_clock
        WHERE singleton_id = 1
          AND plane_key = 'mesh'
      `
    : `
        SELECT
          source_database_id::text,
          current_watermark::text,
          capture_contract_version,
          installed_at::text
        FROM event.authorization_capture_clock
        WHERE singleton_id = 1
      `;
  const clock = boundary.has_capture_clock
    ? (await client.query<{
        source_database_id: string;
        current_watermark: string;
        capture_contract_version: string;
        installed_at: string;
      }>(clockSql)).rows[0] ?? null
    : null;
  return {
    plane,
    status: "captured",
    database_name: boundary.database_name,
    database_oid: boundary.database_oid,
    wal_lsn: boundary.wal_lsn,
    snapshot_id: boundary.snapshot_id,
    captured_at: boundary.captured_at,
    has_capture_clock: boundary.has_capture_clock,
    source_database_id: clock?.source_database_id ?? null,
    capture_contract_version: clock?.capture_contract_version ?? null,
    capture_installed_at: clock?.installed_at ?? null,
    capture_watermark: clock?.current_watermark ?? null,
  };
}

function redactPrincipal(row: PrincipalRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    principalType: row.principal_type,
    status: row.status,
    locked: row.is_locked,
    serviceAccount: row.is_service_account,
    authEpoch: row.auth_epoch,
    bindings: row.bindings.map((binding) => ({
      id: binding.id,
      realmKey: binding.realmKey,
      providerCode: binding.providerCode,
      subjectSha256: sha256(binding.subjectId),
      issuerSha256: binding.issuer ? sha256(binding.issuer) : null,
      audienceSha256: binding.audience ? sha256(binding.audience) : null,
      clientIdSha256: binding.clientId ? sha256(binding.clientId) : null,
      idpEnabled: binding.idpEnabled,
      syncStatus: binding.syncStatus,
    })),
  };
}

function redactMeshPrincipal(row: MeshPrincipalRow) {
  return {
    id: row.id,
    principalType: row.principal_type,
    status: row.status,
    bindings: row.bindings.map((binding) => ({
      id: binding.id,
      realmKey: binding.realmKey,
      providerCode: binding.providerCode,
      subjectSha256: sha256(binding.subjectId),
      syncStatus: binding.syncStatus,
    })),
    accountGrants: row.account_grants,
  };
}

function valueArgument(prefix: string) {
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function valueArguments(prefix: string) {
  return process.argv
    .filter((argument) => argument.startsWith(prefix))
    .map((argument) => argument.slice(prefix.length))
    .filter(Boolean);
}

function repositoryRelativePath(path: string) {
  const relativePath = relative(repositoryRoot, path);
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..\\`) ||
    relativePath.startsWith("../") ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Catalog must be a repository-owned file: ${path}`);
  }
  return relativePath.replaceAll("\\", "/");
}

function readRequiredLegacyEngines(catalogValue: Json): LegacyEngine[] {
  const catalogObject = requireRecord(catalogValue, "catalog");
  const requiredByPlane = requireRecord(
    catalogObject.requiredLegacyEngines,
    "catalog.requiredLegacyEngines",
  );
  const engines = Object.values(requiredByPlane).flatMap((value, index) =>
    requireStringArray(
      value,
      `catalog.requiredLegacyEngines[${index}]`,
    ),
  );
  const supported = new Set<LegacyEngine>([
    "legacy_single",
    "legacy_batch",
    "legacy_admin",
    "legacy_mesh",
  ]);
  for (const engine of engines) {
    if (!supported.has(engine as LegacyEngine)) {
      throw new Error(`Unsupported required legacy engine: ${engine}`);
    }
  }
  const normalized = uniqueSorted(engines as LegacyEngine[]);
  if (normalized.length === 0) {
    throw new Error("Catalog must require at least one legacy engine.");
  }
  return normalized;
}

function readRequiredContextClasses(catalogValue: Json) {
  const catalogObject = requireRecord(catalogValue, "catalog");
  const contexts = uniqueSorted(
    requireStringArray(
      catalogObject.requiredContextClasses,
      "catalog.requiredContextClasses",
    ),
  );
  if (contexts.length === 0) {
    throw new Error("Catalog must require at least one context class.");
  }
  return contexts;
}

function normalizeExternalIdentityEvidence(
  value: unknown,
): ExternalIdentityEvidence {
  const evidence = requireRecord(value, "identityEvidence");
  requireExactKeys(
    evidence,
    [
      "schemaVersion",
      "evidenceId",
      "generatedAt",
      "source",
      "subjects",
      "hashes",
    ],
    "identityEvidence",
  );
  if (evidence.schemaVersion !== 1) {
    throw new Error("identityEvidence.schemaVersion must be 1.");
  }
  const evidenceId = requirePatternString(
    evidence.evidenceId,
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/,
    "identityEvidence.evidenceId",
  );
  const generatedAt = requireDateTime(
    evidence.generatedAt,
    "identityEvidence.generatedAt",
  );
  const source = requireRecord(evidence.source, "identityEvidence.source");
  requireExactKeys(
    source,
    [
      "authoritySystem",
      "sourceInstanceIdSha256",
      "snapshotId",
      "snapshotSha256",
      "subjectSelection",
    ],
    "identityEvidence.source",
  );
  if (source.subjectSelection !== "enabled_only") {
    throw new Error(
      "identityEvidence.source.subjectSelection must be enabled_only.",
    );
  }
  const normalizedSource = {
    authoritySystem: requirePatternString(
      source.authoritySystem,
      /^[a-z][a-z0-9_.-]{1,63}$/,
      "identityEvidence.source.authoritySystem",
    ),
    sourceInstanceIdSha256: requireSha256(
      source.sourceInstanceIdSha256,
      "identityEvidence.source.sourceInstanceIdSha256",
    ),
    snapshotId: requireNonEmptyString(
      source.snapshotId,
      "identityEvidence.source.snapshotId",
    ),
    snapshotSha256: requireSha256(
      source.snapshotSha256,
      "identityEvidence.source.snapshotSha256",
    ),
    subjectSelection: "enabled_only" as const,
  } as const;
  if (!Array.isArray(evidence.subjects) || evidence.subjects.length === 0) {
    throw new Error("identityEvidence.subjects must be a non-empty array.");
  }
  const subjects = evidence.subjects.map((subjectValue, index) => {
    const subject = requireRecord(
      subjectValue,
      `identityEvidence.subjects[${index}]`,
    );
    requireExactKeys(
      subject,
      [
        "subjectKeySha256",
        "realmKey",
        "providerCode",
        "subjectSha256",
        "subjectType",
        "enabled",
        "expectedPlanes",
      ],
      `identityEvidence.subjects[${index}]`,
    );
    if (subject.enabled !== true) {
      throw new Error(
        `identityEvidence.subjects[${index}].enabled must be true.`,
      );
    }
    const subjectType = requireNonEmptyString(
      subject.subjectType,
      `identityEvidence.subjects[${index}].subjectType`,
    );
    if (!["user", "service_account", "integration_user"].includes(subjectType)) {
      throw new Error(
        `identityEvidence.subjects[${index}].subjectType is unsupported.`,
      );
    }
    const realmKey = requirePatternString(
      subject.realmKey,
      /^[a-z][a-z0-9_-]{1,62}$/,
      `identityEvidence.subjects[${index}].realmKey`,
    );
    const providerCode = requirePatternString(
      subject.providerCode,
      /^[a-z][a-z0-9_-]{1,62}$/,
      `identityEvidence.subjects[${index}].providerCode`,
    );
    const subjectSha256 = requireSha256(
      subject.subjectSha256,
      `identityEvidence.subjects[${index}].subjectSha256`,
    );
    if (!Array.isArray(subject.expectedPlanes)) {
      throw new Error(
        `identityEvidence.subjects[${index}].expectedPlanes must be an array.`,
      );
    }
    const expectedPlanes = uniqueSorted(
      subject.expectedPlanes.map((planeValue, planeIndex) => {
        if (!["neon", "admin", "mesh"].includes(String(planeValue))) {
          throw new Error(
            `identityEvidence.subjects[${index}].expectedPlanes[${planeIndex}] is invalid.`,
          );
        }
        return planeValue as Plane;
      }),
    );
    if (expectedPlanes.length === 0) {
      throw new Error(
        `identityEvidence.subjects[${index}].expectedPlanes must not be empty.`,
      );
    }
    const expectedKey = identitySubjectKey({
      realmKey,
      providerCode,
      subjectSha256,
    });
    const subjectKeySha256 = requireSha256(
      subject.subjectKeySha256,
      `identityEvidence.subjects[${index}].subjectKeySha256`,
    );
    if (subjectKeySha256 !== expectedKey) {
      throw new Error(
        `identityEvidence.subjects[${index}].subjectKeySha256 does not match its normalized subject tuple.`,
      );
    }
    return {
      subjectKeySha256,
      realmKey,
      providerCode,
      subjectSha256,
      subjectType: subjectType as ExternalIdentitySubject["subjectType"],
      enabled: true as const,
      expectedPlanes,
    };
  }).sort((left, right) =>
    left.subjectKeySha256.localeCompare(right.subjectKeySha256)
  );
  if (new Set(subjects.map((subject) => subject.subjectKeySha256)).size !== subjects.length) {
    throw new Error("identityEvidence.subjects contains duplicate subject keys.");
  }
  const hashes = requireRecord(evidence.hashes, "identityEvidence.hashes");
  requireExactKeys(hashes, ["subjectsSha256"], "identityEvidence.hashes");
  const subjectsSha256 = requireSha256(
    hashes.subjectsSha256,
    "identityEvidence.hashes.subjectsSha256",
  );
  const expectedSubjectsSha256 = hashCanonical(subjects);
  if (subjectsSha256 !== expectedSubjectsSha256) {
    throw new Error(
      "identityEvidence.hashes.subjectsSha256 does not match normalized subjects.",
    );
  }
  return {
    schemaVersion: 1,
    evidenceId,
    generatedAt,
    source: normalizedSource,
    subjects,
    hashes: { subjectsSha256 },
  };
}

function normalizeSupplementalDecisionEvidence(
  value: unknown,
  expected: {
    repositoryRevision: string;
    governanceCatalogSha256: string;
  },
): SupplementalDecisionEvidence {
  const evidence = requireRecord(value, "supplementalDecisionEvidence");
  requireExactKeys(
    evidence,
    [
      "schemaVersion",
      "evidenceId",
      "generatedAt",
      "repositoryRevision",
      "governanceCatalogSha256",
      "source",
      "principals",
      "actions",
      "cases",
      "engineDisagreements",
      "hashes",
    ],
    "supplementalDecisionEvidence",
  );
  if (evidence.schemaVersion !== 1) {
    throw new Error("supplementalDecisionEvidence.schemaVersion must be 1.");
  }
  const evidenceId = requirePatternString(
    evidence.evidenceId,
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/,
    "supplementalDecisionEvidence.evidenceId",
  );
  const generatedAt = requireDateTime(
    evidence.generatedAt,
    "supplementalDecisionEvidence.generatedAt",
  );
  const evidenceRepositoryRevision = requirePatternString(
    evidence.repositoryRevision,
    /^[0-9a-f]{40,64}$/,
    "supplementalDecisionEvidence.repositoryRevision",
  );
  if (evidenceRepositoryRevision !== expected.repositoryRevision) {
    throw new Error(
      `${evidenceId}: supplemental repository revision does not match capture revision.`,
    );
  }
  const governanceCatalogSha256 = requireSha256(
    evidence.governanceCatalogSha256,
    "supplementalDecisionEvidence.governanceCatalogSha256",
  );
  if (governanceCatalogSha256 !== expected.governanceCatalogSha256) {
    throw new Error(
      `${evidenceId}: supplemental governance catalog hash does not match.`,
    );
  }
  const source = requireRecord(
    evidence.source,
    "supplementalDecisionEvidence.source",
  );
  requireExactKeys(
    source,
    [
      "plane",
      "sourceDatabaseId",
      "captureWatermark",
      "actionSelection",
      "principalSelection",
      "decisionCatalogSha256",
      "evaluatorId",
      "evaluatorRevision",
    ],
    "supplementalDecisionEvidence.source",
  );
  const plane = requirePlane(
    source.plane,
    "supplementalDecisionEvidence.source.plane",
  );
  if (source.actionSelection !== "all_active_high_critical") {
    throw new Error(
      `${evidenceId}: source.actionSelection must be all_active_high_critical.`,
    );
  }
  if (
    source.principalSelection !== "all_active_plus_certification_fixtures"
  ) {
    throw new Error(
      `${evidenceId}: source.principalSelection must be all_active_plus_certification_fixtures.`,
    );
  }
  const normalizedSource = {
    plane,
    sourceDatabaseId: requireUuid(
      source.sourceDatabaseId,
      "supplementalDecisionEvidence.source.sourceDatabaseId",
    ),
    captureWatermark: requirePatternString(
      source.captureWatermark,
      /^\d+$/,
      "supplementalDecisionEvidence.source.captureWatermark",
    ),
    actionSelection: "all_active_high_critical" as const,
    principalSelection: "all_active_plus_certification_fixtures" as const,
    decisionCatalogSha256: requireSha256(
      source.decisionCatalogSha256,
      "supplementalDecisionEvidence.source.decisionCatalogSha256",
    ),
    evaluatorId: requireNonEmptyString(
      source.evaluatorId,
      "supplementalDecisionEvidence.source.evaluatorId",
    ),
    evaluatorRevision: requireNonEmptyString(
      source.evaluatorRevision,
      "supplementalDecisionEvidence.source.evaluatorRevision",
    ),
  };
  if (!Array.isArray(evidence.principals) || evidence.principals.length === 0) {
    throw new Error(`${evidenceId}: principals must be a non-empty array.`);
  }
  const principals = evidence.principals.map((principalValue, index) => {
    const principal = requireRecord(
      principalValue,
      `supplementalDecisionEvidence.principals[${index}]`,
    );
    requireExactKeys(
      principal,
      ["principalId", "principalClass"],
      `supplementalDecisionEvidence.principals[${index}]`,
    );
    if (
      principal.principalClass !== "active_inventory" &&
      principal.principalClass !== "certification_fixture"
    ) {
      throw new Error(
        `${evidenceId}: principals[${index}].principalClass is invalid.`,
      );
    }
    return {
      principalId: requireUuid(
        principal.principalId,
        `supplementalDecisionEvidence.principals[${index}].principalId`,
      ),
      principalClass: principal.principalClass,
    } as SupplementalDecisionPrincipal;
  }).sort((left, right) =>
    `${left.principalClass}:${left.principalId}`.localeCompare(
      `${right.principalClass}:${right.principalId}`,
    )
  );
  if (
    new Set(principals.map((principal) => principal.principalId)).size !==
    principals.length
  ) {
    throw new Error(`${evidenceId}: principal IDs must be unique.`);
  }
  if (!Array.isArray(evidence.actions) || evidence.actions.length === 0) {
    throw new Error(`${evidenceId}: actions must be a non-empty array.`);
  }
  const actions = evidence.actions.map((actionValue, index) => {
    const action = requireRecord(
      actionValue,
      `supplementalDecisionEvidence.actions[${index}]`,
    );
    requireExactKeys(
      action,
      [
        "operationId",
        "permissionId",
        "permissionCode",
        "riskLevel",
      ],
      `supplementalDecisionEvidence.actions[${index}]`,
    );
    if (action.riskLevel !== "high" && action.riskLevel !== "critical") {
      throw new Error(`${evidenceId}: actions[${index}].riskLevel is invalid.`);
    }
    return {
      operationId: requireUuid(
        action.operationId,
        `supplementalDecisionEvidence.actions[${index}].operationId`,
      ),
      permissionId: requireUuid(
        action.permissionId,
        `supplementalDecisionEvidence.actions[${index}].permissionId`,
      ),
      permissionCode: requireNonEmptyString(
        action.permissionCode,
        `supplementalDecisionEvidence.actions[${index}].permissionCode`,
      ),
      riskLevel: action.riskLevel,
    } as SupplementalDecisionAction;
  }).sort((left, right) =>
    `${left.operationId}:${left.permissionId}`.localeCompare(
      `${right.operationId}:${right.permissionId}`,
    )
  );
  if (
    new Set(actions.map((action) => action.operationId)).size !== actions.length
  ) {
    throw new Error(`${evidenceId}: operation IDs must be unique.`);
  }
  if (normalizedSource.decisionCatalogSha256 !== hashCanonical(actions)) {
    throw new Error(
      `${evidenceId}: source.decisionCatalogSha256 does not match the normalized action catalog.`,
    );
  }
  const principalById = new Map(
    principals.map((principal) => [principal.principalId, principal]),
  );
  const actionByOperationId = new Map(
    actions.map((action) => [action.operationId, action]),
  );
  if (!Array.isArray(evidence.cases) || evidence.cases.length === 0) {
    throw new Error(`${evidenceId}: cases must be a non-empty array.`);
  }
  const cases = evidence.cases.map((caseValue, index) => {
    const item = requireRecord(
      caseValue,
      `supplementalDecisionEvidence.cases[${index}]`,
    );
    requireExactKeys(
      item,
      [
        "caseId",
        "plane",
        "authorityScopeId",
        "membershipId",
        "principalId",
        "operationId",
        "permissionId",
        "permissionCode",
        "contextClass",
        "resourceType",
        "resourceIdSha256",
        "resourceSentinel",
        "engine",
        "decision",
        "decisionEvidenceSha256",
      ],
      `supplementalDecisionEvidence.cases[${index}]`,
    );
    const casePlane = requirePlane(
      item.plane,
      `supplementalDecisionEvidence.cases[${index}].plane`,
    );
    if (casePlane !== plane) {
      throw new Error(`${evidenceId}: cases[${index}] has the wrong plane.`);
    }
    const principalId = requireUuid(
      item.principalId,
      `supplementalDecisionEvidence.cases[${index}].principalId`,
    );
    if (!principalById.has(principalId)) {
      throw new Error(
        `${evidenceId}: cases[${index}] references an unknown principal.`,
      );
    }
    const operationId = requireUuid(
      item.operationId,
      `supplementalDecisionEvidence.cases[${index}].operationId`,
    );
    const action = actionByOperationId.get(operationId);
    if (!action) {
      throw new Error(
        `${evidenceId}: cases[${index}] references an unknown operation.`,
      );
    }
    const permissionId = requireUuid(
      item.permissionId,
      `supplementalDecisionEvidence.cases[${index}].permissionId`,
    );
    const permissionCode = requireNonEmptyString(
      item.permissionCode,
      `supplementalDecisionEvidence.cases[${index}].permissionCode`,
    );
    if (
      action.permissionId !== permissionId ||
      action.permissionCode !== permissionCode
    ) {
      throw new Error(
        `${evidenceId}: cases[${index}] permission does not match its operation.`,
      );
    }
    const engine = requireLegacyEngine(
      item.engine,
      `supplementalDecisionEvidence.cases[${index}].engine`,
    );
    if (
      (plane === "mesh" && engine !== "legacy_mesh") ||
      (plane === "admin" && engine !== "legacy_admin") ||
      (plane === "neon" &&
        engine !== "legacy_single" &&
        engine !== "legacy_batch")
    ) {
      throw new Error(
        `${evidenceId}: cases[${index}] engine is incompatible with ${plane}.`,
      );
    }
    const contextClass = requireNonEmptyString(
      item.contextClass,
      `supplementalDecisionEvidence.cases[${index}].contextClass`,
    );
    const resourceType = requireNullableString(
      item.resourceType,
      `supplementalDecisionEvidence.cases[${index}].resourceType`,
    );
    const resourceIdSha256 = item.resourceIdSha256 === null
      ? null
      : requireSha256(
          item.resourceIdSha256,
          `supplementalDecisionEvidence.cases[${index}].resourceIdSha256`,
        );
    const resourceSentinel = requireNullableString(
      item.resourceSentinel,
      `supplementalDecisionEvidence.cases[${index}].resourceSentinel`,
    );
    if (
      contextClass !== "tenant_capability" &&
      resourceIdSha256 === null &&
      resourceSentinel === null
    ) {
      throw new Error(
        `${evidenceId}: cases[${index}] requires a resource hash or sentinel.`,
      );
    }
    const normalizedWithoutId = {
      plane,
      authorityScopeId: requireUuid(
        item.authorityScopeId,
        `supplementalDecisionEvidence.cases[${index}].authorityScopeId`,
      ),
      membershipId: requireUuid(
        item.membershipId,
        `supplementalDecisionEvidence.cases[${index}].membershipId`,
      ),
      principalId,
      operationId,
      permissionId,
      permissionCode,
      contextClass,
      resourceType,
      resourceIdSha256,
      resourceSentinel,
      engine,
    };
    const caseId = requireSha256(
      item.caseId,
      `supplementalDecisionEvidence.cases[${index}].caseId`,
    );
    if (caseId !== hashCanonical(normalizedWithoutId)) {
      throw new Error(
        `${evidenceId}: cases[${index}].caseId does not match its operation/context identity.`,
      );
    }
    return {
      caseId,
      ...normalizedWithoutId,
      decision: requireNonEmptyString(
        item.decision,
        `supplementalDecisionEvidence.cases[${index}].decision`,
      ),
      decisionEvidenceSha256: requireSha256(
        item.decisionEvidenceSha256,
        `supplementalDecisionEvidence.cases[${index}].decisionEvidenceSha256`,
      ),
    };
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  if (new Set(cases.map((item) => item.caseId)).size !== cases.length) {
    throw new Error(`${evidenceId}: case IDs must be unique.`);
  }
  if (
    !Array.isArray(evidence.engineDisagreements)
  ) {
    throw new Error(`${evidenceId}: engineDisagreements must be an array.`);
  }
  const caseIds = new Set(cases.map((item) => item.caseId));
  const engineDisagreements = evidence.engineDisagreements.map(
    (disagreementValue, index) => {
      const disagreement = requireRecord(
        disagreementValue,
        `supplementalDecisionEvidence.engineDisagreements[${index}]`,
      );
      requireExactKeys(
        disagreement,
        [
          "caseId",
          "comparison",
          "left",
          "right",
          "classification",
          "approval",
        ],
        `supplementalDecisionEvidence.engineDisagreements[${index}]`,
      );
      const caseId = requireSha256(
        disagreement.caseId,
        `supplementalDecisionEvidence.engineDisagreements[${index}].caseId`,
      );
      if (!caseIds.has(caseId)) {
        throw new Error(
          `${evidenceId}: engineDisagreements[${index}] references an unknown case.`,
        );
      }
      const classification = disagreement.classification === null
        ? null
        : requireNonEmptyString(
            disagreement.classification,
            `supplementalDecisionEvidence.engineDisagreements[${index}].classification`,
          );
      return {
        caseId,
        comparison: requireNonEmptyString(
          disagreement.comparison,
          `supplementalDecisionEvidence.engineDisagreements[${index}].comparison`,
        ),
        left: requireNonEmptyString(
          disagreement.left,
          `supplementalDecisionEvidence.engineDisagreements[${index}].left`,
        ),
        right: requireNonEmptyString(
          disagreement.right,
          `supplementalDecisionEvidence.engineDisagreements[${index}].right`,
        ),
        classification,
        approval: requireNonEmptyString(
          disagreement.approval,
          `supplementalDecisionEvidence.engineDisagreements[${index}].approval`,
        ),
      };
    },
  ).sort((left, right) =>
    `${left.caseId}:${left.comparison}`.localeCompare(
      `${right.caseId}:${right.comparison}`,
    )
  );
  const hashes = requireRecord(
    evidence.hashes,
    "supplementalDecisionEvidence.hashes",
  );
  requireExactKeys(
    hashes,
    [
      "principalsSha256",
      "actionsSha256",
      "casesSha256",
      "engineDisagreementsSha256",
    ],
    "supplementalDecisionEvidence.hashes",
  );
  const normalizedHashes = {
    principalsSha256: requireSha256(
      hashes.principalsSha256,
      "supplementalDecisionEvidence.hashes.principalsSha256",
    ),
    actionsSha256: requireSha256(
      hashes.actionsSha256,
      "supplementalDecisionEvidence.hashes.actionsSha256",
    ),
    casesSha256: requireSha256(
      hashes.casesSha256,
      "supplementalDecisionEvidence.hashes.casesSha256",
    ),
    engineDisagreementsSha256: requireSha256(
      hashes.engineDisagreementsSha256,
      "supplementalDecisionEvidence.hashes.engineDisagreementsSha256",
    ),
  };
  const expectedHashes = {
    principalsSha256: hashCanonical(principals),
    actionsSha256: hashCanonical(actions),
    casesSha256: hashCanonical(cases),
    engineDisagreementsSha256: hashCanonical(engineDisagreements),
  };
  for (const key of Object.keys(expectedHashes) as Array<keyof typeof expectedHashes>) {
    if (normalizedHashes[key] !== expectedHashes[key]) {
      throw new Error(`${evidenceId}: hashes.${key} does not match.`);
    }
  }
  return {
    schemaVersion: 1,
    evidenceId,
    generatedAt,
    repositoryRevision: evidenceRepositoryRevision,
    governanceCatalogSha256,
    source: normalizedSource,
    principals,
    actions,
    cases,
    engineDisagreements,
    hashes: normalizedHashes,
  };
}

function assertUniqueSupplementalEvidence(
  evidence: SupplementalDecisionEvidence[],
) {
  if (
    new Set(evidence.map((item) => item.evidenceId)).size !== evidence.length
  ) {
    throw new Error("Supplemental decision evidence IDs must be unique.");
  }
  const caseIds = evidence.flatMap((item) =>
    item.cases.map((caseItem) => caseItem.caseId)
  );
  if (new Set(caseIds).size !== caseIds.length) {
    throw new Error(
      "Supplemental decision case IDs must be unique across evidence files.",
    );
  }
}

function supplementalBoundaryMatches(
  evidence: SupplementalDecisionEvidence,
  neonBoundary: Awaited<ReturnType<typeof captureBoundary>>,
  meshBoundary: Awaited<ReturnType<typeof captureBoundary>> | null,
) {
  const boundary = evidence.source.plane === "mesh"
    ? meshBoundary
    : neonBoundary;
  return (
    boundary !== null &&
    isCompleteCaptureBoundary(
      boundary,
      evidence.source.plane === "mesh" ? "mesh" : "neon",
    ) &&
    evidence.source.sourceDatabaseId === boundary.source_database_id &&
    evidence.source.captureWatermark === boundary.capture_watermark
  );
}

function hasCompleteMeshDecisionEvidence(
  evidence: SupplementalDecisionEvidence[],
  meshPrincipals: ReturnType<typeof redactMeshPrincipal>[],
) {
  const meshEvidence = evidence.filter(
    (item) => item.source.plane === "mesh",
  );
  if (meshEvidence.length === 0 || meshPrincipals.length === 0) return false;
  const expectedPrincipalIds = uniqueSorted(
    meshPrincipals.map((principal) => principal.id),
  );
  return meshEvidence.some((item) => {
    const activeIds = uniqueSorted(item.principals
      .filter((principal) => principal.principalClass === "active_inventory")
      .map((principal) => principal.principalId));
    return (
      sameStringSet(activeIds, expectedPrincipalIds) &&
      item.actions.length > 0 &&
      activeIds.every((principalId) =>
        item.actions.every((action) =>
          item.cases.some(
            (caseItem) =>
              caseItem.principalId === principalId &&
              caseItem.operationId === action.operationId &&
              caseItem.engine === "legacy_mesh",
          )
        )
      )
    );
  });
}

function reconcileExternalIdentityEvidence(
  evidence: ExternalIdentityEvidence | null,
  neonPrincipals: ReturnType<typeof redactPrincipal>[],
  meshPrincipals: ReturnType<typeof redactMeshPrincipal>[],
) {
  if (!evidence) {
    return {
      status: "not_captured" as const,
      reason: "--identity-evidence was not supplied",
    };
  }
  const authorityByKey = new Map(
    evidence.subjects.map((subject) => [subject.subjectKeySha256, subject]),
  );
  const neonBindings = neonPrincipals.flatMap((principal) =>
    principal.bindings
      .filter(
        (binding) =>
          binding.idpEnabled === true && binding.syncStatus === "synced",
      )
      .map((binding) => ({
        subjectKeySha256: identitySubjectKey(binding),
        principalId: principal.id,
        physicalPlane: "neon_admin" as const,
      })),
  );
  const meshBindings = meshPrincipals.flatMap((principal) =>
    principal.bindings
      .filter((binding) => binding.syncStatus === "synced")
      .map((binding) => ({
        subjectKeySha256: identitySubjectKey(binding),
        principalId: principal.id,
        physicalPlane: "mesh" as const,
      })),
  );
  const neonKeys = new Set(
    neonBindings.map((binding) => binding.subjectKeySha256),
  );
  const meshKeys = new Set(
    meshBindings.map((binding) => binding.subjectKeySha256),
  );
  const missingBindings = evidence.subjects.flatMap((subject) =>
    subject.expectedPlanes.flatMap((plane) => {
      const matched = plane === "mesh"
        ? meshKeys.has(subject.subjectKeySha256)
        : neonKeys.has(subject.subjectKeySha256);
      return matched
        ? []
        : [{ subjectKeySha256: subject.subjectKeySha256, plane }];
    }),
  );
  const unexpectedLocalBindings = [...neonBindings, ...meshBindings]
    .filter((binding) => {
      const subject = authorityByKey.get(binding.subjectKeySha256);
      if (!subject) return true;
      return binding.physicalPlane === "mesh"
        ? !subject.expectedPlanes.includes("mesh")
        : !subject.expectedPlanes.some(
            (plane) => plane === "neon" || plane === "admin",
          );
    })
    .sort((left, right) =>
      `${left.physicalPlane}:${left.subjectKeySha256}:${left.principalId}`
        .localeCompare(
          `${right.physicalPlane}:${right.subjectKeySha256}:${right.principalId}`,
        )
    );
  const expectedPlaneBindings = evidence.subjects.reduce(
    (count, subject) => count + subject.expectedPlanes.length,
    0,
  );
  const enabledAuthorityUsers = evidence.subjects.filter(
    (subject) => subject.subjectType === "user",
  ).length;
  const reconciliationCore = {
    enabledAuthoritySubjects: evidence.subjects.length,
    enabledAuthorityUsers,
    expectedPlaneBindings,
    matchedPlaneBindings: expectedPlaneBindings - missingBindings.length,
    activeNeonAdminLocalBindings: neonBindings.length,
    activeMeshLocalBindings: meshBindings.length,
    missingBindings,
    unexpectedLocalBindings,
    passed:
      evidence.subjects.length > 0 &&
      enabledAuthorityUsers > 0 &&
      missingBindings.length === 0 &&
      unexpectedLocalBindings.length === 0,
  };
  const gaps = [
    ...missingBindings.map((binding) => ({
      kind: "enabled_authority_subject_missing_plane_local_binding",
      subjectKeySha256: binding.subjectKeySha256,
      plane: binding.plane,
    })),
    ...unexpectedLocalBindings.map((binding) => ({
      kind: "active_plane_local_binding_missing_enabled_authority_subject",
      subjectKeySha256: binding.subjectKeySha256,
      principalId: binding.principalId,
      physicalPlane: binding.physicalPlane,
    })),
    ...(enabledAuthorityUsers === 0
      ? [{ kind: "enabled_authority_user_inventory_empty" }]
      : []),
  ];
  return {
    status: "captured" as const,
    schemaVersion: evidence.schemaVersion,
    evidenceId: evidence.evidenceId,
    generatedAt: evidence.generatedAt,
    source: evidence.source,
    subjects: evidence.subjects,
    hashes: evidence.hashes,
    reconciliation: {
      ...reconciliationCore,
      gaps,
      reconciliationSha256: hashCanonical(reconciliationCore),
    },
  };
}

function identitySubjectKey(binding: {
  realmKey: string;
  providerCode: string;
  subjectSha256: string;
}) {
  return hashCanonical({
    realmKey: binding.realmKey,
    providerCode: binding.providerCode,
    subjectSha256: binding.subjectSha256,
  });
}

function isCompleteCaptureBoundary(
  boundary: Awaited<ReturnType<typeof captureBoundary>>,
  expectedPlane: "neon" | "mesh",
) {
  const expectedContractVersion = expectedPlane === "mesh"
    ? "wave0.mesh-authz-capture.v1"
    : "wave0.authz-capture.v1";
  return (
    boundary.status === "captured" &&
    boundary.plane === expectedPlane &&
    boundary.has_capture_clock === true &&
    typeof boundary.source_database_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      boundary.source_database_id,
    ) &&
    boundary.capture_contract_version === expectedContractVersion &&
    typeof boundary.capture_installed_at === "string" &&
    !Number.isNaN(Date.parse(boundary.capture_installed_at)) &&
    typeof boundary.capture_watermark === "string" &&
    /^\d+$/.test(boundary.capture_watermark)
  );
}

function isMeshUserPrincipalType(principalType: string) {
  return ["participant_user", "platform_staff", "support_user"].includes(
    principalType,
  );
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sameStringSet(left: string[], right: string[]) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
  label: string,
) {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = allowedKeys.filter((key) => !(key in value));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(
      `${label} keys mismatch; missing=[${missing.join(",")}], unknown=[${unknown.join(",")}].`,
    );
  }
}

function requireStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requirePatternString(
  value: unknown,
  pattern: RegExp,
  label: string,
) {
  const text = requireNonEmptyString(value, label);
  if (!pattern.test(text)) throw new Error(`${label} has an invalid format.`);
  return text;
}

function requireSha256(value: unknown, label: string) {
  return requirePatternString(value, /^[0-9a-f]{64}$/, label);
}

function requireUuid(value: unknown, label: string) {
  return requirePatternString(
    value,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    label,
  );
}

function requirePlane(value: unknown, label: string): Plane {
  if (value !== "neon" && value !== "admin" && value !== "mesh") {
    throw new Error(`${label} must be neon, admin, or mesh.`);
  }
  return value;
}

function requireLegacyEngine(value: unknown, label: string): LegacyEngine {
  if (
    value !== "legacy_single" &&
    value !== "legacy_batch" &&
    value !== "legacy_admin" &&
    value !== "legacy_mesh"
  ) {
    throw new Error(`${label} is not a supported legacy engine.`);
  }
  return value;
}

function requireNullableString(value: unknown, label: string) {
  return value === null ? null : requireNonEmptyString(value, label);
}

function requireDateTime(value: unknown, label: string) {
  const text = requireNonEmptyString(value, label);
  if (Number.isNaN(Date.parse(text))) {
    throw new Error(`${label} must be an ISO date-time.`);
  }
  return text;
}

function gitRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unavailable";
  }
}

function gitWorkingTreeClean() {
  try {
    return execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 16 * 1024 * 1024,
      },
    ).trim().length === 0;
  } catch {
    return false;
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashCanonical(value: unknown) {
  return sha256(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
