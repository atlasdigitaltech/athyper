#!/usr/bin/env tsx
/** Verifies exact signature ownership, explicit RLS exceptions, and safe owner attributes. */
import postgres from "postgres";
import { readDefinerContract } from "../../../src/security/security-definer-contract.js";
import { boundaryCatalogQueries, definerCatalogErrors, runtimeRoleErrors, type DefinerRow, type RoleRow, type MembershipRow } from "../../../src/security/plane-boundary-catalog.js";

const databaseUrl = process.env["ATHYPER_PLATFORM_DATABASE_ADMIN_URL"] ?? process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("ATHYPER_PLATFORM_DATABASE_ADMIN_URL or DATABASE_URL is required");
// This setting applies only to the three enumerated DDL/maintenance signatures.
// Ordinary owners are fixed, non-login roles in the shared ownership contract.
const ddlOwner = process.env["SECDEF_DDL_OWNER"]?.trim() || process.env["SECDEF_EXPECTED_OWNER"]?.trim() || "postgres";
const contract = await readDefinerContract();
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
try {
  await sql.begin("read only", async transaction => {
    const functions = await transaction.unsafe<DefinerRow[]>(boundaryCatalogQueries.functions);
    const roles = await transaction.unsafe<RoleRow[]>(boundaryCatalogQueries.roles);
    const memberships = await transaction.unsafe<MembershipRow[]>(boundaryCatalogQueries.memberships);
    const errors = [...definerCatalogErrors(functions, roles, contract, ddlOwner), ...runtimeRoleErrors(roles, memberships, contract.roles.map(role => role.name))];
    for (const error of errors) console.error(`FAIL: ${error}`);
    console.log(`SECURITY DEFINER catalog: ${functions.length} functions; ${functions.filter(fn => fn.rowSecurityOff).length} explicit bypasses; ${errors.length} failures`);
    if (errors.length) throw new Error("SECURITY DEFINER ownership or role qualification failed");
    console.log("PASS: explicit signature exceptions, RLS-bound ordinary owners, PUBLIC revoke, search_path, and runtime role membership checks hold");
  });
} finally { await sql.end(); }
