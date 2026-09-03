#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Client } from "pg";
import {
  edgeKey,
  expectedMappedUserEdges,
  verifyDoubleApply,
  verifyProjectionRoleBehavior,
} from "./authorization-release-live.js";

type Plane = "studio" | "neon" | "mesh";
type Status = "pass" | "fail" | "not_run";
type Gate = { status: Status; summary: string; evidence?: unknown };

type ScopeContract = {
  defaultScopeBehavior: string;
  permissions: Array<{ permissionCode: string; scopes: Array<{ kind: string; propagation: string }> }>;
};
type Catalog = { permissions: Array<{ permissionId: string; canonicalCode: string; permissionKind: string; entity: string; operation: string }> };
type Pack = {
  planePack: Plane;
  authority: { version: string; roles: unknown[]; groups: Array<{ zeroGrant?: boolean }> };
  permissionCatalog: {
    operations: Array<{ permissionId: string; canonicalPermissionCode: string }>;
  };
  tenantAuthorityProjection: {
    definitions: {
      roles: Array<{ id: string; code: string }>;
      rolePermissions: Array<{ id: string; roleId: string; permissionId: string; permissionCode: string }>;
      principalGroups: Array<{ id: string; zeroGrant: boolean }>;
    };
    assignments: {
      groupMembers: Array<{ tenantId: string; groupId: string; principalId: string; keycloakSubject: string }>;
      groupRoles: Array<{ tenantId: string; groupId: string; roleId: string; scopeTargetId: string; propagationMode: string }>;
    };
  };
};
type OperationPublication = {
  authzEntityOperationBindings: Array<{
    entityCode: string;
    operationKey: string;
    permissionId: string;
    permissionCode: string;
  }>;
};
type GoldenCorpus = {
  cases: Array<{ name: string; permissionCode: string; expected: { allowed: boolean; reason?: string } }>;
};
type SeedContract = { runtimeOnlyRelations: string[]; reconciliationOnlyRelations: string[] };
type BusinessTableInventory = {
  mode: string;
  counts: { tables: number; masterTables: number; documentTables: number; meshTables?: number; reviewedTables: number; pendingReviewTables: number; roles: number; grants: number };
  releaseBlockers: string[];
};
type InventoryPromotionReport = { mode: string; ready: boolean; qualifiedPermissionCodes: string[]; blockers: string[] };

const planes: readonly Plane[] = ["studio", "neon", "mesh"];
const here = dirname(fileURLToPath(import.meta.url));
const dbRoot = resolve(here, "../../..");
const repositoryRoot = resolve(dbRoot, "../..");
const strict = process.argv.includes("--strict");
const applyTwiceRequested = process.argv.includes("--apply-twice");
const idempotencyOnly = process.argv.includes("--idempotency-only");
const liveRequested = process.argv.includes("--live") || applyTwiceRequested;

