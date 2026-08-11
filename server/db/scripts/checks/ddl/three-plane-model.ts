#!/usr/bin/env tsx

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

// This checker lives at db/scripts/checks/ddl.  The DDL root is db, not db/scripts.
const databaseRoot = resolve(import.meta.dirname, "../../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const planes = ["studio", "neon", "mesh"] as const;
const legacyPath =
  /(?:server\/db\/|(?:\.\.\/)*db\/)?ddl\/(?:000_bootstrap|aggregate|control|document|event|governance|ledger|log|master|mesh|mesh_control|mesh_log|public|security|shared|snapshot)\//;

let failures = 0;
const fail = (message: string): void => {
  failures += 1;
  process.stderr.write(`FAIL ${message}\n`);
};
const pass = (message: string): void => {
  process.stdout.write(`PASS ${message}\n`);
};

for (const plane of planes) {
  const manifestPath = resolve(databaseRoot, `ddl/planes/${plane}/_manifest.txt`);
  const manifest = await readFile(manifestPath, "utf8");
  const entries = manifest
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (entries.length === 0) fail(`${plane} manifest is empty`);
  else pass(`${plane} manifest contains ${entries.length} ordered entries`);

  if (new Set(entries).size !== entries.length) {
    fail(`${plane} manifest contains duplicate entries`);
  } else {
    pass(`${plane} manifest entries are unique`);
  }

  for (const entry of entries) {
    try {
      await access(resolve(databaseRoot, "ddl", entry));
    } catch {
      fail(`${plane} manifest entry is missing: ${entry}`);
    }
  }

  const masterCatalog = `planes/${plane}/master/12_platform_catalog_reference_seed.sql`;
  const controlCatalog = `planes/${plane}/control/12_platform_catalog_reference_seed.sql`;
  const planCatalog = `planes/${plane}/control/12_subscription_plan_reference_seed.sql`;
  const planModules = `planes/${plane}/control/12_subscription_plan_module_reference_seed.sql`;
  const positions = [masterCatalog, controlCatalog, planCatalog, planModules].map((entry) =>
    entries.indexOf(entry),
  );
  if (positions.some((position) => position < 0) || !(positions[0]! < positions[1]! && positions[2]! < positions[3]!)) {
    fail(`${plane} manifest does not order catalog backfill and plan-module grants correctly`);
  } else {
    pass(`${plane} manifest orders catalog backfill and plan-module grants correctly`);
  }

  for (const projectionFile of [
    "common/authz/02_domains.sql",
    "common/authz/03_tables.sql",
    "common/authz/05_constraints.sql",
    "common/authz/06_indexes.sql",
    "common/authz/07_functions.sql",
    "common/authz/08_triggers.sql",
    "common/authz/10_rls.sql",
    "common/authz/11_grants.sql",
  ]) {
    if (!entries.includes(projectionFile)) fail(`${plane} manifest omits ${projectionFile}`);
  }

  if (entries.some((entry) => entry.startsWith("common/authz/plane/")
      || new RegExp(`^planes/${plane}/authz/(?:02|03|05|06|07|08|09|10|11)_`).test(entry))) {
    fail(`${plane} manifest still installs a split or duplicated authz stack`);
  } else {
    pass(`${plane} installs the flattened common authz stack`);
  }

  for (const runtimeProjectionFile of [
    "common/runtime_meta/02_domains.sql",
    "common/runtime_meta/03_tables.sql",
    "common/runtime_meta/05_constraints.sql",
    "common/runtime_meta/06_indexes.sql",
    "common/runtime_meta/07_functions.sql",
    "common/runtime_meta/08_triggers.sql",
    "common/runtime_meta/10_rls.sql",
    "common/runtime_meta/11_grants.sql",
  ]) {
    if (!entries.includes(runtimeProjectionFile)) {
      fail(`${plane} manifest omits ${runtimeProjectionFile}`);
    }
  }
}

const packageJson = await readFile(resolve(databaseRoot, "package.json"), "utf8");
const provision = await readFile(resolve(databaseRoot, "scripts/safe-provision.ts"), "utf8");
const foundationRunner = await readFile(resolve(databaseRoot, "ddl/foundation-runner.ps1"), "utf8");
const activeSources = packageJson + provision + foundationRunner;

if (legacyPath.test(activeSources)) fail("active provisioning still references legacy DDL paths");
else pass("active provisioning references only common and plane DDL");

await access(resolve(databaseRoot, "ddl/common/_manifest.txt"));
await access(resolve(repositoryRoot, "scripts/policy/authorization-legacy-freeze.ts"));
pass("common manifest and authorization freeze policy are present");

const controlTables = await readFile(resolve(databaseRoot, "ddl/common/control/03_tables.sql"), "utf8");
for (const relation of ["workspace", "module", "workspace_module", "subscription_plan_module"]) {
  if (!controlTables.includes(`CREATE TABLE control.${relation}`)) fail(`control.${relation} is missing`);
  else pass(`control.${relation} is defined`);
}

for (const plane of planes) {
  const constraints = await readFile(resolve(databaseRoot, "ddl/common/authz/05_constraints.sql"), "utf8");
  if (!/permission_module_fk[\s\S]*REFERENCES control\.module\s*\(id\)/.test(constraints)) {
    fail(`${plane} authz.permission.module_id does not reference control.module`);
  } else {
    pass(`${plane} authz.permission.module_id references control.module`);
  }
}

if (/capability_toggle|product_capability|subscription_plan_capability/.test(controlTables)) {
  fail("control DDL still contains retired capability semantics");
} else {
  pass("feature flags contain no commercial capability semantics");
}

const canonicalPartyTables = await readFile(resolve(databaseRoot, "ddl/planes/studio/master/03_tables.sql"), "utf8");
for (const relation of ["canonical_party", "canonical_party_identifier", "canonical_party_relationship", "canonical_party_merge"]) {
  if (!canonicalPartyTables.includes(`CREATE TABLE master.${relation}`)) fail(`master.${relation} is missing`);
  else pass(`master.${relation} is defined`);
}
const trustiamTables = await readFile(resolve(databaseRoot, "ddl/planes/studio/trustiam/03_tables.sql"), "utf8");
for (const relation of ["organization", "organization_provider", "application_projection", "projection_scope"]) {
  if (!trustiamTables.includes(`CREATE TABLE trustiam.${relation}`)) fail(`trustiam.${relation} is missing`);
  else pass(`trustiam.${relation} is defined`);
}
const localProjectionTables = await readFile(resolve(databaseRoot, "ddl/common/authz/03_tables.sql"), "utf8");
for (const relation of ["application_projection", "projection_provider", "projection_scope", "entity_operation_binding", "entity_operation_scope_binding"]) {
  if (!localProjectionTables.includes(`CREATE TABLE authz.${relation}`)) fail(`authz.${relation} is missing`);
  else pass(`authz.${relation} is defined for every plane`);
}
const scopeTableShape = localProjectionTables.match(/CREATE TABLE authz\.entity_operation_scope_binding \([\s\S]*?\n\);/)?.[0] ?? "";
for (const forbiddenColumn of ["tenant_id", "permission_id", "plane_code", "source_entity_id", "source_release_hash", "decision_mode", "status"]) {
  if (new RegExp(`\\n\\s*${forbiddenColumn}\\s`).test(scopeTableShape)) {
    fail(`authz.entity_operation_scope_binding still duplicates parent column ${forbiddenColumn}`);
  }
}
const planeAuthorityTables = localProjectionTables;
for (const relation of [
  "permission", "plane_membership", "scope_target", "role", "role_permission",
  "principal_group", "group_member", "group_role", "deny_rule", "delegation",
  "delegation_grant", "override", "record_acl", "trusted_device",
]) {
  if (!planeAuthorityTables.includes(`CREATE TABLE authz.${relation}`)) fail(`common plane-local authz.${relation} is missing`);
  else pass(`common plane-local authz.${relation} is defined`);
}
const localProjectionFunctions = await readFile(resolve(databaseRoot, "ddl/common/authz/07_functions.sql"), "utf8");
if (!localProjectionFunctions.includes("authz.fn_resolve_active_application_projections")) {
  fail("cross-tenant immutable organization projection resolver is missing");
} else {
  pass("cross-tenant immutable organization projection resolver is defined");
}
for (const routine of ["fn_stage_entity_operation_projection", "fn_activate_entity_operation_projection", "fn_retire_entity_operation_projection", "fn_restore_entity_operation_projection"]) {
  if (!localProjectionFunctions.includes(`authz.${routine}`)) fail(`authz projection routine ${routine} is missing`);
  else pass(`authz projection routine ${routine} is defined`);
}
const localProjectionGrants = await readFile(resolve(databaseRoot, "ddl/common/authz/11_grants.sql"), "utf8");
if (!localProjectionGrants.includes("GRANT EXECUTE ON FUNCTION authz.fn_resolve_active_application_projections")) {
  fail("application role cannot execute the organization projection resolver");
} else {
  pass("application role can execute the organization projection resolver");
}

const runtimeTables = await readFile(resolve(databaseRoot, "ddl/common/runtime_meta/03_tables.sql"), "utf8");
for (const relation of ["entity_contract", "entity_descriptor"]) {
  if (!runtimeTables.includes(`CREATE TABLE runtime_meta.${relation}`)) {
    fail(`runtime_meta.${relation} is missing from common all-plane DDL`);
  } else {
    pass(`runtime_meta.${relation} is defined for every plane`);
  }
}
for (const requiredShape of [
  "release_id", "revision_id", "contract_schema_version", "entity_contract_hash",
  "signature_algorithm", "signing_key_id", "descriptor_schema_version",
  "source_contract_hash", "compiled_hash", "applied_release_id",
]) {
  if (!runtimeTables.includes(requiredShape)) fail(`runtime Entity projection omits ${requiredShape}`);
}

const runtimeFunctions = await readFile(resolve(databaseRoot, "ddl/common/runtime_meta/07_functions.sql"), "utf8");
for (const routine of [
  "fn_stage_release_projection", "fn_stage_entity_projection", "fn_activate_release",
  "fn_rollback_release", "fn_active_entity_descriptor",
]) {
  if (!runtimeFunctions.includes(`runtime_meta.${routine}`)) fail(`runtime projection routine ${routine} is missing`);
  else pass(`runtime projection routine ${routine} is defined`);
}
if (!/fn_activate_release[\s\S]*UPDATE runtime_meta\.entity_descriptor[\s\S]*status='active'/.test(runtimeFunctions)) {
  fail("release activation does not atomically activate the Entity descriptor");
} else {
  pass("release activation atomically activates the Entity descriptor");
}
if (!/fn_stage_entity_projection[\s\S]*authz\.fn_stage_entity_operation_projection/.test(runtimeFunctions)
    || !/fn_activate_release[\s\S]*authz\.fn_activate_entity_operation_projection/.test(runtimeFunctions)
    || !/fn_rollback_release[\s\S]*authz\.fn_restore_entity_operation_projection/.test(runtimeFunctions)) {
  fail("Entity authz projection is not atomic with descriptor stage, activation, and rollback");
} else {
  pass("Entity authz projection is atomic with descriptor stage, activation, and rollback");
}
if (!/fn_active_entity_descriptor[\s\S]*a\.status='active'[\s\S]*d\.status='active'[\s\S]*c\.status='published'/.test(runtimeFunctions)) {
  fail("offline Entity read does not pin all active projection coordinates");
} else {
  pass("offline Entity read pins the local active release, descriptor, and contract");
}

const runtimeTriggers = await readFile(resolve(databaseRoot, "ddl/common/runtime_meta/08_triggers.sql"), "utf8");
for (const guard of ["runtime_entity_contract_immutable", "runtime_entity_descriptor_immutable"]) {
  if (!runtimeTriggers.includes(guard)) fail(`${guard} is missing`);
  else pass(`${guard} protects projection content`);
}
const runtimeRls = await readFile(resolve(databaseRoot, "ddl/common/runtime_meta/10_rls.sql"), "utf8");
const runtimeGrants = await readFile(resolve(databaseRoot, "ddl/common/runtime_meta/11_grants.sql"), "utf8");
for (const relation of ["entity_contract", "entity_descriptor"]) {
  if (!runtimeRls.includes(`ALTER TABLE runtime_meta.${relation} FORCE ROW LEVEL SECURITY`)) {
    fail(`runtime_meta.${relation} does not force RLS`);
  }
  if (!runtimeGrants.includes(`runtime_meta.${relation}`)) fail(`runtime_meta.${relation} grants are missing`);
}

const meshManifest = await readFile(resolve(databaseRoot, "ddl/planes/mesh/_manifest.txt"), "utf8");
if (meshManifest.includes("planes/mesh/runtime_meta/")) {
  fail("Mesh still installs its legacy private Entity projection DDL");
} else {
  pass("Mesh consumes the common Entity projection DDL");
}
const meshEnvelopeConstraints = await readFile(resolve(databaseRoot, "ddl/planes/mesh/mesh/05_constraints.sql"), "utf8");
if (!/REFERENCES runtime_meta\.entity_contract\s*\([\s\S]*entity_id,[\s\S]*id,[\s\S]*entity_contract_hash/.test(meshEnvelopeConstraints)) {
  fail("Mesh document envelope FK is not pinned to the common Entity contract coordinate");
} else {
  pass("Mesh document envelope FK is pinned to the common Entity contract coordinate");
}

if (failures > 0) {
  process.stderr.write(`\n${failures} three-plane authorization check(s) failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("\nThree-plane authorization manifest checks passed.\n");
}
