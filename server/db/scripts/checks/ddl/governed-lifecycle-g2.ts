#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const databaseRoot = resolve(import.meta.dirname, "../../..");
const registry = JSON.parse(
  await readFile(
    resolve(
      databaseRoot,
      "ddl/planes/neon/governed-lifecycle-g2-readiness.v1.json",
    ),
    "utf8",
  ),
) as {
  schemaVersion: number;
  controls: Array<{
    control: string;
    status: string;
    owner: string;
    evidence: string;
    exitGate: string;
  }>;
};
const required = new Set([
  "composite_role_fk_coverage",
  "typed_address_contact_ownership",
  "aggregate_governance_percentages",
  "supplier_customer_role_history",
  "customer_lifecycle_command",
  "metadata_allowlists_and_urls",
  "organization_only_history",
  "s4_s5_certification",
]);
const failures: string[] = [];
for (const row of registry.controls) {
  if (!required.delete(row.control))
    failures.push(`unexpected or duplicate G2 control: ${row.control}`);
  if (!row.status.trim()) failures.push(`${row.control} has no status`);
  for (const key of ["owner", "evidence", "exitGate"] as const)
    if (row[key].trim().length < 8)
      failures.push(`${row.control} has inadequate ${key}`);
}
for (const control of required) failures.push(`missing G2 control: ${control}`);

const canonicalFunctions = await readFile(
  resolve(databaseRoot, "ddl/planes/neon/master/07_functions.sql"),
  "utf8",
);
const canonicalTriggers = await readFile(
  resolve(databaseRoot, "ddl/planes/neon/master/08_triggers.sql"),
  "utf8",
);
const migration = await readFile(
  resolve(
    databaseRoot,
    "migrations/20260903_neon_business_partner_governance_percentage_hardening.sql",
  ),
  "utf8",
);
for (const source of [canonicalFunctions, migration]) {
  if (!source.includes("trg_enforce_business_partner_governance_totals"))
    failures.push("aggregate governance percentage function is missing");
  for (const column of [
    "ownership_pct",
    "voting_pct",
    "beneficial_ownership_pct",
  ])
    if (!source.includes(`sum(${column})`))
      failures.push(`aggregate check is missing ${column}`);
}
if (
  !canonicalTriggers.includes("DEFERRABLE INITIALLY DEFERRED") ||
  !canonicalTriggers.includes("trg_business_partner_governance_totals")
)
  failures.push("canonical deferred aggregate trigger is missing");
if (!migration.includes("remediate historical rows before migration"))
  failures.push("upgrade migration lacks dirty-history preflight");

const controlTables = await readFile(
  resolve(databaseRoot, "ddl/planes/neon/control/03_tables.sql"),
  "utf8",
);
const controlConstraints = await readFile(
  resolve(databaseRoot, "ddl/planes/neon/control/05_constraints.sql"),
  "utf8",
);
const controlFunctions = await readFile(
  resolve(databaseRoot, "ddl/planes/neon/control/07_functions.sql"),
  "utf8",
);
const controlTriggers = await readFile(
  resolve(databaseRoot, "ddl/planes/neon/control/08_triggers.sql"),
  "utf8",
);
const masterTables = await readFile(
  resolve(databaseRoot, "ddl/planes/neon/master/03_tables.sql"),
  "utf8",
);
const g2Migration = await readFile(
  resolve(
    databaseRoot,
    "migrations/20260904_neon_governed_lifecycle_g2_hardening.sql",
  ),
  "utf8",
);
const metadataContract = JSON.parse(
  await readFile(
    resolve(
      databaseRoot,
      "../../config/governance/business-partner-metadata-url-contract.v1.json",
    ),
    "utf8",
  ),
) as {
  contractVersion: string;
  metadata: Record<string, string[]>;
  urlPolicy: { scheme: string; credentialsAllowed: boolean };
};
const ownerDisposition = JSON.parse(
  await readFile(
    resolve(
      databaseRoot,
      "ddl/planes/neon/business-partner-owner-binding-disposition.v1.json",
    ),
    "utf8",
  ),
) as { disposition: string; surfaces: unknown[] };
const organizationDisposition = JSON.parse(
  await readFile(
    resolve(
      databaseRoot,
      "../../config/governance/business-partner-organization-only-compatibility.v1.json",
    ),
    "utf8",
  ),
) as {
  governedWritePolicy: string;
  compatibilityDisposition: string;
  knownConsumers: string[];
};
if (
  !controlTables.includes("role_id                   uuid") ||
  !controlTables.includes("expected_version") ||
  !controlTables.includes("resulting_version")
)
  failures.push("canonical role/version coordinates are missing");
