import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));

async function read(path: string): Promise<string> {
  return readFile(resolve(repoRoot, path), "utf8");
}

const checks: Array<{ name: string; ok: boolean }> = [];
const expect = (name: string, ok: boolean): void => {
  checks.push({ name, ok });
};

const base = "server/db/ddl/planes/neon/control";
const [domains, tables, constraints, indexes, functions, triggers, rls, grants] =
  await Promise.all([
    read(`${base}/02_domains.sql`),
    read(`${base}/03_tables.sql`),
    read(`${base}/05_constraints.sql`),
    read(`${base}/06_indexes.sql`),
    read(`${base}/07_functions.sql`),
    read(`${base}/08_triggers.sql`),
    read(`${base}/10_rls.sql`),
    read(`${base}/11_grants.sql`),
  ]);

const dimensionPolicyStart = tables.indexOf("CREATE TABLE control.dimension_policy (");
const dimensionPolicyEnd = tables.indexOf("\nCREATE TABLE ", dimensionPolicyStart + 1);
const dimensionPolicyDefinition = tables.slice(
  dimensionPolicyStart,
  dimensionPolicyEnd === -1 ? undefined : dimensionPolicyEnd,
);

expect(
  "dimension policy is validation-only",
  domains.includes("CREATE DOMAIN control.dimension_policy_enforcement_d")
    && ["required", "optional", "forbidden"].every((value) =>
      domains.includes(`'${value}'`))
    && !/derive_if_missing|inherit|fixed_value/i.test(
      dimensionPolicyDefinition,
    ),
);

for (const table of ["dimension_policy", "dimension_policy_allowed_value"]) {
  expect(
    `control.${table} is defined in the Neon plane`,
    tables.includes(`CREATE TABLE control.${table} (`),
  );
  expect(
    `control.${table} has forced tenant RLS`,
    rls.includes(`ALTER TABLE control.${table} ENABLE ROW LEVEL SECURITY`)
      && rls.includes(`ALTER TABLE control.${table} FORCE ROW LEVEL SECURITY`)
      && rls.includes(`CREATE POLICY ${table}_tenant_access`),
  );
  expect(
    `control.${table} has explicit grants`,
    grants.includes(`control.${table}`),
  );
}

expect(
  "policy identity is tenant scoped and versioned",
  tables.includes("CONSTRAINT dimension_policy_tenant_id_uq")
    && tables.includes("CONSTRAINT dimension_policy_lineage_version_uq")
    && tables.includes("version_no")
    && tables.includes("supersedes_id"),
);
expect(
  "allowed values carry the parent dimension discriminator",
  tables.includes("dimension_type_id   uuid        NOT NULL")
    && constraints.includes("FOREIGN KEY (tenant_id, policy_id, dimension_type_id)")
    && constraints.includes("FOREIGN KEY (tenant_id, dimension_type_id, dimension_value_id)"),
);
expect(
  "all business references use tenant-safe composite foreign keys",
  [
    "dimension_policy_dimension_type_fk",
    "dimension_policy_company_fk",
    "dimension_policy_account_fk",
    "dimension_policy_book_fk",
    "dimension_policy_allowed_value_policy_fk",
    "dimension_policy_allowed_value_value_fk",
  ].every((name) => constraints.includes(name)),
);
expect(
  "overlapping active policies at an identical scope are rejected",
  constraints.includes("dimension_policy_active_scope_period_excl"),
);
expect(
  "policy resolution and child membership are indexed",
  indexes.includes("dimension_policy_resolution_idx")
    && indexes.includes("dimension_policy_allowed_value_policy_idx")
    && indexes.includes("dimension_policy_allowed_value_value_idx"),
);
expect(
  "activated policy semantics and allowed-value membership are guarded",
  functions.includes("trg_guard_dimension_policy()")
    && functions.includes("trg_guard_dimension_policy_allowed_value()")
    && triggers.includes("trg_dimension_policy_20_guard")
    && triggers.includes("trg_dimension_policy_allowed_value_10_guard"),
);
expect(
  "scope integrity and policy lineage are validated",
  functions.includes("trg_validate_dimension_policy()")
    && functions.includes("must be assigned to the company")
    && functions.includes("increment version by one"),
);

const financePhases = [
  "02_domains.sql",
  "03_tables.sql",
  "05_constraints.sql",
  "06_indexes.sql",
  "07_functions.sql",
  "08_triggers.sql",
  "10_rls.sql",
  "11_grants.sql",
];
const [neonManifest, athyperManifest, meshManifest] = await Promise.all([
  read("server/db/ddl/planes/neon/_manifest.txt"),
  read("server/db/ddl/planes/athyper/_manifest.txt"),
  read("server/db/ddl/planes/mesh/_manifest.txt"),
]);
expect(
  "Neon installs every finance-policy phase exactly once",
  financePhases.every((phase) =>
    neonManifest.split(`planes/neon/control/${phase}`).length === 2),
);
expect(
  "Athyper and Mesh do not install Neon dimension policy",
  !/finance_policy|dimension_policy/.test(athyperManifest)
    && !/finance_policy|dimension_policy/.test(meshManifest),
);

const [dispositionPolicy, dispositionInventory] = await Promise.all([
  read("config/governance/authorization-data-disposition-policy.v1.json"),
  read("config/governance/authorization-data-disposition-inventory.v1.json"),
]);
for (const table of ["control.dimension_policy", "control.dimension_policy_allowed_value"]) {
  expect(
    `${table} has an explicit migration disposition`,
    dispositionPolicy.includes(`"${table}"`)
      && dispositionInventory.includes(`"id": "${table}"`),
  );
}

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);
}

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  throw new Error(`${failed.length} dimension policy contract check(s) failed.`);
}

console.log(`Dimension policy contract verified (${checks.length} checks).`);
