/** Verify the persisted review snapshot after authenticated submission. */
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



const receipt=JSON.parse(readFileSync('governance/policy/reports/business-partner-combined-authoring.dev.json','utf8'));
const approvedMode=process.argv.includes('--approved');
const approval=approvedMode?JSON.parse(readFileSync('governance/policy/reports/business-partner-combined-approval.dev.json','utf8')):null;
try {await database.transaction().execute(async(tx:any)=>{
 await sql`SET TRANSACTION READ ONLY`.execute(tx);
 await sql`SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),set_config('app.current_principal_id','81cd1978-2df5-5c9a-938a-2f8c291aea13',true)`.execute(tx);
 const row=(await sql`SELECT cs.id::text,cs.status,cs.lock_version,cs.created_by::text,cs.submitted_by::text,cs.approved_by::text,
 revision.id::text revision_id,revision.revision_no,revision.contract_json,revision.contract_hash,revision.validation_status
 FROM metadata.entity_change_set cs JOIN snapshot.entity_contract_revision revision ON revision.change_set_id=cs.id
 WHERE cs.id=${receipt.changeSetId}::uuid AND cs.tenant_id='44444444-4444-4444-8444-444444444444'::uuid
 ORDER BY revision.revision_no DESC LIMIT 1`.execute(tx)).rows[0];
 if(!row||row.validation_status!=='valid')throw Error('COMBINED_REVIEW_STATE_CHANGED');
 if(approvedMode){
  if(!approval.approved||approval.changeSetId!==row.id||row.status!=='approved'||Number(row.lock_version)!==3||row.approved_by!=='5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d'||row.created_by!=='81cd1978-2df5-5c9a-938a-2f8c291aea13'||row.submitted_by!==row.created_by)throw Error('COMBINED_INDEPENDENT_APPROVAL_CHANGED');
 }else if(row.status!=='in_review'||row.approved_by!==null||Number(row.lock_version)!==receipt.revision)throw Error('COMBINED_REVIEW_STATE_CHANGED');
 const {validateGraph,compileGraph}=await import('../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js');
 const graph=row.contract_json,compiled=compileGraph(graph),validation=validateGraph(graph);
 const report=JSON.parse(readFileSync('governance/policy/reports/business-partner-combined-successor.dev.json','utf8'));
 const {combinedHash}=await import('./entity-authorization/combined-successor.mjs');
 const {parseEntityAuthorizationRuntime}=await import('../../../server/packages/contracts/metadata/src/entity-authorization-runtime.js');
 const expectedRuntime=parseEntityAuthorizationRuntime(report.descriptor.authorizationRuntime,report.descriptor.authorization);

 if(validation.issues.length||compiled.contractHash!==receipt.steps.find((s:any)=>s.step==='validate'&&s.status===200).body.contractHash||combinedHash(compiled.descriptor.ai)!==report.preservedAtlasHash||combinedHash(compiled.descriptor.authorization)!==combinedHash(report.descriptor.authorization)||combinedHash(compiled.descriptor.authorizationRuntime)!==combinedHash(expectedRuntime))throw Error('COMBINED_PERSISTED_CONTENT_CHANGED');
 const evidence={schemaVersion:1,kind:'bp_combined_persisted_review',capturedAt:new Date().toISOString(),reviewRevision:report.reviewRevision,changeSetId:row.id,status:row.status,changeSetRevision:Number(row.lock_version),snapshotRevisionId:row.revision_id,persistedNativeContractHash:compiled.contractHash,nativeRuntimeHash:combinedHash(expectedRuntime),runtimeBindingOrderNormalized:true,sourceGraphHash:report.nativeGraphHash,persistedGraph:graph,atlasPreserved:true,authorizationPreserved:true,approvalRecorded:false,published:false,grantsChanged:false,activationAuthorized:false};
 if(approvedMode&&(approval.persistedNativeContractHash!==compiled.contractHash||approval.reviewRevision!==report.reviewRevision))throw Error('COMBINED_APPROVED_CONTENT_CHANGED');
 const output=approvedMode?{...evidence,kind:'bp_combined_persisted_approval',approvalRecorded:true,approvedBy:row.approved_by,createdBy:row.created_by,submittedBy:row.submitted_by}:evidence;
 writeFileSync(approvedMode?'governance/policy/reports/business-partner-combined-persisted-approval.dev.json':'governance/policy/reports/business-partner-combined-persisted-review.dev.json',JSON.stringify(output,null,2)+'\n');
 console.log({changeSetId:row.id,status:row.status,persistedNativeContractHash:compiled.contractHash,atlasPreserved:true,authorizationPreserved:true});
});}finally{await database.destroy();}
