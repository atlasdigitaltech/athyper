import { readFile, writeFile } from "node:fs/promises";
import { readDefinerContract, definerPrivilegesSql } from "../../../src/security/security-definer-contract.js";
const contract = await readDefinerContract();
const role = "athyper_definer_product_publication";
const owners = contract.exceptions.filter(e => e.owner === role);
if (!owners.length || owners.some(e => e.rowSecurityOff)) throw Error("RLS-bound product owner required");
const sql = definerPrivilegesSql({ ...contract, roles: contract.roles.filter(r => r.name === role) })
  + owners.map(e => `ALTER FUNCTION ${e.signature} OWNER TO ${role};`).join("\n") + "\n";
const target = new URL("../../../ddl/planes/studio/publication/20_product_publication_owner.sql",import.meta.url);
if (process.argv.includes("--check")) {
  if (await readFile(target,"utf8") !== sql) throw Error("Product publication owner SQL is stale");
} else await writeFile(target,sql);
console.log("PASS: bounded product publication owner matches contract");
