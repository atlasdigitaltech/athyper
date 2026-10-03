import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { runWithRequestContext } from "@athyper/server-foundation/context";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import { createPublicationPolicyEnrollment } from "./policy-enrollment.js";
import { publicationCompilerIdentity } from "./compiler-build.js";
import { parseDeploymentRecoveryPolicy } from "./deployment-recovery-policy.js";
import { executeDeploymentRecovery } from "./deployment-recovery-execution.js";
import { coordinatedApplyPrincipal } from "./apply-identity.js";
import type { DeploymentRecoverySource } from "./deployment-recovery-source.js";
import { parseHumanReviewedExecutionPolicy } from "./human-publication-policy.js";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import { findDeploymentRecovery } from "./deployment-recovery-authority.js";

import {assertDeploymentRecoveryCompiler,parseDeploymentRecoveryCompilerPolicy} from "./deployment-recovery-compiler.js";
// Qualification only: synthetic test contexts and all policy/audit mutations roll back.
it.skipIf(process.env.DEPLOYMENT_RECOVERY_COMPILER_POSTGRES !== "1")("qualifies compiler approval without changing recovery commands or granting source authority",async()=>{
  const c=JSON.parse(execFileSync("docker",["inspect","athyper-dev-db-1"],{encoding:"utf8"}))[0];
  if(c.Config.Labels["com.docker.compose.project"]!=="athyper-dev"||!c.State.Running)throw Error("DEV required");
  const env=Object.fromEntries(c.Config.Env.map((v:string)=>[v.slice(0,v.indexOf("=")),v.slice(v.indexOf("=")+1)]));
  const path=c.Mounts.find((m:{Destination:string})=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;
  if(!path?.includes("/.athyper/instances/dev/secrets/"))throw Error("DEV secret required");
  const pool=new Pool({host:(Object.values(c.NetworkSettings.Networks)[0] as {IPAddress:string}).IPAddress,user:env.POSTGRES_USER,password:readFileSync(path,"utf8").trim(),database:"athyper_studio",max:3});
  const db=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool})});
  const root=new URL("../../../../../../../",import.meta.url), tenant="11111111-1111-4111-8111-111111111111";
  const originalId="7886bdc7-6a64-4145-9e71-d610ca9a3a91",originalHash="f83745496f6130b300dcb1da6514d4f6079a5c2af720594908b576e9a92da76f";
  const adminId="df0159b0-2bdc-55e8-944b-efaa9ed9b8e5",ownerId="41bf4855-6aa1-5e43-bc11-ee2cfa647693";
  const snapshot=async()=> (await sql`SELECT id,status,command_id FROM publication.deployment ORDER BY id`.execute(db)).rows;

 const before=await snapshot(),rollback=Error('compiler qualification rollback');
 const parent=parseDeploymentRecoveryPolicy(JSON.parse(readFileSync(new URL('docs/reports/coordinated-release-deployment-recovery-policy-20261003.json',root),'utf8')));
 const parentPin=JSON.parse(readFileSync(new URL('docs/reports/coordinated-release-deployment-recovery-activation-20261003.json',root),'utf8')).result;
 try{await expect(db.transaction().execute(async tx=>{
  const actors=(await sql<{id:string;code:string;auth_epoch:number}>`SELECT id,code,auth_epoch FROM master.principal WHERE tenant_id=${tenant}::uuid`.execute(tx)).rows;
  const ctx=(id:string)=>({principalId:id,tenantId:tenant,planeKey:'studio',realmKey:'platform-control',assurance:'elevated',authEpoch:actors.find(a=>a.id===id)!.auth_epoch,requestId:randomUUID()} as VerifiedRequestContext);
  let count=0,failAudit=false;
  const bound=new Proxy(tx,{get(target,key){if(key==='transaction')return()=>{
   const builder={setIsolationLevel:()=>builder,execute:async(fn:(t:typeof tx)=>Promise<unknown>)=>{
    const name=`compiler_test_${++count}`;await sql.raw(`SAVEPOINT ${name}`).execute(tx);
    try{const result=await fn(tx);await sql.raw(`RELEASE SAVEPOINT ${name}`).execute(tx);return result;}
    catch(e){await sql.raw(`ROLLBACK TO SAVEPOINT ${name}`).execute(tx);throw e;}
   }};return builder;
  };const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
  const audit:AuditRecorder<Kysely<Record<string,never>>>={async record(event,transaction){
   const result=await sql<{id:string}>`SELECT audit.append_event(p_event_code:=${event.eventCode},p_operation:='execute'::audit.operation_d,
    p_entity_type:=${event.entityType!},p_entity_id:=${event.entityId!}::uuid,p_outcome:='success'::audit.outcome_d,
    p_severity:='critical'::audit.event_severity_d,p_context:=${JSON.stringify(event.metadata)}::jsonb) id`.execute(transaction!);
   if(failAudit)throw Error('audit failure');return {...event,id:result.rows[0]!.id,occurredAt:new Date().toISOString()};
  }};
  const service=createPublicationPolicyEnrollment({database:bound,authorizer:{authorize:async()=>({allowed:true,reason:'qualification only'})},audit,
   signer:{sign:async()=>{throw Error('unexpected signing');},verify:async()=>false},environment:'local',instance:'dev',domainSuffix:'dev.athyper.test',
   authority:{tenantId:tenant,realmKey:'platform-control',issuer:'https://iam.dev.athyper.test/realms/platform-control',audience:'athyper-platform-control-api'}});
  const policy=parseDeploymentRecoveryCompilerPolicy({schema:'athyper.dev-deployment-recovery-compiler/1',policyId:`qualification.compiler.${randomUUID()}`,
   revision:1,environment:'local',instance:'dev',authorityTenantId:tenant,authorPrincipalId:parent.authorPrincipalId,publisherPrincipalId:parent.publisherPrincipalId,
   recoveryPolicy:{id:parentPin.id,hash:parentPin.hash,version:parentPin.version,compilerHash:parent.compiler.buildHash},compiler:publicationCompilerIdentity(),expiresAt:parent.expiresAt});
  const stamp=async(actor:string)=>{await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true)`.execute(tx);};
  await sql`SET LOCAL ROLE athyper_worker`.execute(tx);await stamp(parent.publisherPrincipalId);
  await expect(assertDeploymentRecoveryCompiler(tx,parent,tenant)).rejects.toThrow('COMPILER_APPROVAL_REQUIRED');
  await sql`SET LOCAL ROLE athyper_control_api`.execute(tx);
  await expect(service.propose(ctx(adminId),{...policy,recoveryPolicy:{...policy.recoveryPolicy,hash:'0'.repeat(64)}})).rejects.toThrow('COMPILER_ENROLLMENT_CHANGED');
  await expect(service.propose(ctx(adminId),{...policy,compiler:{...policy.compiler,buildHash:'0'.repeat(64)}})).rejects.toThrow('COMPILER_BUILD_CHANGED');
  const competing=await pool.connect();
  await sql`SET LOCAL lock_timeout='250ms'`.execute(tx);
  try{await competing.query('BEGIN');await competing.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`deployment-recovery:${tenant}:${parent.originalPolicy.id}`]);
    await expect(service.propose(ctx(adminId),policy)).rejects.toMatchObject({code:'55P03'});
  }finally{await competing.query('ROLLBACK');competing.release();}
  const proposed=await service.propose(ctx(adminId),policy);
  await expect(service.activate(ctx(adminId),proposed.id,proposed.hash)).rejects.toThrow();
  await expect(service.activate(ctx(ownerId),proposed.id,'0'.repeat(64))).rejects.toThrow('PIN_MISMATCH');
  failAudit=true;await expect(service.activate(ctx(ownerId),proposed.id,proposed.hash)).rejects.toThrow('audit failure');failAudit=false;
  expect((await sql<{status:string}>`SELECT status FROM control.policy_definition WHERE id=${proposed.id}::uuid`.execute(tx)).rows[0]!.status).toBe('pending_approval');
  await service.activate(ctx(ownerId),proposed.id,proposed.hash);
  const duplicate=await service.propose(ctx(adminId),{...policy,policyId:`qualification.compiler.${randomUUID()}`});
  await expect(service.activate(ctx(ownerId),duplicate.id,duplicate.hash)).rejects.toThrow('COMPILER_ALREADY_ACTIVE');
  await sql`SET LOCAL ROLE athyper_worker`.execute(tx);await stamp(parent.publisherPrincipalId);
  await expect(assertDeploymentRecoveryCompiler(tx,parent,tenant)).resolves.toBeUndefined();
  await expect(assertDeploymentRecoveryCompiler(tx,{...parent,deliveries:parent.deliveries.slice(1)},tenant)).rejects.toThrow('COMPILER_PARENT_REQUIRED');
  await stamp(adminId);await expect(assertDeploymentRecoveryCompiler(tx,parent,tenant)).rejects.toThrow('COMPILER_APPROVAL_REVOKED');
  await stamp(parent.publisherPrincipalId);
  await sql`RESET ROLE`.execute(tx);await sql`SAVEPOINT revoke`.execute(tx);
  await sql`UPDATE master.principal SET status='suspended' WHERE id=${ownerId}::uuid AND tenant_id=${tenant}::uuid`.execute(tx);
  await sql`SET LOCAL ROLE athyper_worker`.execute(tx);await expect(assertDeploymentRecoveryCompiler(tx,parent,tenant)).rejects.toThrow('COMPILER_APPROVAL_REVOKED');
  await sql`ROLLBACK TO SAVEPOINT revoke`.execute(tx);
  await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);await stamp(parent.publisherPrincipalId);
  const actor=(id:string)=>{const row=actors.find(a=>a.id===id)!;return {principalId:id,code:row.code,authEpoch:row.auth_epoch,credentialSha256:'a'.repeat(64)};};
  const config={environment:'local',instance:'dev',domainSuffix:'dev.athyper.test',tenantId:tenant,realmKey:'platform-control',author:actor(parent.authorPrincipalId),publisher:actor(parent.publisherPrincipalId)};
  const enqueue=vi.fn(async()=>randomUUID());
  const deps={database:bound,jobs:{enqueue},audit,targets:{databases:{studio:bound,neon:bound,mesh:bound}}} as unknown as Parameters<typeof executeDeploymentRecovery>[3];
  const execute=()=>runWithRequestContext({requestId:randomUUID(),planeKey:'studio',tenantId:tenant,principalId:parent.publisherPrincipalId},()=>executeDeploymentRecovery(config,parent,parentPin,deps));
  failAudit=true;await expect(execute()).rejects.toThrow('audit failure');failAudit=false;expect(enqueue).not.toHaveBeenCalled();
  const result=await execute();expect(result.targets).toHaveLength(8);expect(enqueue).toHaveBeenCalledTimes(8);
  const expected=JSON.parse(readFileSync(new URL('docs/reports/coordinated-release-deployment-recovery-execution-20261003.json',root),'utf8')).result.targets;
  expect(result.targets).toEqual(expected);expect((await execute()).targets).toEqual(expected);
  throw rollback;
 })).rejects.toBe(rollback);expect(await snapshot()).toEqual(before);
 }finally{await db.destroy();}
},60000);
