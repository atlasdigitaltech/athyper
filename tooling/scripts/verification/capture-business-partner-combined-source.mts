/** Capture the approved Atlas predecessor without changing releases or grants. */
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
const require = createRequire(
  new URL("../../../server/apps/platform-host/package.json", import.meta.url),
);
const { Kysely, PostgresDialect, sql } = require("kysely");
const { Pool } = require("pg");
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
      database: "athyper_studio",
      connectionTimeoutMillis: 4000,
      ssl: false,
    }),
  }),
});


try {await database.transaction().execute(async(tx:any)=>{
 await sql`SET TRANSACTION READ ONLY`.execute(tx);
 await sql`SET LOCAL statement_timeout='5000ms'`.execute(tx);
 await sql`SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),set_config('app.current_principal_id','81cd1978-2df5-5c9a-938a-2f8c291aea13',true)`.execute(tx);
 const rows=(await sql`SELECT pr.id::text publication_release_id,pr.release_no,pr.status,pr.release_key,pr.tenant_id::text,
  er.id::text entity_release_id,er.revision_id::text,er.entity_id::text,er.change_set_id::text,cs.approved_by::text,cs.created_by::text,cs.submitted_by::text,
  a.id::text descriptor_id,a.plane_key,a.compiled_json descriptor,a.compiled_hash,
  revision.contract_json authored_contract,baseline.payload baseline
  FROM publication.release pr JOIN publication.entity_baseline_release_link link ON link.publication_release_id=pr.id AND link.tenant_id=pr.tenant_id
  JOIN metadata.entity_release er ON er.id=link.entity_release_id AND er.tenant_id=link.tenant_id
  JOIN metadata.entity_change_set cs ON cs.id=er.change_set_id AND cs.tenant_id=er.tenant_id
  JOIN snapshot.entity_contract_revision revision ON revision.id=er.revision_id
  JOIN snapshot.entity_release_artifact a ON a.source_release_id=er.id AND a.tenant_id=er.tenant_id AND a.plane_key='neon'
  JOIN metadata.entity_baseline_import baseline ON baseline.id=link.baseline_id AND baseline.tenant_id=link.tenant_id
  WHERE pr.id='126721f6-a2e5-45e2-91bf-0d6a1b660c56'::uuid
    AND pr.tenant_id='44444444-4444-4444-8444-444444444444'::uuid
    AND pr.status IN ('approved','published') AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
    AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation revoked WHERE revoked.baseline_id=baseline.id)`.execute(tx)).rows;
 if(rows.length!==1)throw Error("COMBINED_PREDECESSOR_UNAVAILABLE");
 const source=rows[0];
 if(Number(source.release_no)!==18||source.release_key!=='metadata.entity.business_partner.local-master-data.cirrusatlantic'||!source.descriptor.ai?.enabled)throw Error("COMBINED_PREDECESSOR_CHANGED");
 const report={schemaVersion:1,kind:'bp_combined_successor_source',capturedAt:new Date().toISOString(),source,readOnly:true,grantsChanged:false,activationAuthorized:false};
 const path='governance/policy/reports/business-partner-combined-source.dev.json';
 writeFileSync(path,JSON.stringify(report,null,2)+'\n');console.log({path,releaseNo:Number(source.release_no),status:source.status,aiEnabled:source.descriptor.ai.enabled});
});}finally{await database.destroy();}
