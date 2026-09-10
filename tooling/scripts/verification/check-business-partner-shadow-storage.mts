// Exercises the real read-only adapter under the deployed database role.
// This is storage qualification, NOT authenticated HTTP/persona qualification.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createBusinessPartnerShadowScopes } from "../../../server/apps/platform-host/src/composition/business-partner-authorization-shadow.js";
import type { VerifiedRequestContext } from "../../../server/packages/contracts/auth/src/index.js";
const [environment, recordId, output] = process.argv.slice(2);
if (environment !== "dev" || !recordId || !/^[a-f0-9-]{36}$/.test(recordId) || !output) throw new Error("Usage: check-business-partner-shadow-storage.mts dev <BP UUID> <output.json>");
const require = createRequire(new URL("../../../server/apps/platform-host/package.json", import.meta.url));
const { Kysely, PostgresDialect } = require("kysely");
const dbRequire = createRequire(new URL("../../../server/packages/adapters/database/core/package.json", import.meta.url));
const { Pool } = dbRequire("pg");
const inspect = JSON.parse(execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }))[0];
const host = inspect.NetworkSettings.Networks["athyper-dev_data"].IPAddress;
const row = execFileSync("docker", ["exec", "athyper-dev-db-1", "psql", "-X", "-U", "postgres", "-d", "athyper_neon", "-Atc", `BEGIN READ ONLY; SELECT tenant_id FROM master.business_partner WHERE id='${recordId}'::uuid; COMMIT;`], { encoding: "utf8" }).split("\n").find(line => /^[a-f0-9-]{36}$/.test(line));
if (!row) throw new Error("BP storage fixture is absent");
const report = JSON.parse(readFileSync("governance/policy/reports/business-partner-role-review.dev.json", "utf8"));
const principal = report.candidates.find((c: {tenant_id:string}) => c.tenant_id === row)?.principal_id;
if (!principal) throw new Error("No inventoried principal for storage fixture tenant");
const pool = new Pool({host,port:5432,database:"athyper_neon",user:"athyper_runtime",password:readFileSync(`${homedir()}/.athyper/instances/dev/secrets/runtime-db-password`,"utf8").trim(),max:1,connectionTimeoutMillis:2000});
const db = new Kysely({dialect:new PostgresDialect({pool})});
const adapter = createBusinessPartnerShadowScopes(db);
const context = {tenantId:row,principalId:principal,planeKey:"neon"} as VerifiedRequestContext;
const scenarios = [
 {name:"stored_parent_exists_in_tenant",tenantId:row,id:recordId,expected:"resolved"},
 {name:"cross_tenant_parent_closed",tenantId:"00000000-0000-4000-8000-000000000001",id:recordId,expected:"invalid"},
 {name:"missing_parent_closed",tenantId:row,id:"00000000-0000-4000-8000-000000000002",expected:"invalid"},
];
try {
 const results=[];
 for(const scenario of scenarios){const result=await adapter.resolve({context:{...context,tenantId:scenario.tenantId},entityCode:"business_partner",operationKey:"read",recordId:scenario.id,phase:"discover",target:"existing",resolver:"tenant.record.v1",coordinates:{}});results.push({name:scenario.name,result:result.state,passed:result.state===scenario.expected});}
 writeFileSync(output,JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),environment,evidence:"real_database_adapter_with_inventoried_coordinates",authenticatedPersonaQualification:false,databaseRole:"athyper_runtime",recordRef:createHash("sha256").update(recordId).digest("hex"),grantChanges:[],results},null,2)+"\n");
 console.log(JSON.stringify({output,results}));if(results.some(r=>!r.passed))process.exitCode=1;
} catch { console.error("BP storage check failed; no database credentials or error details logged");process.exitCode=1; } finally {await db.destroy();}
