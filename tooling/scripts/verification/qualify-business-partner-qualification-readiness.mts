/** Read-only deployed-role SQL check, not authenticated release qualification. */
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
const require = createRequire(
  new URL("../../../server/apps/platform-host/package.json", import.meta.url),
);
const { Kysely, PostgresDialect, sql } = require("kysely");
const { Pool } = require("pg");
const { createBusinessPartnerStoredScopes } =
  await import("../../../server/apps/platform-host/src/composition/business-partner-stored-scopes.ts");
const { createKyselyContextRefresh } =
  await import("../../../server/packages/platform/iam/src/kysely-context-refresh.ts");
const inspection = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
const host = (Object.values(inspection.NetworkSettings.Networks)[0] as any)
  .IPAddress;
const password = readFileSync(
  `${homedir()}/.athyper/instances/dev/secrets/runtime-db-password`,
  "utf8",
).trim();
const database = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host,
      user: "athyper_runtime",
      password,
      database: "athyper_neon",
      connectionTimeoutMillis: 4000,
      ssl: false,
    }),
  }),
});

const {KyselyBusinessPartnerEligibilityRepository}=await import("../../../server/packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts");
const {createHash}=await import("node:crypto");
const tenant="44444444-4444-4444-8444-444444444444";
const checks: {name:string;passed:boolean}[]=[];
try {
 await database.transaction().execute(async (tx:any)=>{
  await sql`SET TRANSACTION READ ONLY`.execute(tx);
  await sql`SET LOCAL statement_timeout='5000ms'`.execute(tx);
  await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id','cca94907-7519-5871-8e3c-6b11aa545c93',true)`.execute(tx);
  const row=(await sql`SELECT bp.id::text bp, org.id::text org, company.id::text company
   FROM master.business_partner bp
   JOIN master.supplier supplier ON supplier.tenant_id=bp.tenant_id AND supplier.business_partner_id=bp.id
   JOIN master.operating_organization org ON org.tenant_id=bp.tenant_id AND org.status='active'
   JOIN master.operating_organization_company_assignment assignment ON assignment.tenant_id=org.tenant_id AND assignment.operating_organization_id=org.id AND assignment.status='active' AND assignment.effective_from<=current_date AND (assignment.effective_until IS NULL OR assignment.effective_until>current_date)
   JOIN master.company_code company ON company.tenant_id=org.tenant_id AND company.id=assignment.company_code_id AND company.status='active' AND company.is_active
   WHERE bp.tenant_id=${tenant}::uuid LIMIT 1`.execute(tx)).rows[0];
  if(!row)throw Error("QUALIFICATION_READINESS_SAMPLE_UNAVAILABLE");
  const repository=new KyselyBusinessPartnerEligibilityRepository();
  const base={tenantId:tenant,businessPartnerId:row.bp,operatingOrganizationId:row.org};
  checks.push({name:"organization_creation_ready",passed:await repository.qualificationTargetReady(base,tx)});
  checks.push({name:"company_creation_ready",passed:await repository.qualificationTargetReady({...base,companyCodeId:row.company},tx)});
  const absent="00000000-0000-4000-8000-000000000000";
  for(const coordinate of ["tenantId","businessPartnerId","operatingOrganizationId","companyCodeId"])
   checks.push({name:`reject_unknown_${coordinate}`,passed:!(await repository.qualificationTargetReady({...base,companyCodeId:row.company,[coordinate]:absent},tx))});
 });
 const paths=["server/packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts","server/packages/services/master-data/src/business-partner-eligibility-service.ts","server/apps/platform-host/src/composition/business-partner-qualification-runtime.ts"];
 const report={schemaVersion:1,capturedAt:new Date().toISOString(),kind:"bp_qualification_readiness_database_check",checks,sourceEvidence:paths.map(path=>({path,sha256:createHash("sha256").update(readFileSync(path)).digest("hex")})),readOnly:true,authenticatedQualification:false,exactReleaseQualified:false,grantsChanged:false,activationAuthorized:false};
 const output="governance/policy/reports/business-partner-qualification-readiness.dev.json";
 writeFileSync(output,JSON.stringify(report,null,2)+"\n");
 console.log({output,checks});
 if(checks.some(c=>!c.passed))process.exitCode=1;
} finally {await database.destroy();}
