#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../.."),
  repositoryRoot = resolve(root, "../.."),
  failures: string[] = [];
const registry = JSON.parse(
  await readFile(
    resolve(root, "ddl/planes/mesh/governed-lifecycle-g4-readiness.v1.json"),
    "utf8",
  ),
) as {
  controls: Array<{
    control: string;
    status: string;
    owner: string;
    evidence: string;
    exitGate: string;
  }>;
};
const expected = new Set([
  "raw_bank_identifier_storage",
  "masked_projection_and_leakage",
  "purpose_bound_retrieval",
  "key_rotation",
  "bounded_account_json",
  "structured_profile_address_urls",
  "bank_disclosure_purpose_catalog",
  "canonical_party_reconciliation",
  "live_security_certification",
]);
for (const row of registry.controls) {
  if (!expected.delete(row.control))
    failures.push(`unexpected or duplicate G4 control: ${row.control}`);
  for (const key of ["status", "owner", "evidence", "exitGate"] as const)
    if (!row[key].trim()) failures.push(`${row.control} has no ${key}`);
  if (row.status !== "landed")
    failures.push(`${row.control} is not landed: ${row.status}`);
}
for (const value of expected) failures.push(`missing G4 control: ${value}`);
const tables = await readFile(
    resolve(root, "ddl/planes/mesh/mesh/03_tables.sql"),
    "utf8",
  ),
  functions = await readFile(
    resolve(root, "ddl/planes/mesh/mesh/07_functions.sql"),
    "utf8",
  ),
  triggers = await readFile(
    resolve(root, "ddl/planes/mesh/mesh/08_triggers.sql"),
    "utf8",
  ),
  grants = await readFile(
    resolve(root, "ddl/planes/mesh/mesh/11_grants.sql"),
    "utf8",
  );
const bank = tables.slice(
  tables.indexOf("CREATE TABLE mesh.bank_account ("),
  tables.indexOf("CREATE TABLE mesh.bank_account_link ("),
);
for (const token of [
  "protected_value_token",
  "identifier_fingerprint",
  "protection_key_version",
  "pg_column_size(metadata) <= 4096",
]) {
  if (!bank.includes(token))
    failures.push(`bank authority is missing ${token}`);
}
if (bank.includes("account_id_value"))
  failures.push("canonical MESH bank account still stores a clear identifier");
if (
  functions.includes("NEW.account_id_value") ||
  triggers.includes("account_id_value")
)
  failures.push(
    "active MESH bank trigger path still handles a clear identifier",
  );
if (
  /GRANT SELECT \([^;]*(protected_value_token|identifier_fingerprint)/is.test(
    grants,
  )
)
  failures.push(
    "runtime column projection exposes protected token or fingerprint",
  );
const g4 = await readFile(
    resolve(
      root,
      "ddl/planes/mesh/mesh/15_data_protection_and_stewardship.sql",
    ),
    "utf8",
  ),
  upgrade = await readFile(
    resolve(root, "migrations/20260904_mesh_bank_protected_value_upgrade.sql"),
    "utf8",
  ),
  manifest = await readFile(
    resolve(root, "migrations/manifests/mesh.txt"),
    "utf8",
  );
for (const token of [
  "bank_disclosure_purpose",
  "command_retrieve_bank_protected_token",
  "athyper_protected_value_retriever",
  "command_rotate_bank_protected_token",
  "network_account_profile_address",
  "is_hardened_https_url",
  "capabilities_contract_hash",
  "canonical_party_correlation_case",
]) {
  if (!g4.includes(token)) failures.push(`G4 authority is missing ${token}`);
}
for (const token of [
  "G4_VAULT_MIGRATION_KEY_REQUIRED",
  "pgp_sym_encrypt",
  "DROP COLUMN account_id_value",
]) {
  if (!upgrade.includes(token)) failures.push(`G4 upgrade is missing ${token}`);
}
if (!manifest.includes("20260904_mesh_bank_protected_value_upgrade.sql"))
  failures.push("Mesh migration manifest omits G4 upgrade");
for (const reportName of [
  "g4-clean-data-protection-certification.json",
  "g4-upgrade-data-protection-certification.json",
]) {
  const report = JSON.parse(
    await readFile(
      resolve(repositoryRoot, "docs/architecture/reports", reportName),
      "utf8",
    ),
  ) as { passed?: boolean; probes?: Array<{ passed?: boolean }> };
  if (
    !report.passed ||
    !report.probes?.length ||
    report.probes.some((x) => !x.passed)
  )
    failures.push(`${reportName} is not fully passing`);
}
if (failures.length) {
  failures.forEach((x) => process.stderr.write(`FAIL ${x}\n`));
  process.exitCode = 1;
} else
  process.stdout.write(
    `PASS ${registry.controls.length} G4 controls inventoried; clean-build MESH bank authority contains no clear account identifier\n`,
  );
