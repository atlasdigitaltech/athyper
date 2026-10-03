/** Read-only candidate preparation. This is not policy enrollment or approval. */
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {Kysely,PostgresDialect,sql} from "kysely";
import {Pool} from "pg";
import {sha256} from "@athyper/server-plane-studio-meta-entity-authoring";
import {publicationCompilerIdentity} from "../../src/composition/shared/publication/compiler-build.js";
import {parseDeploymentRecoveryPolicy} from "../../src/composition/shared/publication/deployment-recovery-policy.js";
import {validateDeploymentRecoverySource,type DeploymentRecoverySource} from "../../src/composition/shared/publication/deployment-recovery-source.js";
import {parseHumanReviewedExecutionPolicy} from "../../src/composition/shared/publication/human-publication-policy.js";
const [id,hash,output]=process.argv.slice(2);
if(process.argv.length!==5||!id||!/^[a-f0-9-]{36}$/.test(id)||!hash||!/^[a-f0-9]{64}$/.test(hash)||!output)throw Error("Use <original-policy-id> <hash> <output.json>");
const c=JSON.parse(execFileSync("docker",["inspect","athyper-dev-db-1"],{encoding:"utf8"}))[0];
if(c.Config.Labels["com.docker.compose.project"]!=="athyper-dev"||!c.State.Running)throw Error("DEV required");
const env=Object.fromEntries(c.Config.Env.map((v:string)=>[v.slice(0,v.indexOf("=")),v.slice(v.indexOf("=")+1)]));
const secret=c.Mounts.find((m:{Destination:string})=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;
if(!secret?.includes("/.athyper/instances/dev/secrets/"))throw Error("DEV secret required");
const db=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:new Pool({host:(Object.values(c.NetworkSettings.Networks)[0] as {IPAddress:string}).IPAddress,user:env.POSTGRES_USER,password:readFileSync(secret,"utf8").trim(),database:"athyper_studio",max:1})})});
try{
 const candidate=await db.transaction().setIsolationLevel("repeatable read").execute(async tx=>{
  await sql`SET TRANSACTION READ ONLY`.execute(tx);
  const row=(await sql<{tenant_id:string;policy:unknown}>`SELECT d.tenant_id,r.action_config->'policy' policy FROM control.policy_definition d
    JOIN control.policy_rule r ON r.policy_definition_id=d.id WHERE d.id=${id}::uuid AND d.definition_hash=${hash} AND d.status='active'`.execute(tx)).rows;
  if(row.length!==1)throw Error("Exact original policy required");const original=parseHumanReviewedExecutionPolicy(row[0]!.policy);
  await sql`SELECT set_config('app.current_tenant_id',${row[0]!.tenant_id},true),set_config('app.current_principal_id',${original.publisherPrincipalId},true)`.execute(tx);
  const source=(await sql<{value:DeploymentRecoverySource}>`SELECT publication.fn_coordinated_deployment_recovery_source(${id}::uuid,${hash}) value`.execute(tx)).rows[0]!.value;
  const policy=parseDeploymentRecoveryPolicy({schema:"athyper.dev-coordinated-deployment-recovery/1",policyId:`dev.coordinated-recovery.${id}`,revision:1,
    environment:"local",instance:"dev",authorityTenantId:original.authorityTenantId,authorPrincipalId:original.authorPrincipalId,publisherPrincipalId:original.publisherPrincipalId,
    compiler:publicationCompilerIdentity(),expiresAt:new Date(Date.now()+3*86400000).toISOString(),
    originalPolicy:{id,hash,version:source.version,compilerHash:original.compiler.buildHash,coordinationHash:sha256(original.plan)},
    deliveries:source.deliveries.map(({deploymentId,artifactId,artifactHash,releaseId,plane,attempt})=>({deploymentId,artifactId,artifactHash,releaseId,plane,attempt}))});
  validateDeploymentRecoverySource(policy,source);return policy;
 });
 writeFileSync(output,JSON.stringify(candidate,null,2)+"\n");
 console.log(JSON.stringify({output,deliveries:candidate.deliveries.length,compiler:candidate.compiler,expiresAt:candidate.expiresAt}));
}finally{await db.destroy();}
