/** Controlled upstream risk assessments for fresh P7 suppliers. Company, qualification and activation use owning APIs separately. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { KyselyBusinessPartnerEligibilityRepository } from "../../../server/packages/services/master-data/src/kysely-business-partner-eligibility-repository.js";
const require = createRequire(
    new URL("../../../server/db/package.json", import.meta.url),
  ),
  { Pool } = require("pg"),
  { Kysely, PostgresDialect, sql } = require("kysely");
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: execFileSync(
        "docker",
        [
          "inspect",
          "--format",
          "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
          "athyper-dev-db-1",
        ],
        { encoding: "utf8" },
      ).trim(),
      user: "postgres",
      database: "athyper_neon",
      password: readFileSync(
        `${process.env.HOME}/.athyper/instances/dev/secrets/postgres-password`,
        "utf8",
      ).trim(),
    }),
  }),
});
const tenant = "44444444-4444-4444-8444-444444444444",
  maker = "cca94907-7519-5871-8e3c-6b11aa545c93",
  checker = "645b6a55-3355-526a-9643-3900425bde47",
  date = new Date().toISOString().slice(0, 10),
  repository = new KyselyBusinessPartnerEligibilityRepository();
const report:any={at:new Date().toISOString(),boundary:"Controlled upstream risk assessments only; no synthetic company, qualification or activation result",cases:[]};
const fixtures=JSON.parse(readFileSync("governance/policy/reports/supplier-communications-activation-live.dev.json","utf8")).cases;
try {for(const c of fixtures){await db.transaction().execute(async(tx:any)=>{
 await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${maker},true),set_config('app.database_plane','neon',true)`.execute(tx);
 const target=(await sql`SELECT s.id,b.name FROM master.supplier s JOIN master.business_partner b ON b.tenant_id=s.tenant_id AND b.id=s.business_partner_id WHERE s.tenant_id=${tenant}::uuid AND b.id=${c.businessPartnerId}::uuid`.execute(tx)).rows[0];assert.match(target.name,/^DEV P7 (basic|standard|enhanced) /);
 let risk=(await sql`SELECT id FROM master.party_risk_assessment WHERE tenant_id=${tenant}::uuid AND business_partner_id=${c.businessPartnerId}::uuid AND notes='P7 controlled upstream risk fixture' ORDER BY assessed_at DESC LIMIT 1`.execute(tx)).rows[0];
 if(!risk)risk=(await sql`INSERT INTO master.party_risk_assessment(tenant_id,subject_type,subject_id,business_partner_id,assessment_context,model_code,model_version,risk_band,status,assessed_at,assessed_by,approved_at,approved_by,next_review_at,notes,created_by) VALUES(${tenant}::uuid,'supplier',${target.id}::uuid,${c.businessPartnerId}::uuid,'supplier_role','standard_supplier','1.0','low','approved',now(),${maker}::uuid,now(),${checker}::uuid,${date}::date+30,'P7 controlled upstream risk fixture',${maker}::uuid) RETURNING id`.execute(tx)).rows[0];
 report.cases.push({caseId:c.id,riskId:risk.id});
 });}writeFileSync("governance/policy/reports/supplier-communications-risk-fixture.dev.json",JSON.stringify(report,null,2)+"\n");console.log("Three scoped upstream risk fixtures ready; no activation performed.");}finally{await db.destroy();}
