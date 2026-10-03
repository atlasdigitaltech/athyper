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
const artifacts = new Map([
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
