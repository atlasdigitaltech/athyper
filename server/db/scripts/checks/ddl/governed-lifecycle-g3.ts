#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const registry = JSON.parse(
  await readFile(
    resolve(root, "ddl/planes/mesh/governed-lifecycle-g3-readiness.v1.json"),
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
    "relationship_capability_authority",
    "relationship_kind_catalog",
    "registration_intent_invitation",
    "commodity_capability_non_overlap",
    "potential_relationship_discovery",
    "command_only_effects",
    "scenario_certification",
  ]),
  failures: string[] = [];
for (const row of registry.controls) {
  if (!expected.delete(row.control))
    failures.push(`unexpected or duplicate G3 control: ${row.control}`);
  for (const key of ["status", "owner", "evidence", "exitGate"] as const)
    if (!row[key].trim()) failures.push(`${row.control} has no ${key}`);
  if (row.status !== "landed") failures.push(`${row.control} is not landed`);
}
for (const value of expected) failures.push(`missing G3 control: ${value}`);
const sql = await readFile(
  resolve(
    root,
    "ddl/planes/mesh/mesh/14_relationship_capability_foundation.sql",
  ),
  "utf8",
);
for (const token of [
  "CREATE TABLE mesh.network_relationship_kind",
  "CREATE TABLE mesh.network_relationship_capability",
  "CREATE TABLE mesh.registration_exchange",
  "network_relationship_capability_no_overlap_excl",
  "network_account_commodity_capability_no_overlap_excl",
  "pg_column_size(routing_policy) <= 16384",
  "approved_by_tenant_id <> requested_by_tenant_id",
  "buyer_request','supplier_self_registration','discovery_nomination",
  "command_request_relationship_capability",
  "command_relationship_capability_lifecycle",
  "command_discover_network_relationship",
  "command_issue_registration_exchange",
  "command_registration_exchange_lifecycle",
  "Potential relationships may request profile exchange only",
  "trg_network_relationship_capability_command",
  "trg_registration_exchange_command",
  "GRANT SELECT ON mesh.network_relationship_kind, mesh.network_relationship_capability TO athyperapp",
]) {
  if (!sql.includes(token))
    failures.push(`canonical G3 foundation is missing: ${token}`);
}
if (
  /GRANT (?:INSERT|UPDATE|DELETE|ALL)[^;]*network_relationship_capability TO athyperapp/i.test(
    sql,
  )
)
  failures.push("runtime role has direct capability mutation privilege");
const migration = await readFile(
    resolve(root, "migrations/20260904_mesh_governed_lifecycle_g3.sql"),
    "utf8",
  ),
  manifest = await readFile(
    resolve(root, "migrations/manifests/mesh.txt"),
    "utf8",
  );
if (
  !migration.includes("14_relationship_capability_foundation.sql") ||
  !manifest.includes("20260904_mesh_governed_lifecycle_g3.sql")
)
  failures.push("G3 supported-upgrade migration is not manifest-owned");
for (const report of [
  "g3-clean-mesh-lifecycle-certification.json",
  "g3-upgrade-mesh-lifecycle-certification.json",
]) {
  const evidence = JSON.parse(
    await readFile(
      resolve(root, `../../docs/architecture/reports/${report}`),
      "utf8",
    ),
  ) as { passed?: boolean; probes?: Array<{ code: string; passed: boolean }> };
  if (!evidence.passed || !evidence.probes?.every((x) => x.passed))
    failures.push(`${report} is not passing`);
}
if (failures.length) {
  failures.forEach((x) => process.stderr.write(`FAIL ${x}\n`));
  process.exitCode = 1;
} else
  process.stdout.write(
    `PASS ${registry.controls.length} G3 controls inventoried; capability foundation is bounded, effective-dated and runtime read-only\n`,
  );