for (const tuple of [
  "tenant_id, supplier_id, business_partner_id",
  "tenant_id, customer_id, business_partner_id",
])
  if (!controlConstraints.includes(tuple))
    failures.push(`missing composite commercial-role FK tuple ${tuple}`);
for (const token of [
  "trg_validate_qualification_role_pair",
  "trg_business_partner_qualification_15_role_pair",
])
  if (!(controlFunctions + controlTriggers).includes(token))
    failures.push(`missing qualification role binding ${token}`);
for (const action of [
  "activate",
  "suspend",
  "reactivate",
  "deactivate",
  "archive",
])
  if (!controlFunctions.includes(`'${action}'`))
    failures.push(`customer lifecycle action ${action} is missing`);
for (const state of [
  "no_data_found",
  "insufficient_privilege",
  "serialization_failure",
  "object_not_in_prerequisite_state",
])
  if (!controlFunctions.includes(state))
    failures.push(`customer lifecycle outcome ${state} is missing`);
for (const token of [
  "supplier_tenant_role_partner_uq",
  "customer_tenant_role_partner_uq",
  "Stable one-lifetime supplier role identity",
  "Stable one-lifetime customer role identity",
])
  if (!masterTables.includes(token))
    failures.push(`commercial-role history decision is missing ${token}`);
if (
  metadataContract.contractVersion !==
    "athyper.business-partner-metadata-url.v1" ||
  metadataContract.urlPolicy.scheme !== "https" ||
  metadataContract.urlPolicy.credentialsAllowed
)
  failures.push("metadata/URL contract is invalid");
for (const relation of [
  "master.business_partner",
  "master.supplier",
  "master.customer",
])
  if (!metadataContract.metadata[relation]?.length)
    failures.push(`metadata allowlist is missing ${relation}`);
if (
  ownerDisposition.disposition !== "retain_typed_registry_binding" ||
  ownerDisposition.surfaces.length !== 3 ||
  !canonicalFunctions.includes("trg_validate_owner_reference")
)
  failures.push("typed address/contact owner disposition is incomplete");
if (
  organizationDisposition.governedWritePolicy !== "organization_only" ||
  organizationDisposition.compatibilityDisposition !==
    "retained_not_removal_eligible" ||
  organizationDisposition.knownConsumers.length < 3
)
  failures.push("organization-only compatibility disposition is incomplete");
for (const token of [
  "unsafe historical contact website URL",
  "trg_normalize_contact_link",
  "expected_version",
  "deactivate",
  "archive",
])
  if (!g2Migration.includes(token))
    failures.push(`supported-upgrade G2 migration is missing ${token}`);
for (const report of [
  "g2-clean-hardening-certification.json",
  "g2-clean-s4-certification.json",
  "g2-clean-s5-certification.json",
  "g2-upgrade-hardening-certification.json",
  "g2-upgrade-s4-certification.json",
  "g2-upgrade-s5-certification.json",
]) {
  const evidence = JSON.parse(
    await readFile(
      resolve(databaseRoot, `../../docs/architecture/reports/${report}`),
      "utf8",
    ),
  ) as { passed?: boolean };
  if (evidence.passed !== true) failures.push(`${report} is not passing`);
}

if (failures.length) {
  failures.forEach((failure) => process.stderr.write(`FAIL ${failure}\n`));
  process.exitCode = 1;
} else {
  const open = registry.controls.filter(
    ({ status }) => status !== "landed",
  ).length;
  process.stdout.write(
    `PASS all ${registry.controls.length} G2 controls have owners, evidence and exit gates; ${open} remain open\n`,
  );
  process.stdout.write(
    "PASS aggregate percentages, typed ownership, role pairs, lifecycle outcomes, metadata/URLs and organization-only disposition are enforced and certified\n",
  );
}
