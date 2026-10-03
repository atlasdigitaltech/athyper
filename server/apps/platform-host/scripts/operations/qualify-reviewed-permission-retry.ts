/** Qualifies all target transactions under real worker connections, always rolling back.
 * Optional apply only resumes the already approved attempts; normal workers activate them. */
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Kysely,PostgresDialect,sql} from 'kysely';
import {Pool} from 'pg';
import {bootstrap} from '../../src/kernel/bootstrap.js';
import {runWithRequestContext} from '@athyper/server-foundation/context';
import {createKyselyPermissionResolver,createPermissionAuthorizer} from '@athyper/server-platform-iam';
import {loadPublicationWorkloadConfiguration} from '../../src/composition/shared/publication/workload-configuration.js';
import {authorizeDeploymentRecovery,assertPublicationWorkloadActor} from '../../src/composition/shared/publication/deployment-recovery-authority.js';
import {parseDeploymentRecoveryPolicy} from '../../src/composition/shared/publication/deployment-recovery-policy.js';
import {deployHumanPublicationGroup} from '../../src/composition/shared/publication/human-publication-activation.js';
import {MACHINE_PUBLICATION_PERMISSION} from '../../src/composition/shared/publication/machine-policy.js';
const args=process.argv.slice(2),apply=args.length===1&&args[0]==='--apply=DEV-REVIEWED-PERMISSION-RETRY';
if(args.length&&!apply)throw Error('Unsupported arguments');
const root='docs/reports/coordinated-release-',policy=parseDeploymentRecoveryPolicy(JSON.parse(readFileSync(root+'deployment-recovery-policy-20261003.json','utf8')));
const pin=JSON.parse(readFileSync(root+'deployment-recovery-activation-20261003.json','utf8')).result;
const targets: {deploymentId:string;targetPlane:'studio'|'neon'|'mesh'}[]=JSON.parse(readFileSync(root+'deployment-recovery-execution-20261003.json','utf8')).result.targets;
const config=loadPublicationWorkloadConfiguration(process.env,process.env.ATHYPER_ENV!);
if(!config||process.env.ATHYPER_LOCAL_SOURCE!=='1')throw Error('DEV mounted source worker required');
const host=await bootstrap('worker');
const databases=Object.fromEntries(['studio','neon','mesh'].map(plane=>{
 const url=process.env[plane.toUpperCase()+'_WORKER_DATABASE_URL'];if(!url)throw Error('Worker URL missing');
 return [plane,new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:new Pool({connectionString:url,max:1})})})];
})) as Record<'studio'|'neon'|'mesh',Kysely<Record<string,never>>>;
const iamDatabase=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:new Pool({connectionString:process.env.STUDIO_DATABASE_URL,max:1})})});
const report:any={schema:'athyper.reviewed-permission-retry-qualification/1',policy:pin,compiler:policy.compiler,checks:[],resumed:false};
const evidence={schema:'athyper.coordinated-deployment-retry/1',recoveryPolicyId:pin.id,recoveryPolicyHash:pin.hash,compilerHash:policy.compiler.buildHash,reason:'Worker execution grant repaired; retry unchanged approved commands after pre-receipt permission denial.'};
const rollback=Error('qualification rollback');
const stamp=async(tx:any)=>{await sql`SELECT set_config('app.database_plane',${'studio'},true),set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(tx);};
async function resume(tx:any,recordAudit=false){
 await stamp(tx);
 const current=(await sql<{role:string}>`SELECT current_user AS role`.execute(tx)).rows[0];if(current?.role!==(recordAudit?'athyper_runtime':'athyper_worker'))throw Error('Worker role required');
 const original=await authorizeDeploymentRecovery(tx,config!,policy,pin);
 const identity={planeKey:'studio' as const,realmKey:config!.realmKey,tenantId:config!.tenantId,principalId:config!.publisher.principalId,authEpoch:config!.publisher.authEpoch};
 const permissions=await createKyselyPermissionResolver({run:(_identity,work)=>recordAudit?work(tx):iamDatabase.transaction().execute(async iam=>{await sql`SET TRANSACTION READ ONLY`.execute(iam);await stamp(iam);return work(iam);})}).resolve(identity);
 const authorizer=createPermissionAuthorizer({policyGate:{async evaluate(input){
  const allowed=input.permissionCode===MACHINE_PUBLICATION_PERMISSION&&original.plan.members.some(m=>m.entityId===input.resource?.entityId&&m.changeSetId===input.resource?.changeSetId);
  return {allowed,sodSatisfied:allowed,reason:'reviewed_deployment_permission_retry'};
 }}});
 for(const member of original.plan.members){const decision=await authorizer.authorize({context:{...identity,permissions,profileHash:permissions.profileHash,requestId:randomUUID()},permissionCode:MACHINE_PUBLICATION_PERMISSION,resource:{tenantId:config!.tenantId,recordId:member.changeSetId,changeSetId:member.changeSetId,entityId:member.entityId}});if(!decision.allowed)throw Error('Actual workload IAM denied');}
 for(const target of targets)await sql`SELECT publication.fn_transition_deployment(${target.deploymentId}::uuid,'dispatched',${JSON.stringify(evidence)}::jsonb)`.execute(tx);
 if(recordAudit)await sql`SELECT audit.append_event(p_event_code:='metadata.entity.product.publication',p_operation:='execute'::audit.operation_d,
 p_entity_type:='control.policy_definition',p_entity_id:=${pin.id}::uuid,p_outcome:='success'::audit.outcome_d,
 p_severity:='critical'::audit.event_severity_d,p_context:=${JSON.stringify({stage:'reviewed_permission_retry',policy:pin,targets,evidence})}::jsonb)`.execute(tx);
}
try{
 await runWithRequestContext({requestId:randomUUID(),planeKey:'studio',tenantId:config.tenantId,principalId:config.publisher.principalId},async()=>{
 try{await databases.studio.transaction().execute(async authority=>{
  await resume(authority);report.checks.push('actual_worker_policy_compiler_identity_iam_and_audited_retry');
  for(const plane of ['studio','neon','mesh'] as const){
   const o=host.container.services.publication?.orchestrators[plane] as any;
   if(!o)throw Error('Target orchestrator unavailable');
   const target=targets.find(t=>t.targetPlane===plane)!;
   const work=async(local:any)=>{
    await sql`SELECT set_config('app.database_plane',${plane},true),set_config('app.current_tenant_id',${config.tenantId},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(local);
    await assertPublicationWorkloadActor(local,config,'publisher');
    const result=await deployHumanPublicationGroup({deploymentId:target.deploymentId,authority,local,workload:config,loader:{load:async(d:any)=>{const a=await o.artifactLoader.load(d);const e=a.document.envelope;report.artifactChecks??=[];report.artifactChecks.push({plane,publicationKey:d.publicationKey,sourceReleaseNo:d.sourceReleaseNo,envelopeReleaseNo:e.releaseNo,kind:e.artifactKind,tenantId:e.payload.tenantId,entityCode:e.payload.entityCode,hashMatches:a.computedArtifactHash===d.artifactHash,releaseMatches:e.releaseId===d.sourceReleaseId,verification:a.verification});return a;}},activationGuard:o.activationGuard});
    if(!result)throw Error('Coordinated activation required');
    report.checks.push(plane+':signed_group_qualified_activated_and_acknowledged_inside_rollback');
   };
   if(plane==='studio')await work(authority);
   else try{await databases[plane].transaction().execute(async local=>{await work(local);throw rollback;});}catch(e){if(e!==rollback)throw e;}
  }
  throw rollback;
 });}catch(e){if(e!==rollback)throw e;}
 report.checks.push('all_target_and_authority_probe_changes_rolled_back');
 if(apply){await iamDatabase.transaction().execute(tx=>resume(tx,true));report.resumed=true;}
 });
 report.passed=true;
}catch(e:any){report.passed=false;report.error={code:e.code,message:e.message,where:e.where,stack:e.stack};process.exitCode=1;}
finally{await iamDatabase.destroy();await Promise.all(Object.values(databases).map(d=>d.destroy()));await host.lifecycle.shutdown('reviewed_retry_qualification');report.completedAt=new Date().toISOString();writeFileSync(root+'permission-retry-qualification-20261003.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
