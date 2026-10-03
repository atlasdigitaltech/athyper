/** Qualification only. Synthetic review contexts and EVERY authority/target mutation roll back. */
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {runWithRequestContext} from '@athyper/server-foundation/context';
import {Kysely,PostgresDialect,sql} from 'kysely';
import {Pool} from 'pg';
import {bootstrap} from '../../src/kernel/bootstrap.js';
import {publicationCompilerIdentity} from '../../src/composition/shared/publication/compiler-build.js';
import {createPublicationPolicyEnrollment} from '../../src/composition/shared/publication/policy-enrollment.js';
import {loadPublicationWorkloadConfiguration} from '../../src/composition/shared/publication/workload-configuration.js';
import {authorizeDeploymentRecovery} from '../../src/composition/shared/publication/deployment-recovery-authority.js';
import {deployHumanPublicationGroup} from '../../src/composition/shared/publication/human-publication-activation.js';
import {parseDeploymentRecoveryPolicy} from '../../src/composition/shared/publication/deployment-recovery-policy.js';
import {parseDeploymentRecoveryCompilerPolicy} from '../../src/composition/shared/publication/deployment-recovery-compiler.js';
const prefix='docs/reports/coordinated-release-';
const parent=parseDeploymentRecoveryPolicy(JSON.parse(readFileSync(prefix+'deployment-recovery-policy-20261003.json','utf8')));
const parentPin=JSON.parse(readFileSync(prefix+'deployment-recovery-activation-20261003.json','utf8')).result;
const candidate=parseDeploymentRecoveryCompilerPolicy({schema:'athyper.dev-deployment-recovery-compiler/1',policyId:`dev.recovery-compiler.${parentPin.id}`,revision:1,
 environment:'local',instance:'dev',authorityTenantId:parent.authorityTenantId,authorPrincipalId:parent.authorPrincipalId,publisherPrincipalId:parent.publisherPrincipalId,
 recoveryPolicy:{id:parentPin.id,hash:parentPin.hash,version:parentPin.version,compilerHash:parent.compiler.buildHash},compiler:publicationCompilerIdentity(),expiresAt:parent.expiresAt});
