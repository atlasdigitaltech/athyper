#!/usr/bin/env tsx
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readDefinerContract, definerPrivilegesSql, definerHardeningSql } from "../../../src/security/security-definer-contract.js";

const contract = await readDefinerContract();
const grants = definerPrivilegesSql(contract);
const hardening = definerHardeningSql(contract);
// Installed migrations are immutable snapshots. Evolving this contract requires
// a new forward migration, never regenerating an already-applied migration.
const migrationPath = "migrations/20261002_security_definer_ownership.sql";
const inventory = JSON.parse(await readFile(new URL("../../../migrations/inventory.json", import.meta.url), "utf8"));
const migration = await readFile(new URL(`../../../${migrationPath}`, import.meta.url));
if (inventory.entries.find((entry: { path: string }) => entry.path === migrationPath)?.sha256 !== createHash("sha256").update(migration).digest("hex"))
  throw Error("Installed security-definer migration differs from its immutable inventory pin");
const onboarding = await Promise.all(["07_functions.sql", "10_rls.sql", "11_grants.sql"].map(name =>
  readFile(new URL(`../../../ddl/planes/studio/onboarding/${name}`, import.meta.url), "utf8")));
const meshGrants = await readFile(new URL("../../../ddl/planes/mesh/mesh/11_grants.sql", import.meta.url), "utf8");
const meshSnapshot = meshGrants.match(/CREATE OR REPLACE FUNCTION mesh\.fn_catalog_publication_snapshot\([\s\S]*?\$\$;/)?.[0];
if (!meshSnapshot) throw new Error("Canonical catalog snapshot definition is missing");
const upgrades = `DO $entity_security$ BEGIN
  IF current_database()='athyper_studio' THEN
    EXECUTE $onboarding_upgrade$${onboarding.join("\n")}$onboarding_upgrade$;
  ELSIF current_database()='athyper_mesh' THEN
    EXECUTE $mesh_upgrade$${meshSnapshot}
      DROP POLICY IF EXISTS worker_write ON mesh.business_partner_delivery_acknowledgement;
      CREATE POLICY worker_write ON mesh.business_partner_delivery_acknowledgement FOR INSERT TO athyper_jobs_service
        WITH CHECK (source_tenant_id=shared.current_tenant_id_soft());
      DROP POLICY IF EXISTS worker_read ON mesh.business_partner_delivery_acknowledgement;
      CREATE POLICY worker_read ON mesh.business_partner_delivery_acknowledgement FOR SELECT TO athyper_jobs_service
        USING (source_tenant_id=shared.current_tenant_id_soft());
    $mesh_upgrade$;
  ELSIF current_database()<>'athyper_neon' THEN
    RAISE EXCEPTION 'Entity Framework security upgrade requires an established plane database';
  END IF;
END $entity_security$;
`;
const artifacts = new Map([
  [new URL("../../../migrations/20261003_entity_framework_security.sql", import.meta.url),
    `-- Successor security correction; preserves previously installed migration bytes.\nBEGIN;\n${upgrades}\n${grants}\n${hardening}\nCOMMIT;\n`],
  [new URL("../../../ddl/common/shared/98_security_definer_privileges.sql", import.meta.url), grants],
  [new URL("../../../ddl/common/shared/99_security_definer_hardening.sql", import.meta.url), hardening],
]);
for (const [url, content] of artifacts) {
  if (process.argv.includes("--check")) {
    if (await readFile(url, "utf8") !== content) throw new Error(`Generated definer contract is stale: ${url.pathname}`);
  } else await writeFile(url, content);
}
for (const plane of ["neon", "studio", "mesh"]) {
  const manifest = await readFile(new URL(`../../../ddl/planes/${plane}/_manifest.txt`, import.meta.url), "utf8");
  const entries = manifest.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#"));
  if (entries.at(-1) !== "common/shared/99_security_definer_hardening.sql" || entries.at(-2) !== "common/shared/98_security_definer_privileges.sql")
    throw new Error(`${plane}: privilege contract and hardening must be the final manifest entries`);
}
console.log(`PASS: ${artifacts.size} security-definer artifacts ${process.argv.includes("--check") ? "match" : "generated from"} the ownership contract`);