export async function buildAuthorizationReleaseGate(): Promise<{
  contractVersion: string;
  generatedAt: string;
  ready: boolean;
  gates: Record<string, Gate>;
}> {
  const scopes = {} as Record<Plane, ScopeContract>;
  const catalogs = {} as Record<Plane, Catalog>;
  const packs = {} as Record<Plane, Pack>;
  const hashEvidence: Record<string, unknown> = {};

  for (const plane of planes) {
    const catalogRoot = resolve(dbRoot, `seed/contracts/authorization/catalog/${plane}`);
    scopes[plane] = await json(resolve(catalogRoot, "scope-compatibility.v1.json"));
    catalogs[plane] = await json(resolve(catalogRoot, "catalog.v2.json"));
    const packRoot = resolve(dbRoot, `seed/packs/authorization-v2/${plane}`);
    packs[plane] = await json(resolve(packRoot, "seed-pack.v1.json"));
    const expected = (await readFile(resolve(packRoot, "seed-pack.sha256"), "utf8")).trim();
    const actual = sha256(canonical(packs[plane]));
    hashEvidence[plane] = { expected, actual, equal: expected === actual };
  }

  const publishedLegacy = planes.flatMap((plane) => [
    ...catalogs[plane].permissions.map((permission) => ({ plane, code: permission.canonicalCode, permissionId: permission.permissionId, source: "catalog-v2" })),
    ...packs[plane].permissionCatalog.operations.map((permission) => ({ plane, code: permission.canonicalPermissionCode, permissionId: permission.permissionId, source: "seed-pack" })),
    ...packs[plane].tenantAuthorityProjection.definitions.rolePermissions.map((grant) => ({ plane, code: grant.permissionCode, permissionId: grant.permissionId, source: "role-grant" })),
  ].filter((permission) => permission.code.startsWith("legacy.")));
  const legacySeedReferences = await legacyPermissionSeedReferences();
  const legacySeedRepublishRisk = legacySeedReferences.length > 0;
  const proposedCanonical = planes.flatMap((plane) => catalogs[plane].permissions
    .map((permission) => ({ plane, code: permission.canonicalCode, permissionId: permission.permissionId })));
  const genericCanonical = proposedCanonical.filter((permission) => isGenericAction(permission.code));

  const missingScope: Array<{ plane: Plane; permissionCode: string; reason: string }> = [];
  for (const plane of planes) {
    const declared = new Map(scopes[plane].permissions.map((permission) => [permission.permissionCode, permission.scopes]));
    const required = new Set(catalogs[plane].permissions.map((permission) => permission.canonicalCode));
    if (scopes[plane].defaultScopeBehavior !== "deny_undeclared") {
      missingScope.push({ plane, permissionCode: "*", reason: "default behavior is not deny_undeclared" });
    }
    for (const permissionCode of required) {
      const declaration = declared.get(permissionCode);
      if (!declaration?.length) missingScope.push({ plane, permissionCode, reason: "missing or empty declaration" });
      else if (declaration.some((scope) => !scope.kind || !["exact", "subtree", "member_companies", "relationship_participants"].includes(scope.propagation))) {
        missingScope.push({ plane, permissionCode, reason: "invalid scope kind or propagation" });
      }
    }
  }

  const invalidRoleReferences = planes.flatMap((plane) => {
    const roleIds = new Set(packs[plane].tenantAuthorityProjection.definitions.roles.map((role) => role.id));
    const published = new Map(packs[plane].permissionCatalog.operations
      .map((permission) => [permission.permissionId, permission.canonicalPermissionCode] as const));
    return packs[plane].tenantAuthorityProjection.definitions.rolePermissions.flatMap((grant) => {
      const reasons: string[] = [];
      if (!roleIds.has(grant.roleId)) reasons.push("role_missing_from_pack");
      if (published.get(grant.permissionId) !== grant.permissionCode) reasons.push("permission_not_in_published_snapshot");
      if (grant.permissionCode.startsWith("legacy.")) reasons.push("legacy_permission");
      if (isGenericAction(grant.permissionCode)) reasons.push("generic_action_permission");
      return reasons.length ? [{ plane, grantId: grant.id, permissionCode: grant.permissionCode, reasons }] : [];
    });
  });

  const operationPublications = Object.fromEntries(await Promise.all(planes.map(async (plane) => [
    plane,
    await json<OperationPublication>(resolve(dbRoot, `seed/contracts/authorization/catalog/${plane}/operation-bindings.v1.json`)),
  ]))) as Record<Plane, OperationPublication>;
  const operationCoordinates = new Map<string, Set<string>>();
  for (const plane of planes) {
    for (const binding of operationPublications[plane].authzEntityOperationBindings) {
      const coordinate = `${plane}:${binding.entityCode}:${binding.operationKey}`;
      const values = operationCoordinates.get(coordinate) ?? new Set<string>();
      values.add(`${binding.permissionId}:${binding.permissionCode}`);
      operationCoordinates.set(coordinate, values);
    }
  }
  const ambiguousBindings = [...operationCoordinates]
    .filter(([, permissions]) => permissions.size !== 1)
    .map(([coordinate, permissions]) => ({ coordinate, permissions: [...permissions] }));
  const rejectedBindings = planes.flatMap((plane) => operationPublications[plane].authzEntityOperationBindings.flatMap((binding) => {
    const permission = catalogs[plane].permissions.find((item) => item.canonicalCode === binding.permissionCode);
    return binding.permissionCode.startsWith("legacy.") || isGenericAction(binding.permissionCode)
      || !permission || permission.permissionId !== binding.permissionId
      || permission.entity !== binding.entityCode || permission.operation !== binding.operationKey
      ? [{ plane, binding }]
      : [];
  }));
  const missingOperationBindings = planes.flatMap((plane) => catalogs[plane].permissions
    .filter((permission) => permission.permissionKind === "entity_operation")
    .filter((permission) => !operationCoordinates.has(`${plane}:${permission.entity}:${permission.operation}`))
    .map((permission) => ({ plane, permissionCode: permission.canonicalCode })));

  const protectedWrites = await productionProtectedWrites();
  const applicationDemand = await productionPermissionDemand(catalogs);
  const neonTableInventory = await json<BusinessTableInventory>(resolve(
    dbRoot,
    "seed/contracts/authorization/inventory/neon/compiled/table-authorization-coverage.v1.json",
  ));
  const meshTableInventory = await json<BusinessTableInventory>(resolve(
    dbRoot,
    "seed/contracts/authorization/inventory/mesh/compiled/table-authorization-coverage.v1.json",
  ));
  const neonPromotion = await json<InventoryPromotionReport>(resolve(dbRoot, "seed/contracts/authorization/inventory/neon/promotion/promotion-report.v1.json"));
  const meshPromotion = await json<InventoryPromotionReport>(resolve(dbRoot, "seed/contracts/authorization/inventory/mesh/promotion/promotion-report.v1.json"));
  const golden = await json<GoldenCorpus>(resolve(
    repositoryRoot,
    "server/packages/platform/iam/src/__fixtures__/authorization-golden-corpus.v1.json",
  ));
  const failClosed = [
    { token: "cross tenant", reason: "tenant_boundary_failed" },
    { token: "ambiguous alias", reason: "missing_permission" },
    { token: "expired", reason: "missing_permission" },
    { token: "generic mutation", reason: "missing_permission" },
  ].map((required) => ({
    ...required,
    found: golden.cases.some((item) => item.name.includes(required.token)
      && item.expected.allowed === false && item.expected.reason === required.reason),
  }));
  const cleanSlateViolations = planes.flatMap((plane) => {
    const pack = packs[plane];
    const violations: string[] = [];
    if (pack.authority.version !== "authorization.clean-slate.v1") violations.push("authority_version");
    if (pack.authority.roles.length !== 0) violations.push("authority_roles_present");
    if (pack.authority.groups.length !== 1 || pack.authority.groups[0]?.zeroGrant !== true) violations.push("quarantine_group_invalid");
    if (pack.tenantAuthorityProjection.definitions.roles.length !== 0) violations.push("materialized_roles_present");
    if (pack.tenantAuthorityProjection.definitions.rolePermissions.length !== 0) violations.push("role_grants_present");
    if (pack.tenantAuthorityProjection.assignments.groupRoles.length !== 0) violations.push("group_role_assignments_present");
    if (pack.tenantAuthorityProjection.definitions.principalGroups.some((group) => !group.zeroGrant)) violations.push("non_quarantine_group_present");
    return violations.map((violation) => ({ plane, violation }));
  });

  const gates: Record<string, Gate> = {
    noPublishedLegacyPermissions: result(publishedLegacy.length === 0 && !legacySeedRepublishRisk,
      publishedLegacy.length === 0 && !legacySeedRepublishRisk
        ? "Canonical catalogs, generated packs, role grants, and active DDL contain no legacy permission publisher."
        : `${publishedLegacy.length} generated legacy permission reference(s); ${legacySeedReferences.length} active DDL legacy publisher reference(s).`,
      { publishedLegacy: publishedLegacy.slice(0, 20), legacySeedRepublishRisk, legacySeedReferences }),
    noGenericCanonicalActionPermissions: result(genericCanonical.length === 0,
      genericCanonical.length === 0 ? "Canonical v2 catalogs contain no generic action.<verb> permission." : `${genericCanonical.length} generic canonical permission(s) found.`,
      genericCanonical),
    explicitScopeCompatibility: result(missingScope.length === 0,
      missingScope.length === 0 ? "Every catalog-v2 permission has an explicit deny-by-default scope declaration." : `${missingScope.length} permission scope declaration issue(s) found.`,
      missingScope.slice(0, 30)),
    activeRolesUsePublishedCanonicalPermissions: result(invalidRoleReferences.length === 0,
      invalidRoleReferences.length === 0 ? "All generated role grants resolve to generated canonical permissions." : `${invalidRoleReferences.length} generated role grant(s) are not published canonical authority.`,
      invalidRoleReferences.slice(0, 30)),
    operationBindingCardinality: result(ambiguousBindings.length === 0 && rejectedBindings.length === 0 && missingOperationBindings.length === 0,
      ambiguousBindings.length === 0 && rejectedBindings.length === 0 && missingOperationBindings.length === 0
        ? "Every catalog entity operation resolves to exactly one canonical lifecycle binding."
        : `${missingOperationBindings.length} entity-operation permission(s) are unbound; ${ambiguousBindings.length} ambiguous and ${rejectedBindings.length} invalid binding(s).`,
      { ambiguousBindings, rejectedBindings, missingOperationBindings }),
    applicationPermissionDemandCoverage: result(
      applicationDemand.unqualified.length === 0 && applicationDemand.missingCanonical.length === 0 && applicationDemand.dynamic.length === 0,
      applicationDemand.unqualified.length === 0 && applicationDemand.missingCanonical.length === 0 && applicationDemand.dynamic.length === 0
        ? "Every statically discoverable application permission demand resolves to one plane catalog."
        : `${applicationDemand.unqualifiedCodes.length} unqualified code(s) across ${applicationDemand.unqualified.length} reference(s), ${applicationDemand.missingCanonicalCodes.length} unpublished canonical code(s), and ${applicationDemand.dynamic.length} dynamic demand(s) require review.`,
      applicationDemand,
    ),
    neonPhysicalTableAuthorizationCoverage: result(
      neonTableInventory.mode === "inventory_only_non_enforcing"
        && neonTableInventory.counts.pendingReviewTables === 0
        && neonTableInventory.releaseBlockers.length === 0
        && neonTableInventory.counts.roles === 0
        && neonTableInventory.counts.grants === 0,
      neonTableInventory.counts.pendingReviewTables === 0 && neonTableInventory.releaseBlockers.length === 0
        ? `All ${neonTableInventory.counts.tables} Neon master/document tables have reviewed authorization ownership and no implementation qualification blocker remains.`
        : `${neonTableInventory.counts.pendingReviewTables} of ${neonTableInventory.counts.tables} Neon master/document tables still require authorization review; ${neonTableInventory.releaseBlockers.length - neonTableInventory.counts.pendingReviewTables} implementation qualification blocker(s) remain.`,
      { counts: neonTableInventory.counts, releaseBlockers: neonTableInventory.releaseBlockers.slice(0, 30) },
    ),
    meshPhysicalTableAuthorizationCoverage: result(
      meshTableInventory.mode === "inventory_only_non_enforcing"
        && meshTableInventory.counts.pendingReviewTables === 0
        && meshTableInventory.releaseBlockers.length === 0
        && meshTableInventory.counts.roles === 0
        && meshTableInventory.counts.grants === 0,
      meshTableInventory.counts.pendingReviewTables === 0 && meshTableInventory.releaseBlockers.length === 0
        ? `All ${meshTableInventory.counts.tables} Mesh master/document/network tables have reviewed authorization ownership and no implementation or RLS qualification blocker remains.`
        : `${meshTableInventory.counts.pendingReviewTables} of ${meshTableInventory.counts.tables} Mesh master/document/network tables still require authorization review; ${meshTableInventory.releaseBlockers.length - meshTableInventory.counts.pendingReviewTables} implementation/RLS qualification blocker(s) remain.`,
      { counts: meshTableInventory.counts, releaseBlockers: meshTableInventory.releaseBlockers.slice(0, 30) },
    ),
    inventoryPermissionPromotionQualification: result(
      neonPromotion.mode === "candidate_only_non_enforcing" && meshPromotion.mode === "candidate_only_non_enforcing" && neonPromotion.ready && meshPromotion.ready,
      neonPromotion.ready && meshPromotion.ready
        ? "Every reviewed Neon and Mesh operation passed lifecycle, scope, assurance, and writer-ownership qualification."
        : `${neonPromotion.blockers.length} Neon and ${meshPromotion.blockers.length} Mesh promotion blocker(s) remain; seed-pack promotion is prohibited.`,
      { neon: neonPromotion, mesh: meshPromotion },
    ),
    productionSeedsDoNotWriteRuntimeEvidence: result(protectedWrites.runtime.length === 0,
      protectedWrites.runtime.length === 0 ? "Production SQL seeds write no delegations, grants, denies, overrides, ACLs, or trusted devices." : `${protectedWrites.runtime.length} runtime-only authorization write(s) found.`,
      protectedWrites.runtime),
    projectionRowsAreReconcilerOwned: protectedWrites.projection.length === 0
      ? { status: "not_run", summary: "Static seeds are clean; proving row provenance requires --live." }
      : result(false, `${protectedWrites.projection.length} static application-projection write(s) found.`, protectedWrites.projection),
    planePackDoubleApplyIsNoOp: { status: "not_run", summary: "Requires explicit write-based verification with --apply-twice and plane admin URLs." },
    deterministicPlanePackHashes: result(Object.values(hashEvidence).every((item) => (item as { equal: boolean }).equal),
      "Compared canonical pack content against checked-in SHA-256 receipts.", hashEvidence),
    cleanSlateQuarantineBaseline: result(cleanSlateViolations.length === 0,
      cleanSlateViolations.length === 0
        ? "All three generated packs retain admission identities only in zero-grant quarantine and contain no allow edge."
        : `${cleanSlateViolations.length} clean-slate quarantine invariant(s) failed.`,
      cleanSlateViolations),
    failClosedEvaluatorCorpus: result(failClosed.every((item) => item.found),
      failClosed.every((item) => item.found) ? "Golden evaluator corpus covers all four required fail-closed boundaries." : "Golden evaluator corpus is missing required fail-closed cases.",
      failClosed),
  };

  if (liveRequested) await addLiveEvidence(gates, packs);
  const deferredStaticGates = new Set(["projectionRowsAreReconcilerOwned", "planePackDoubleApplyIsNoOp"]);
  return {
    contractVersion: "athyper.authorization.release-validation-gates.v1",
    generatedAt: new Date().toISOString(),
    ready: Object.entries(gates).every(([name, gate]) => gate.status === "pass"
      || (!liveRequested && deferredStaticGates.has(name) && gate.status === "not_run")),
    gates,
  };
}

