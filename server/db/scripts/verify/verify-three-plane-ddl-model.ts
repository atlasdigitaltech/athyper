#!/usr/bin/env tsx

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const databaseRoot = resolve(import.meta.dirname, "../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const planes = ["athyper", "neon", "mesh"] as const;
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
    "common/authz/02_application_projection_domains.sql",
    "common/authz/03_application_projection_tables.sql",
    "common/authz/05_application_projection_constraints.sql",
    "common/authz/06_application_projection_indexes.sql",
    "common/authz/07_application_projection_functions.sql",
    "common/authz/08_application_projection_triggers.sql",
    "common/authz/10_application_projection_rls.sql",
    "common/authz/11_application_projection_grants.sql",
  ]) {
    if (!entries.includes(projectionFile)) fail(`${plane} manifest omits ${projectionFile}`);
  }
}

const packageJson = await readFile(resolve(databaseRoot, "package.json"), "utf8");
const provision = await readFile(resolve(databaseRoot, "scripts/provision.ts"), "utf8");
const meshProvision = await readFile(
  resolve(databaseRoot, "scripts/provision-mesh.ts"),
  "utf8",
);
const activeSources = packageJson + provision + meshProvision;

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
  const constraints = await readFile(resolve(databaseRoot, `ddl/planes/${plane}/authz/05_constraints.sql`), "utf8");
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

const canonicalPartyTables = await readFile(resolve(databaseRoot, "ddl/planes/athyper/master/03_canonical_party_tables.sql"), "utf8");
for (const relation of ["canonical_party", "canonical_party_identifier", "canonical_party_relationship", "canonical_party_merge"]) {
  if (!canonicalPartyTables.includes(`CREATE TABLE master.${relation}`)) fail(`master.${relation} is missing`);
  else pass(`master.${relation} is defined`);
}
const trustiamTables = await readFile(resolve(databaseRoot, "ddl/planes/athyper/trustiam/03_tables.sql"), "utf8");
for (const relation of ["organization", "organization_provider", "application_projection", "projection_scope"]) {
  if (!trustiamTables.includes(`CREATE TABLE trustiam.${relation}`)) fail(`trustiam.${relation} is missing`);
  else pass(`trustiam.${relation} is defined`);
}
const localProjectionTables = await readFile(resolve(databaseRoot, "ddl/common/authz/03_application_projection_tables.sql"), "utf8");
for (const relation of ["application_projection", "projection_provider", "projection_scope"]) {
  if (!localProjectionTables.includes(`CREATE TABLE authz.${relation}`)) fail(`authz.${relation} is missing`);
  else pass(`authz.${relation} is defined for every plane`);
}

if (failures > 0) {
  process.stderr.write(`\n${failures} three-plane authorization check(s) failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("\nThree-plane authorization manifest checks passed.\n");
}