writeFileSync(prefix+'recovery-compiler-policy-20261003.json',JSON.stringify(candidate,null,2)+'\n');
const targets:{deploymentId:string;targetPlane:'studio'|'neon'|'mesh'}[]=JSON.parse(readFileSync(prefix+'deployment-recovery-execution-20261003.json','utf8')).result.targets;
const config=loadPublicationWorkloadConfiguration(process.env,process.env.ATHYPER_ENV!);
if(!config||process.env.ATHYPER_LOCAL_SOURCE!=='1'||!process.env.QUALIFICATION_DATABASE_URL||process.argv.length!==2)throw Error('DEV rollback qualification only');
const admin=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:new Pool({connectionString:process.env.QUALIFICATION_DATABASE_URL,max:1})})});
delete process.env.QUALIFICATION_DATABASE_URL;
const host=await bootstrap('worker');
const locals=Object.fromEntries(['neon','mesh'].map(plane=>[plane,new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool:new Pool({connectionString:process.env[plane.toUpperCase()+'_WORKER_DATABASE_URL'],max:1})})})])) as Record<'neon'|'mesh',Kysely<Record<string,never>>>;
const report:any={schema:'athyper.recovery-compiler-rehearsal/1',compiler:candidate.compiler,checks:[],actualHumanApprovalRecorded:false,committedActivations:0};
const rollback=Error('required rehearsal rollback'),tenant=parent.authorityTenantId;
const adminId='df0159b0-2bdc-55e8-944b-efaa9ed9b8e5',ownerId='41bf4855-6aa1-5e43-bc11-ee2cfa647693';
try{
 try{await runWithRequestContext({requestId:randomUUID(),planeKey:"studio",tenantId:tenant,principalId:parent.publisherPrincipalId},()=>admin.transaction().execute(async tx=>{
  await sql`SET LOCAL statement_timeout='30s'`.execute(tx);
  const actors=(await sql<{id:string;auth_epoch:number}>`SELECT id,auth_epoch FROM master.principal WHERE tenant_id=${tenant}::uuid`.execute(tx)).rows;
  const context=(id:string)=>({principalId:id,tenantId:tenant,planeKey:'studio',realmKey:'platform-control',assurance:'elevated',authEpoch:actors.find(a=>a.id===id)!.auth_epoch,requestId:randomUUID()} as any);
  let index=0;
  const bound=new Proxy(tx,{get(target,key){if(key==='transaction')return()=>{const b={setIsolationLevel:()=>b,execute:async(fn:any)=>{
   const savepoint=`rehearsal_${++index}`;await sql.raw(`SAVEPOINT ${savepoint}`).execute(tx);try{const result=await fn(tx);await sql.raw(`RELEASE SAVEPOINT ${savepoint}`).execute(tx);return result;}catch(e){await sql.raw(`ROLLBACK TO SAVEPOINT ${savepoint}`).execute(tx);throw e;}
  }};return b;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  const service=createPublicationPolicyEnrollment({database:bound,authorizer:{authorize:async()=>({allowed:true,reason:'synthetic rollback qualification only'})},
   audit:{async record(event,transaction){const result=(await sql<{id:string}>`SELECT audit.append_event(p_event_code:=${event.eventCode},p_operation:='execute'::audit.operation_d,p_entity_type:=${event.entityType!},p_entity_id:=${event.entityId!}::uuid,p_outcome:='success'::audit.outcome_d,p_severity:='critical'::audit.event_severity_d,p_context:=${JSON.stringify(event.metadata)}::jsonb) id`.execute(transaction!)).rows[0]!;return {...event,id:result.id,occurredAt:new Date().toISOString()};}},
   signer:{sign:async()=>{throw Error('No signing in rehearsal');},verify:async()=>false},environment:'local',instance:'dev',domainSuffix:'dev.athyper.test',
   authority:{tenantId:tenant,realmKey:'platform-control',issuer:'https://iam.dev.athyper.test/realms/platform-control',audience:'athyper-platform-control-api'}});
  await sql`SET LOCAL ROLE athyper_control_api`.execute(tx);
  const proposed=await service.propose(context(adminId),candidate);await service.activate(context(ownerId),proposed.id,proposed.hash);report.checks.push('synthetic_maker_checker_policy_and_audit_inside_rollback');
  await sql`SET LOCAL ROLE athyper_worker`.execute(tx);
  await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${parent.publisherPrincipalId},true)`.execute(tx);
  await authorizeDeploymentRecovery(tx,config,parent,parentPin);
  for(const target of targets)await sql`SELECT publication.fn_transition_deployment(${target.deploymentId}::uuid,'dispatched',${JSON.stringify({schema:'athyper.coordinated-deployment-retry/1',recoveryPolicyId:parentPin.id,recoveryPolicyHash:parentPin.hash,compilerHash:parent.compiler.buildHash,reason:'Rollback-only compiler reconciliation rehearsal of approved commands.'})}::jsonb)`.execute(tx);
  report.checks.push('worker_revalidated_both_policy_pins_and_preserved_commands');
  for(const plane of ['studio','neon','mesh'] as const){
   const o=host.container.services.publication?.orchestrators[plane] as any;if(!o)throw Error('Target unavailable');
   const work=async(local:any)=>{
    await sql`SELECT set_config('app.database_plane',${plane},true),set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${parent.publisherPrincipalId},true)`.execute(local);
    const active=await deployHumanPublicationGroup({deploymentId:targets.find(t=>t.targetPlane===plane)!.deploymentId,authority:tx,local,workload:config,loader:o.artifactLoader,activationGuard:o.activationGuard});
    if(!active)throw Error('Group activation required');report.checks.push(`${plane}:group_activated_and_acknowledged_inside_rollback`);
   };
   if(plane==='studio')await work(tx);
   else try{await locals[plane].transaction().execute(async local=>{await work(local);throw rollback;});}catch(e){if(e!==rollback)throw e;}
  }
  throw rollback;
 }));}catch(e){if(e!==rollback)throw e;}
 report.checks.push('all_policy_audit_retry_head_and_ack_changes_rolled_back');report.passed=true;
}catch(e:any){report.passed=false;report.error={code:e.code,message:e.message,where:e.where};process.exitCode=1;}
finally{await admin.destroy();await Promise.all(Object.values(locals).map(d=>d.destroy()));await host.lifecycle.shutdown('compiler_rehearsal');report.completedAt=new Date().toISOString();writeFileSync(prefix+'recovery-compiler-rehearsal-20261003.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
