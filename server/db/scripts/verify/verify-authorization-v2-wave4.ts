#!/usr/bin/env tsx
/**
 * Static Wave 4 evaluator, entitlement, and exception-migration gate.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const databaseRoot = resolve(here, "../..");
const repositoryRoot = resolve(databaseRoot, "../..");

let failures = 0;
function expect(condition: unknown, message: string): void {
  if (condition) process.stdout.write(`PASS ${message}\n`);
  else {
    failures += 1;
    process.stderr.write(`FAIL ${message}\n`);
  }
}
async function text(path: string): Promise<string> {
  return readFile(resolve(repositoryRoot, path), "utf8");
}
async function json<T>(path: string): Promise<T> {
  return JSON.parse(await text(path)) as T;
}

const semantic = await json<{
  contractVersion: string;
  decisionModes: string[];
  evaluationOrder: string[];
  rules: Record<string, string>;
  scopeAlgebra: Record<string, string>;
  capabilityStatus: Record<string, string>;
}>("server/db/seed/contracts/authorization/evaluator/authorization-evaluator-semantic-contract.v1.json");
expect(
  semantic.contractVersion === "wave4.canonical-evaluator.v1",
  "shared evaluator contract version is exact",
);
expect(
  JSON.stringify(semantic.decisionModes) === JSON.stringify([
    "entity_resource",
    "registered_capability",
    "collection",
  ]),
  "the three typed decision modes are sealed",
);
expect(
  semantic.evaluationOrder.indexOf("physical_entitlement")
    < semantic.evaluationOrder.indexOf("principal_or_active_group_deny")
  && semantic.evaluationOrder.indexOf("physical_entitlement")
    < semantic.evaluationOrder.indexOf("independent_allow_paths"),
  "entitlement precedes every deny and allow path",
);
expect(
  semantic.scopeAlgebra["withinProofPath"] === "intersection"
  && semantic.scopeAlgebra["betweenProofPaths"] === "union"
  && semantic.scopeAlgebra["collectionDeny"] === "subtraction",
  "scope algebra is intersection, union, and deny subtraction",
);
expect(
  semantic.rules["inactiveGroup"] === "activates_neither_allow_nor_deny",
  "inactive group activates neither allow nor deny",
);
expect(
  semantic.capabilityStatus["recordAcl"]
    === "shadow_not_enforced_until_wave5_consumers_move"
  && semantic.capabilityStatus["delegation"]
    === "shadow_not_enforced_until_wave5_consumers_move",
  "ACL and delegation remain explicitly shadow-only until Wave 5",
);

const typesSource = await text(
  "server/packages/services/iam/authorization-evaluator/types.ts",
);
const evaluatorSource = await text(
  "server/packages/services/iam/authorization-evaluator/evaluator.ts",
);
const scopeSource = await text(
  "server/packages/services/iam/authorization-evaluator/scope.ts",
);
const repositorySource = await text(
  "server/packages/services/iam/authorization-evaluator/repository-contracts.ts",
);
const serviceSource = await text(
  "server/packages/services/iam/authorization-evaluator/exception-services.ts",
);
const testSource = await text(
  "server/packages/services/iam/authorization-evaluator/__tests__/canonical-evaluator.test.ts",
);
const canonicalSource = [
  typesSource,
  evaluatorSource,
  scopeSource,
  repositorySource,
  serviceSource,
].join("\n");

expect(
  !/\b(?:kysely|postgres|prisma|sql`|DATABASE_URL)\b/i.test(canonicalSource),
  "canonical evaluator and services are repository agnostic",
);
expect(
  evaluatorSource.includes("const [result] = await this.evaluateBatch([request])"),
  "single evaluation is a one-item batch call",
);
expect(
  evaluatorSource.indexOf("const earlyReason = firstFailedGate")
    < evaluatorSource.indexOf("const matchingDenies")
  && evaluatorSource.includes("if (!facts.entitlement.available)"),
  "implementation returns entitlement failure before deny resolution",
);
expect(
  typesSource.includes('mode: "entity_resource"')
  && typesSource.includes('mode: "registered_capability"')
  && typesSource.includes('mode: "collection"'),
  "typed request/result contracts expose all three modes",
);
expect(
  scopeSource.includes("constraints.every")
  && scopeSource.includes("organizationalAllowClauses")
  && scopeSource.includes("denyScopes.some")
  && scopeSource.includes("sharedRecords.some"),
  "reference materializer implements path intersection, union, deny subtraction, and ACL isolation",
);
expect(
  evaluatorSource.includes("groupMembershipActive !== true")
  && evaluatorSource.includes('kind !== "group_role"')
  && evaluatorSource.includes("isScopeSubset"),
  "inactive-group deny and delegation provenance/subset are fail closed",
);
expect(
  serviceSource.includes(
    "shadow_not_enforced_until_wave5_consumers_move",
  )
  && serviceSource.includes("allPermissionsExactAndShareable")
  && serviceSource.includes("ordinaryProofSourceKinds"),
  "canonical override, ACL, and delegation services enforce Wave 4 boundaries",
);
expect(
  !/\b(?:principal_feature_grant|group_feature_grant|access_grant|persona)\b/i
    .test(canonicalSource),
  "new evaluator has no Persona, generic access-grant, or direct feature-grant semantics",
);

for (const token of [
  "intersects scopes inside a proof path and unions alternative paths",
  "subtracts collection denies",
  "does not activate a group deny through inactive membership",
  "keeps ACL authority isolated to the exact record",
  "requires ordinary provenance and a scope subset for delegation",
  "makes entitlement unavailability win before an allow override",
  "uses the same implementation for single and batch decisions",
]) {
  expect(testSource.includes(token), `truth table covers: ${token}`);
}

const neonContract = await json<{
  contractVersion: string;
  authority: string;
  entitlement: Record<string, string>;
  forbiddenReads: string[];
  consumerStatus: string;
}>("server/db/seed/contracts/authorization/evaluator/neon-admin/repository-contract.v1.json");
const meshContract = await json<{
  contractVersion: string;
  authority: string;
  entitlement: Record<string, string>;
  forbiddenReads: string[];
  connection: Record<string, boolean>;
  consumerStatus: string;
}>("server/db/seed/contracts/authorization/evaluator/mesh/repository-contract.v1.json");
expect(
  neonContract.contractVersion === semantic.contractVersion
  && meshContract.contractVersion === semantic.contractVersion,
  "both repository contracts use the shared evaluator version",
);
expect(
  neonContract.entitlement["neon"]
    === "master.resolve_neon_permission_entitlement"
  && neonContract.entitlement["admin"]
    === "control.auth_admin_entitlement_policy platform_managed",
  "Neon and Admin physical entitlement gates are explicit",
);
expect(
  meshContract.entitlement["mesh"]
    === "mesh.resolve_account_permission_entitlement"
  && meshContract.connection["explicitMeshDatabaseUrlRequired"] === true
  && meshContract.connection["neonFallbackAllowed"] === false,
  "Mesh repository entitlement and connection boundary are local and fail closed",
);
expect(
  neonContract.consumerStatus === "shadow_until_wave5"
  && meshContract.consumerStatus === "shadow_until_wave5",
  "plane repositories remain shadow until Wave 5 consumer migration",
);

const controlDdl = await text(
  "server/db/ddl/planes/neon/authz/03_tables.sql",
);
const neonEntitlement = await text(
  "server/db/ddl/planes/neon/authz/07_functions.sql",
);
const adminEntitlement = await text(
  "server/db/ddl/planes/neon/authz/07_functions.sql",
);
const meshControlDdl = await text(
  "server/db/ddl/planes/mesh/authz/03_tables.sql",
);
const meshEntitlementDdl = await text(
  "server/db/ddl/planes/mesh/authz/03_tables.sql",
);
const meshEntitlement = await text(
  "server/db/ddl/planes/mesh/authz/07_functions.sql",
);
const liveGate = await text(
  "server/db/scripts/verify/verify-authorization-v2-wave4-live.ts",
);

for (const [source, label] of [
  [controlDdl, "Neon migration DDL"],
  [meshControlDdl, "Mesh migration DDL"],
] as const) {
  expect(source.includes("source_watermark_id"), `${label} records watermark`);
  expect(
    source.includes("affected_user_diff_count"),
    `${label} records affected-user differences`,
  );
  expect(
    source.includes("legacy_decision_sha256")
      && source.includes("canonical_decision_sha256"),
    `${label} conserves legacy/canonical decision hashes`,
  );
  expect(
    source.includes("FORCE ROW LEVEL SECURITY")
      && source.includes("REVOKE ALL ON TABLE"),
    `${label} is protected migration evidence`,
  );
}
expect(
  controlDdl.includes("authorization_v4_access_grant_disposition")
  && [
    "scoped_group_role",
    "role_compilation",
    "principal_deny",
    "group_deny",
    "hard_policy",
    "principal_allow_override",
    "record_acl",
    "intentionally_retired",
    "quarantined",
  ].every((classification) => controlDdl.includes(`'${classification}'`)),
  "every access_grant has one explicit target classification vocabulary",
);
expect(
  controlDdl.includes("authorization_v4_role_deny_disposition")
  && controlDdl.includes("remove_permission_from_role")
  && controlDdl.includes("convert_to_group_denies")
  && controlDdl.includes("promote_to_hard_policy")
  && controlDdl.includes("expand_to_principal_denies"),
  "legacy role-subject deny dispositions are reviewed and explicit",
);
expect(
  controlDdl.includes("authorization_v4_feature_grant_disposition")
  && controlDdl.includes("'group_feature_grant'")
  && controlDdl.includes("'principal_feature_grant'"),
  "direct group/principal feature grants require an exact disposition",
);
expect(
  neonEntitlement.includes("shared.plan_module_access")
  && neonEntitlement.includes("master.tenant_module_subscription")
  && neonEntitlement.includes("shared.plan_feature_access")
  && neonEntitlement.includes("master.tenant_feature_entitlement")
  && neonEntitlement.includes("v_deny_override")
  && neonEntitlement.includes("policy.allow_override"),
  "Neon gate combines plan, activation, feature, and governed overrides",
);
expect(
  adminEntitlement.includes("platform_managed")
  && adminEntitlement.includes("auth_admin_entitlement_policy"),
  "Admin gate is an explicit platform_managed policy lookup",
);
expect(
  meshEntitlementDdl.includes("CREATE TABLE IF NOT EXISTS mesh.account_entitlement")
  && meshEntitlement.includes("mesh.account_entitlement")
  && meshEntitlement.includes("mesh_control.auth_entitlement_policy")
  && !/\bmaster\.|\bcontrol\./.test(meshEntitlement),
  "Mesh entitlement is physically local and reads no Neon relation",
);
expect(
  [
    "mesh.account_grant",
    "mesh.attachment_acl",
    "mesh.content_item_access_grant",
    "mesh.conversation_participant",
  ].every((sourceRelation) => liveGate.includes(`'${sourceRelation}'`))
  && liveGate.includes("mesh_legacy_exception_without_reviewed_disposition"),
  "Mesh live gate requires a reviewed disposition for every legacy exception row",
);
expect(
  liveGate.includes("neon_direct_feature_grant_diff_or_anomaly")
  && liveGate.includes("affected_user_diff_count <> 0"),
  "direct feature-grant migration has an affected-user diff gate",
);

if (failures > 0) {
  process.stderr.write(`Wave 4 static verification failed: ${failures} gate(s)\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Wave 4 static evaluator verification passed\n");
}
