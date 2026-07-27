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
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import pg from "pg";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface PrincipalRow {
  id: string;
  tenant_id: string;
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

const neonUrl = process.env.DATABASE_URL?.trim();
if (!neonUrl) throw new Error("DATABASE_URL is required.");
const meshUrl = process.env.MESH_DATABASE_URL?.trim();
const strict = process.argv.includes("--strict");
const outputArgument = valueArgument("--output=");
const outputPath = resolve(
  outputArgument ?? "artifacts/authorization-wave0/golden-decision-corpus.json",
);
const catalogPath = resolve(
  process.cwd(),
  valueArgument("--catalog=") ??
    "config/governance/authorization-high-risk-action-catalog.v1.json",
);
const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as Json;
const repositoryRevision = gitRevision();

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
      classification: null,
      approval: "pending",
    }));
  const missingIdentityBindings = principals
    .filter((principal) => principal.bindings.length === 0)
    .map((principal) => principal.id);
  const unmappedActions = actions
    .filter((action) => action.operations.length === 0)
    .map((action) => action.code);
  const requiredContextClasses = (
    catalog as { requiredContextClasses?: string[] }
  ).requiredContextClasses ?? [];
  const capturedContextClasses = ["tenant_capability"];
  const missingContextClasses = requiredContextClasses.filter(
    (context) => !capturedContextClasses.includes(context),
  );
  const expectedCases = principals.length * actions.length;
  const gates = {
    everyActiveNeonPrincipalIncluded:
      new Set(cases.map((item) => item.principalId)).size === principals.length,
    everyHighRiskActionIncluded:
      new Set(cases.map((item) => item.permissionId)).size === actions.length,
    exactNeonPrincipalActionCrossProduct: cases.length === expectedCases,
    everyActivePrincipalHasIdentityBinding: missingIdentityBindings.length === 0,
    everyActionMappedOrClassified: unmappedActions.length === 0,
    allRequiredContextClassesCaptured: missingContextClasses.length === 0,
    allLegacyEngineDisagreementsClassified:
      engineDisagreements.every((item) => item.classification !== null),
    meshCorpusCaptured: mesh !== null,
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
    ...missingContextClasses.map((contextClass) => ({
      kind: "required_context_not_captured_by_baseline_exporter",
      contextClass,
    })),
    ...(mesh
      ? []
      : [{ kind: "mesh_database_not_captured", requiredEnvironment: "MESH_DATABASE_URL" }]),
  ];

  const report = {
    schemaVersion: 1,
    readOnly: true,
    capture: {
      generatedAt: new Date().toISOString(),
      repositoryRevision,
      catalogPath,
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
    actions,
    cases,
    engineDisagreements,
    coverage: {
      expectedNeonPrincipalActionCases: expectedCases,
      capturedNeonPrincipalActionCases: cases.length,
      activeNeonPrincipals: principals.length,
      activeMeshPrincipals: meshPrincipals.length,
      highRiskActions: actions.length,
      missingIdentityBindings,
      unmappedActions,
      capturedContextClasses,
      missingContextClasses,
      gates,
      gaps,
    },
    hashes: {
      catalogSha256: hashCanonical(catalog),
      identitySha256: hashCanonical({
        neon: principals,
        mesh: meshPrincipals,
      }),
      actionsSha256: hashCanonical(actions),
      casesSha256: hashCanonical(cases),
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
      to_regclass('event.authorization_capture_clock') IS NOT NULL AS has_capture_clock
  `);
  const boundary = result.rows[0];
  const captureWatermark = boundary.has_capture_clock
    ? (await client.query<{ current_watermark: string }>(`
        SELECT current_watermark::text
        FROM event.authorization_capture_clock
        WHERE singleton_id = 1
      `)).rows[0]?.current_watermark ?? null
    : null;
  return {
    plane,
    status: "captured",
    database_name: boundary.database_name,
    database_oid: boundary.database_oid,
    wal_lsn: boundary.wal_lsn,
    snapshot_id: boundary.snapshot_id,
    captured_at: boundary.captured_at,
    capture_watermark: captureWatermark,
  };
}

function redactPrincipal(row: PrincipalRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
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

function gitRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unavailable";
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