async function addLiveEvidence(
  gates: Record<string, Gate>,
  packs: Record<Plane, Pack>,
): Promise<void> {
  const { Client } = await import("pg");
  const environment: Record<Plane, string[]> = {
    studio: ["ATHYPER_PLATFORM_DATABASE_ADMIN_URL", "ATHYPER_PLATFORM_DATABASE_URL"],
    neon: ["ATHYPER_NEON_DATABASE_ADMIN_URL", "ATHYPER_NEON_DATABASE_URL", "DATABASE_ADMIN_URL", "DATABASE_URL"],
    mesh: ["ATHYPER_MESH_DATABASE_ADMIN_URL", "ATHYPER_MESH_DATABASE_URL", "MESH_DATABASE_ADMIN_URL", "MESH_DATABASE_URL"],
  };
  const evidence: Record<string, unknown> = {};
  let legacy = 0;
  let invalidRoles = 0;
  let invalidBindings = 0;
  let invalidProjectionProvenance = 0;
  let invalidProjectionSecurity = 0;
  let parityMismatch = 0;
  let residualAuthorityRows = 0;
  const urls = {} as Record<Plane, string>;
  for (const plane of planes) {
    const key = environment[plane].find((name) => process.env[name]?.trim());
    if (!key) throw new Error(`${plane} live release validation requires one of ${environment[plane].join(", ")}`);
    urls[plane] = process.env[key]!.trim();
    const client = new Client({ connectionString: urls[plane] });
    await client.connect();
    try {
      const counts = await client.query<{
        legacy: string; invalid_roles: string; invalid_bindings: string; invalid_projection_provenance: string;
        residual_authority_rows: string;
      }>(`SELECT
        (SELECT count(*) FROM authz.permission WHERE status='published' AND canonical_code LIKE 'legacy.%')::text AS legacy,
        (SELECT count(*) FROM authz.role_permission rp JOIN authz.role r ON r.tenant_id=rp.tenant_id AND r.id=rp.role_id LEFT JOIN authz.permission p ON p.id=rp.permission_id WHERE r.status='active' AND (p.id IS NULL OR p.status<>'published' OR p.canonical_code LIKE 'legacy.%'))::text AS invalid_roles,
        (SELECT count(*) FROM (SELECT source_entity_operation_id FROM authz.entity_operation_binding WHERE status='published' GROUP BY source_entity_operation_id HAVING count(DISTINCT permission_id)<>1) x)::text AS invalid_bindings,
        ((SELECT count(*) FROM authz.application_projection WHERE source_projection_id IS NULL OR source_version<1 OR source_hash IS NULL)
          +(SELECT count(*) FROM authz.projection_provider WHERE source_provider_id IS NULL OR source_version<1)
          +(SELECT count(*) FROM authz.projection_scope WHERE source_scope_id IS NULL OR source_version<1))::text AS invalid_projection_provenance,
        ((SELECT count(*) FROM authz.role)
          +(SELECT count(*) FROM authz.role_permission)
          +(SELECT count(*) FROM authz.group_role)
          +(SELECT count(*) FROM authz.deny_rule)
          +(SELECT count(*) FROM authz.delegation)
          +(SELECT count(*) FROM authz.delegation_grant)
          +(SELECT count(*) FROM authz.override)
          +(SELECT count(*) FROM authz.record_acl))::text AS residual_authority_rows`);
      const row = counts.rows[0]!;
      legacy += Number(row.legacy);
      invalidRoles += Number(row.invalid_roles);
      invalidBindings += Number(row.invalid_bindings);
      invalidProjectionProvenance += Number(row.invalid_projection_provenance);
      residualAuthorityRows += Number(row.residual_authority_rows);
      const security = await client.query<{ invalid: string }>(`SELECT (
        (SELECT count(*) FROM pg_roles WHERE rolname IN ('athyper_projection_applier','athyper_projection_owner','athyper_projection_breakglass') AND (rolcanlogin OR rolsuper OR rolbypassrls))
        +(SELECT count(*) FROM pg_roles WHERE rolname='athyperadmin' AND (rolsuper OR rolbypassrls))
        +(SELECT count(*) FROM (VALUES ('authz.application_projection'),('authz.projection_provider'),('authz.projection_scope'),('authz.entity_operation_binding'),('authz.entity_operation_scope_binding')) relation(name)
           WHERE has_table_privilege('athyper_projection_applier',relation.name,'INSERT') OR has_table_privilege('athyper_projection_applier',relation.name,'UPDATE') OR has_table_privilege('athyper_projection_applier',relation.name,'DELETE')
              OR NOT has_table_privilege('athyper_projection_owner',relation.name,'SELECT,INSERT,UPDATE,DELETE'))
        +(SELECT count(*) FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
           WHERE namespace.nspname='authz' AND relation.relname IN ('application_projection','projection_provider','projection_scope','entity_operation_binding','entity_operation_scope_binding') AND NOT relation.relforcerowsecurity)
        +(SELECT count(*) FROM pg_proc routine JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
           WHERE namespace.nspname='authz' AND routine.proname IN ('fn_stage_application_projection','fn_activate_application_projection','fn_stage_entity_operation_projection','fn_activate_entity_operation_projection','fn_retire_entity_operation_projection','fn_restore_entity_operation_projection')
             AND pg_get_userbyid(routine.proowner)<>'athyper_projection_owner')
        +(SELECT count(*) FROM pg_policies WHERE schemaname='authz' AND tablename IN ('application_projection','projection_provider','projection_scope','entity_operation_binding','entity_operation_scope_binding')
           AND cmd IN ('ALL','INSERT','UPDATE','DELETE') AND (roles && ARRAY['current_user','athyperadmin']::name[] OR NOT (roles && ARRAY['athyper_projection_owner','athyper_projection_breakglass']::name[])))
        +(SELECT CASE WHEN count(*)=10 THEN 0 ELSE 1 END FROM pg_policies
           WHERE schemaname='authz' AND tablename IN ('application_projection','projection_provider','projection_scope','entity_operation_binding','entity_operation_scope_binding')
             AND cmd='ALL' AND (policyname LIKE '%_owner_write' OR policyname LIKE '%_breakglass_write'))
      )::text AS invalid`);
      const roleBehavior = await verifyProjectionRoleBehavior(client);
      const planeSecurityViolations = Number(security.rows[0]?.invalid ?? 1) + roleBehavior.violations;
      invalidProjectionSecurity += planeSecurityViolations;
      const expectedEdges = expectedMappedUserEdges(packs[plane]);
      const actualRows = await client.query<{
        tenantId: string; subject: string; permissionId: string; scopeTargetId: string; propagationMode: string;
      }>(`SELECT gm.tenant_id::text AS "tenantId",binding.subject_id AS subject,rp.permission_id::text AS "permissionId",gr.scope_target_id::text AS "scopeTargetId",gr.propagation_mode AS "propagationMode"
          FROM authz.group_member gm
          JOIN master.principal_identity_binding binding ON binding.tenant_id=gm.tenant_id AND binding.principal_id=gm.principal_id AND binding.provider_code='keycloak' AND binding.status='active'
          JOIN authz.group_role gr ON gr.tenant_id=gm.tenant_id AND gr.group_id=gm.group_id AND gr.status='active' AND gr.effective_from<=now() AND (gr.effective_until IS NULL OR gr.effective_until>now())
          JOIN authz.role r ON r.tenant_id=gr.tenant_id AND r.id=gr.role_id AND r.status='active'
          JOIN authz.role_permission rp ON rp.tenant_id=r.tenant_id AND rp.role_id=r.id
          JOIN authz.permission p ON p.id=rp.permission_id AND p.status='published'
         WHERE gm.status='active' AND gm.effective_from<=now() AND (gm.effective_until IS NULL OR gm.effective_until>now())
         ORDER BY 1,2,3,4,5`);
      const actualEdges = actualRows.rows.map(edgeKey).sort();
      const expectedHash = sha256(canonical(expectedEdges));
      const actualHash = sha256(canonical(actualEdges));
      if (expectedHash !== actualHash) parityMismatch++;
      evidence[plane] = { ...row, projectionSecurityViolations: planeSecurityViolations, projectionRoleBehavior: roleBehavior, mappedUserParity: { expectedEdges: expectedEdges.length, actualEdges: actualEdges.length, expectedHash, actualHash, equal: expectedHash === actualHash } };
    } finally {
      await client.end();
    }
  }
  gates.noPublishedLegacyPermissions = result(legacy === 0, `${legacy} live published legacy permission(s) across all planes.`, evidence);
  gates.activeRolesUsePublishedCanonicalPermissions = result(invalidRoles === 0, `${invalidRoles} live active role grant(s) have invalid permission authority.`, evidence);
  gates.operationBindingCardinality = result(invalidBindings === 0, `${invalidBindings} live published operation coordinate(s) do not resolve exactly once.`, evidence);
  gates.projectionRowsAreReconcilerOwned = result(invalidProjectionProvenance === 0 && invalidProjectionSecurity === 0,
    `${invalidProjectionProvenance} live projection row(s) lack reconciliation source provenance; ${invalidProjectionSecurity} projection ownership violation(s).`, evidence);
  gates.cleanSlateQuarantineBaseline = result(
    parityMismatch === 0 && residualAuthorityRows === 0,
    parityMismatch > 0
      ? `${parityMismatch} plane(s) still expose mapped-user authorization edges.`
      : residualAuthorityRows === 0
        ? "All three live planes contain quarantine membership but no roles, grants, delegations, overrides, ACLs, or denies."
        : `${residualAuthorityRows} residual authority row(s) remain across the live planes.`,
    evidence,
  );
  if (applyTwiceRequested) gates.planePackDoubleApplyIsNoOp = await verifyDoubleApply(urls);
}

