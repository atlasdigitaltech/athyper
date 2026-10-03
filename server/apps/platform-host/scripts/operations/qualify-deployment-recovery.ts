/** Read-only qualification using effective DEV runtime database credentials. */
import {readFileSync,writeFileSync} from "node:fs";
import {Kysely,PostgresDialect,sql} from "kysely";
import {Pool} from "pg";
import type {MetaEntityGraph} from "@athyper/server-contract-meta-entity-authoring";
import type {PublicationPlane} from "@athyper/server-contract-publication";
import {compileGraph,compileSystemEntityTarget,sha256} from "@athyper/server-plane-studio-meta-entity-authoring";
import {loadPublicationWorkloadConfiguration} from "../../src/composition/shared/publication/workload-configuration.js";
import {assertDeploymentRecoverySource} from "../../src/composition/shared/publication/deployment-recovery-source.js";
import {parseDeploymentRecoveryPolicy} from "../../src/composition/shared/publication/deployment-recovery-policy.js";
import {assertPublicationWorkloadActor} from "../../src/composition/shared/publication/deployment-recovery-authority.js";
import {assertSuccessorTargetHeads} from "../../src/composition/shared/publication/successor-targets.js";
const [input,output]=process.argv.slice(2);
if(!input||!output||process.argv.length!==4)throw Error("Use <candidate.json> <report.json>");
const config=loadPublicationWorkloadConfiguration(process.env,process.env.ATHYPER_ENV!);
if(!config||process.env.ATHYPER_LOCAL_SOURCE!=="1")throw Error("DEV mounted source runtime required");
const policy=parseDeploymentRecoveryPolicy(JSON.parse(readFileSync(input,"utf8")));
const urls={studio:process.env.STUDIO_DATABASE_URL,neon:process.env.DATABASE_URL,mesh:process.env.MESH_DATABASE_URL};
const databases=Object.fromEntries(Object.entries(urls).map(([plane,url])=>{if(!url)throw Error("Target database required");return [plane,new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:new Pool({connectionString:url,max:1})})})];})) as Record<PublicationPlane,Kysely<Record<string,never>>>;
const report:{schema:string;compiler:unknown;checks:string[];passed:boolean;error?:{code?:string;message:string}}={schema:"athyper.deployment-recovery-preflight/1",compiler:policy.compiler,checks:[],passed:false};
try{
 const original=await databases.studio.transaction().execute(async tx=>{
  await sql`SET TRANSACTION READ ONLY`.execute(tx);
  await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(tx);
  const original=await assertDeploymentRecoverySource(tx,policy,config.tenantId);
  report.checks.push("eight_exact_signed_artifact_pins_and_current_compiler");
  for(const releaseId of new Set(policy.deliveries.map(d=>d.releaseId))){
   const value=(await sql<{value:{policy:unknown;sources:{changeSetId:string;graph:MetaEntityGraph}[]}}>`SELECT publication.fn_human_execution_context(${releaseId}::uuid) value`.execute(tx)).rows[0]!.value;
   if(sha256(value.policy)!==sha256(original))throw Error("Original policy changed");
   for(const member of original.plan.members){
    const graph=value.sources.find(s=>s.changeSetId===member.changeSetId)!.graph,compiled=compileGraph(graph);
    if(compiled.contractHash!==member.contractHash||compiled.descriptorHash!==member.descriptorHash)throw Error("Source recompilation drift");
    for(const pin of member.targets){const target=compileSystemEntityTarget(graph,pin.plane);if(target.artifact.contractHash!==pin.contractHash||target.artifact.descriptorHash!==pin.descriptorHash)throw Error("Target recompilation drift");}
   }
  }
  report.checks.push("six_original_execution_contexts_and_human_review_receipts","all_source_and_target_hashes_unchanged_under_recovery_build");
  return original;
 });
 for(const plane of ["studio","neon","mesh"] as const)await databases[plane].transaction().execute(async tx=>{
  await sql`SET TRANSACTION READ ONLY`.execute(tx);
  await sql`SELECT set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(tx);
  await assertPublicationWorkloadActor(tx,config,"publisher");
  await assertSuccessorTargetHeads(original.predecessors.flatMap(p=>p.targets).filter(t=>t.plane===plane),{[plane]:tx});
  report.checks.push(`${plane}:publisher_identity_epoch_and_predecessor_heads`);
 });
 report.passed=true;
}catch(error){report.error={code:(error as {code?:string}).code,message:error instanceof Error?error.message:"qualification failed"};process.exitCode=1;}
finally{await Promise.all(Object.values(databases).map(d=>d.destroy()));writeFileSync(output,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));}
