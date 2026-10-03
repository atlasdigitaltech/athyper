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

// Synthetic contexts are qualification ONLY. Every enrollment, audit event and
// deployment is enclosed in an outer rollback; none attests human approval.
it.skipIf(process.env.DEPLOYMENT_RECOVERY_POSTGRES !== "1")("qualifies enrollment, exact signed retries, publisher identity, replay and audit rollback under restricted roles", async()=>{
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
  const before=await snapshot(), rollback=Error("qualification rollback");
  try {
    await expect(db.transaction().execute(async tx=>{
      await sql`SET LOCAL lock_timeout='2s'`.execute(tx);
      const migration=readFileSync(new URL("server/db/migrations/20261003_coordinated_deployment_recovery.sql",root),"utf8").replace(/^BEGIN;$/m,"").replace(/^COMMIT;$/m,"");
      await sql.raw(migration).execute(tx);
      await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${adminId},true)`.execute(tx);
      const source=(await sql<{value:DeploymentRecoverySource}>`SELECT publication.fn_coordinated_deployment_recovery_source(${originalId}::uuid,${originalHash}) value`.execute(tx)).rows[0]!.value;
      const original=parseHumanReviewedExecutionPolicy(source.policy);
      const actors=(await sql<{id:string;code:string;auth_epoch:number}>`SELECT id,code,auth_epoch FROM master.principal WHERE tenant_id=${tenant}::uuid`.execute(tx)).rows;
      const actor=(id:string)=>{const a=actors.find(a=>a.id===id)!;return {principalId:id,code:a.code,authEpoch:a.auth_epoch,credentialSha256:"a".repeat(64)};};
      const config={environment:"local",instance:"dev",domainSuffix:"dev.athyper.test",tenantId:tenant,realmKey:"platform-control",author:actor(original.authorPrincipalId),publisher:actor(original.publisherPrincipalId)};
      const policy=parseDeploymentRecoveryPolicy({schema:"athyper.dev-coordinated-deployment-recovery/1",policyId:`qualification.recovery.${randomUUID()}`,revision:1,
        environment:"local",instance:"dev",authorityTenantId:tenant,authorPrincipalId:original.authorPrincipalId,publisherPrincipalId:original.publisherPrincipalId,
        compiler:publicationCompilerIdentity(),expiresAt:new Date(Date.now()+86400000).toISOString(),
        originalPolicy:{id:originalId,hash:originalHash,version:source.version,compilerHash:original.compiler.buildHash,coordinationHash:sha256(original.plan)},
        deliveries:source.deliveries.map(({deploymentId,artifactId,artifactHash,releaseId,plane,attempt})=>({deploymentId,artifactId,artifactHash,releaseId,plane,attempt}))});
      let count=0,failAudit=false;
      const bound=new Proxy(tx,{get(target,key){if(key==="transaction")return()=>{
        const builder={setIsolationLevel:()=>builder,execute:async(fn:(t:typeof tx)=>Promise<unknown>)=>{
          const name=`recovery_test_${++count}`;await sql.raw(`SAVEPOINT ${name}`).execute(tx);
          try{const result=await fn(tx);await sql.raw(`RELEASE SAVEPOINT ${name}`).execute(tx);return result;}
          catch(e){await sql.raw(`ROLLBACK TO SAVEPOINT ${name}`).execute(tx);throw e;}
        }};return builder;
      };const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});
      const audit:AuditRecorder<Kysely<Record<string,never>>>={async record(event,transaction){
        const r=await sql<{id:string}>`SELECT audit.append_event(p_event_code:=${event.eventCode},p_operation:='execute'::audit.operation_d,
          p_entity_type:=${event.entityType!},p_entity_id:=${event.entityId!}::uuid,p_outcome:='success'::audit.outcome_d,
          p_severity:='critical'::audit.event_severity_d,p_context:=${JSON.stringify(event.metadata)}::jsonb) id`.execute(transaction!);
        if(failAudit)throw Error("audit failure after write");return {...event,id:r.rows[0]!.id,occurredAt:new Date().toISOString()};
      }};
      const ctx=(id:string)=>({principalId:id,tenantId:tenant,planeKey:"studio",realmKey:"platform-control",assurance:"elevated",authEpoch:actor(id).authEpoch,requestId:randomUUID()} as VerifiedRequestContext);
      const service=createPublicationPolicyEnrollment({database:bound,authorizer:{authorize:async()=>({allowed:true,reason:"qualification"})},audit,
        signer:{sign:async()=>{throw Error("unexpected signature");},verify:async()=>false},environment:"local",instance:"dev",domainSuffix:"dev.athyper.test",
        authority:{tenantId:tenant,realmKey:"platform-control",issuer:"https://iam.dev.athyper.test/realms/platform-control",audience:"athyper-platform-control-api"}});
      await sql`SET LOCAL ROLE athyper_control_api`.execute(tx);
      await expect(service.propose(ctx(adminId),{...policy,compiler:{...policy.compiler,buildHash:"0".repeat(64)}})).rejects.toThrow("COMPILER_BUILD_CHANGED");
      const competing=await pool.connect();
      try{
        await competing.query('BEGIN');await competing.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`deployment-recovery:${tenant}:${originalId}`]);
        await expect(service.propose(ctx(adminId),policy)).rejects.toMatchObject({code:"55P03"});
      }finally{await competing.query('ROLLBACK');competing.release();}
      const proposed=await service.propose(ctx(adminId),policy);
      await expect(service.activate(ctx(adminId),proposed.id,proposed.hash)).rejects.toThrow();
      await expect(service.activate(ctx(ownerId),proposed.id,"0".repeat(64))).rejects.toThrow("PIN_MISMATCH");
      const pin=await service.activate(ctx(ownerId),proposed.id,proposed.hash);
      const other=await service.propose(ctx(adminId),{...policy,policyId:`qualification.recovery.${randomUUID()}`});
      await expect(service.activate(ctx(ownerId),other.id,other.hash)).rejects.toThrow("ALREADY_ACTIVE");
      await sql`RESET ROLE`.execute(tx);
      const current=(await sql<{id:string;created_by:string}>`SELECT id,created_by FROM control.policy_definition WHERE id=${pin.id}::uuid`.execute(tx)).rows[0]!;
      expect(current.created_by).toBe(adminId);
      await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
      const enqueue=vi.fn(async()=>randomUUID());
      const dependencies={database:bound,jobs:{enqueue},audit,targets:{databases:{studio:bound,neon:bound,mesh:bound}}} as unknown as Parameters<typeof executeDeploymentRecovery>[3];
      const execute=()=>runWithRequestContext({requestId:randomUUID(),planeKey:"studio",tenantId:tenant,principalId:config.publisher.principalId},()=>executeDeploymentRecovery(config,policy,pin,dependencies));
      failAudit=true;await expect(execute()).rejects.toThrow("audit failure");failAudit=false;expect(enqueue).not.toHaveBeenCalled();
      const result=await execute();expect(result.targets).toHaveLength(8);expect(enqueue).toHaveBeenCalledTimes(8);
      const replay=await execute();expect(replay.targets).toEqual(result.targets);
      await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${config.publisher.principalId},true)`.execute(tx);
      expect((await findDeploymentRecovery(tx,config,originalId)).pin).toEqual({id:pin.id,hash:pin.hash,version:pin.version});
      const target=result.targets[0]!;
      const options={authority:bound,target:bound,configuration:config,execution:{tenantId:tenant,principalId:config.publisher.principalId,planeKey:"studio" as const,scope:"tenant" as const},plane:target.targetPlane,deploymentId:target.deploymentId};
      expect(await coordinatedApplyPrincipal(options)).toBe(config.publisher.principalId);
      await expect(coordinatedApplyPrincipal({...options,execution:{...options.execution,principalId:adminId}})).rejects.toThrow("PUBLISHER_MISMATCH");
      const originals=(await sql<{status:string}>`SELECT status FROM publication.deployment WHERE id=ANY(${policy.deliveries.map(d=>d.deploymentId)}::uuid[])`.execute(tx)).rows;
      expect(originals.every(d=>d.status==="failed")).toBe(true);
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await snapshot()).toEqual(before);
  }finally{await db.destroy();}
},60000);