async function productionProtectedWrites(): Promise<{ runtime: unknown[]; projection: unknown[] }> {
  const contract = await json<SeedContract>(resolve(dbRoot, "seed/contracts/base/seed-contract.v1.json"));
  const runtime = new Set(contract.runtimeOnlyRelations.map((value) => value.toLowerCase()));
  const projection = new Set(contract.reconciliationOnlyRelations.map((value) => value.toLowerCase()));
  const output = { runtime: [] as unknown[], projection: [] as unknown[] };
  const files = (await walk(resolve(dbRoot, "seed"))).filter((path) => extname(path) === ".sql");
  const pattern = /\b(insert\s+into|update(?!\s+set\b)|delete\s+from|merge\s+into|copy|truncate(?:\s+table)?)\s+(?:only\s+)?"?([a-z_][a-z0-9_]*)"?\s*\.\s*"?([a-z_][a-z0-9_]*)"?/gi;
  for (const path of files) {
    const source = await readFile(path, "utf8");
    if (!/^\s*--\s*seed-data-class:\s*production_reference\s*$/im.test(source)) continue;
    const structural = source.replace(/--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'/g, (value) => value.replace(/[^\r\n]/g, " "));
    for (const match of structural.matchAll(pattern)) {
      const relation = `${match[2]}.${match[3]}`.toLowerCase();
      const finding = { path: path.replace(`${dbRoot}\\`, "").replace(/\\/g, "/"), relation, operation: match[1] };
      if (runtime.has(relation)) output.runtime.push(finding);
      if (projection.has(relation)) output.projection.push(finding);
    }
  }
  return output;
}

async function legacyPermissionSeedReferences(): Promise<Array<{ path: string; permissionCode: string }>> {
  const references: Array<{ path: string; permissionCode: string }> = [];
  const files = (await walk(resolve(dbRoot, "ddl"))).filter((path) => extname(path) === ".sql");
  const exactLegacyLiteral = /['"](legacy\.[a-z0-9_.-]+)['"]/gi;
  for (const path of files) {
    const source = await readFile(path, "utf8");
    for (const match of source.matchAll(exactLegacyLiteral)) {
      references.push({
        path: path.replace(`${dbRoot}\\`, "").replace(/\\/g, "/"),
        permissionCode: match[1]!.toLowerCase(),
      });
    }
  }
  return references;
}

async function productionPermissionDemand(catalogs: Record<Plane, Catalog>): Promise<{
  discovered: number;
  unqualifiedCodes: string[];
  missingCanonicalCodes: string[];
  covered: Array<{ permissionCode: string; path: string; line: number }>;
  unqualified: Array<{ permissionCode: string; path: string; line: number }>;
  missingCanonical: Array<{ permissionCode: string; path: string; line: number }>;
  dynamic: Array<{ path: string; line: number; expression: string }>;
}> {
  const known = new Set(planes.flatMap((plane) => catalogs[plane].permissions.map((permission) => permission.canonicalCode)));
  const roots = ["apps", "packages", "server/apps", "server/packages", "tools/scripts"].map((path) => resolve(repositoryRoot, path));
  const files = (await Promise.all(roots.map(walk))).flat().filter((path) =>
    /\.(?:ts|tsx|js|mjs)$/.test(path)
    && !/[\\/](?:__tests__|__fixtures__|node_modules|dist|coverage)[\\/]/.test(path)
    && !/\.(?:test|spec|d)\.(?:ts|tsx|js|mjs)$/.test(path));
  const operationTokens = new Set([
    "activate", "allocate", "approve", "archive", "assign", "attach", "break_glass", "cancel", "comment", "complete",
    "create", "deactivate", "delete", "download", "edit", "execute", "export", "grant", "list", "manage", "publish",
    "read", "reconcile", "reject", "replay", "resolve", "restore", "retry", "revoke", "rollback", "search", "share",
    "submit", "transition", "update", "verify", "view", "withdraw",
  ]);
  const findings = new Map<string, { permissionCode: string; path: string; line: number }>();
  const dynamic: Array<{ path: string; line: number; expression: string }> = [];
  for (const path of files) {
    const source = await readFile(path, "utf8");
    const relativePath = path.replace(`${repositoryRoot}\\`, "").replace(/\\/g, "/");
    const literal = /(['"`])([a-z][a-z0-9_.-]{2,126})\1/g;
    for (const match of source.matchAll(literal)) {
      const permissionCode = match[2]!;
      if (!permissionCode.includes(".") || !operationTokens.has(permissionCode.split(".").at(-1)!)) continue;
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      findings.set(`${permissionCode}:${relativePath}:${line}`, { permissionCode, path: relativePath, line });
    }
    const dynamicPermission = /\bpermission(?:Code)?\s*:\s*`([^`]*\$\{[^`]*)`/g;
    for (const match of source.matchAll(dynamicPermission)) {
      dynamic.push({
        path: relativePath,
        line: source.slice(0, match.index).split(/\r?\n/).length,
        expression: match[1]!.slice(0, 160),
      });
    }
  }
  const covered = [...findings.values()].filter((finding) => known.has(finding.permissionCode));
  const unqualified = [...findings.values()].filter((finding) => !/^(?:studio|neon|mesh)\./.test(finding.permissionCode));
  const missingCanonical = [...findings.values()].filter((finding) => /^(?:studio|neon|mesh)\./.test(finding.permissionCode) && !known.has(finding.permissionCode));
  return {
    discovered: findings.size,
    covered,
    unqualifiedCodes: [...new Set(unqualified.map((finding) => finding.permissionCode))].sort(),
    missingCanonicalCodes: [...new Set(missingCanonical.map((finding) => finding.permissionCode))].sort(),
    unqualified,
    missingCanonical,
    dynamic,
  };
}

function result(pass: boolean, summary: string, evidence?: unknown): Gate {
  return { status: pass ? "pass" : "fail", summary, ...(evidence === undefined ? {} : { evidence }) };
}
function isGenericAction(code: string): boolean {
  return /^(?:studio|neon|mesh)?\.?action\.[a-z][a-z0-9_]*$/i.test(code);
}
async function json<T>(path: string): Promise<T> {
  return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")) as T;
}
async function walk(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

async function main(): Promise<void> {
  const report = await buildAuthorizationReleaseGate();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const strictPass = idempotencyOnly
    ? report.gates.planePackDoubleApplyIsNoOp?.status === "pass"
    : report.ready;
  if (strict && !strictPass) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
