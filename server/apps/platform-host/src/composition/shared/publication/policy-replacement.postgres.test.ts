import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import { createPublicationPolicyEnrollment } from "./policy-enrollment.js";
import { parseHumanReviewedExecutionPolicy } from "./human-publication-policy.js";
import { publicationCompilerIdentity } from "./compiler-build.js";

// Live restricted-role integration, entirely rolled back. Synthetic contexts
// here test authorization boundaries; they never count as human approvals.
it.skipIf(process.env.POLICY_REPLACEMENT_POSTGRES !== "1")("replaces exact reviewed enrollments atomically, rejects races/drift and rolls back audit failures", async () => {
  const c=JSON.parse(execFileSync("docker",["inspect","athyper-dev-db-1"],{encoding:"utf8"}))[0];
  if(!c.State.Running || c.Config.Labels["com.docker.compose.project"]!=="athyper-dev") throw Error("DEV required");
  const env=Object.fromEntries(c.Config.Env.map((v:string)=>[v.slice(0,v.indexOf("=")),v.slice(v.indexOf("=")+1)]));
  const secret=c.Mounts.find((m:{Destination:string})=>m.Destination===env.POSTGRES_PASSWORD_FILE)?.Source;
  if(!secret?.includes("/.athyper/instances/dev/secrets/"))throw Error("DEV secret required");
  const pool=new Pool({host:(Object.values(c.NetworkSettings.Networks)[0] as {IPAddress:string}).IPAddress,
    user:env.POSTGRES_USER,password:readFileSync(secret,"utf8").trim(),database:"athyper_studio",max:3});
  const db=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool})});
  const root=new URL("../../../../../../../",import.meta.url);
  const draft=JSON.parse(readFileSync(new URL("docs/reports/coordinated-release-execution-policy-runtime-fix-20261003.json",root),"utf8"));
  draft.compiler=publicationCompilerIdentity();for(const p of draft.predecessors)p.compiler=draft.compiler;
  draft.policyId=`rollback.replacement.${randomUUID()}`;
  const policy=parseHumanReviewedExecutionPolicy(draft),member=policy.plan.members[0]!;
  const context=(principalId:string)=>({principalId,tenantId:policy.authorityTenantId,planeKey:"studio",realmKey:"platform-control",assurance:"elevated",authEpoch:1,requestId:randomUUID()} as VerifiedRequestContext);
  const admin=context(member.authorId),owner=context(member.reviewerId),rollback=Error("qualification rollback");
  const before=(await sql`SELECT id,status,definition_hash,updated_by FROM control.policy_definition WHERE entity_type='metadata.publication' ORDER BY id`.execute(db)).rows;
  try {
    await expect(db.transaction().execute(async tx=>{
      await sql`SET LOCAL lock_timeout='2s'`.execute(tx);
      await sql.raw(readFileSync(new URL("server/db/ddl/planes/studio/control/14_publication_policy_replacement.sql",root),"utf8")).execute(tx);
      const pins=(await sql<{id:string;hash:string}>`SELECT d.id,d.definition_hash hash FROM control.policy_definition d JOIN control.policy_rule r ON r.policy_definition_id=d.id
        WHERE d.tenant_id=${policy.authorityTenantId}::uuid AND d.status='active'
          AND r.action_config#>'{policy,plan,members}' @> jsonb_build_array(jsonb_build_object('changeSetId',${member.changeSetId}::text)) ORDER BY d.id`.execute(tx)).rows;
      expect(pins.length).toBe(2);
      let count=0,failAudit=false,allow=true;
      const bound=new Proxy(tx,{get(target,key){
        if(key==="transaction")return ()=>({setIsolationLevel:()=>({execute:async(fn:(t:typeof tx)=>Promise<unknown>)=>{
          const name=`replacement_test_${++count}`;await sql.raw(`SAVEPOINT ${name}`).execute(tx);
          try {const value=await fn(tx);await sql.raw(`RELEASE SAVEPOINT ${name}`).execute(tx);return value;}
          catch(e){await sql.raw(`ROLLBACK TO SAVEPOINT ${name}`).execute(tx);await sql.raw(`RELEASE SAVEPOINT ${name}`).execute(tx);throw e;}
        }})});
        const v=Reflect.get(target,key);return typeof v==="function"?v.bind(target):v;
      }});
      const audit:AuditRecorder<Kysely<Record<string,never>>>={async record(event,transaction){
        const result=await sql<{id:string}>`SELECT audit.append_event(p_event_code:=${event.eventCode},p_operation:='execute'::audit.operation_d,
          p_entity_type:=${event.entityType!},p_entity_id:=${event.entityId!}::uuid,p_outcome:='success'::audit.outcome_d,
          p_severity:='critical'::audit.event_severity_d,p_context:=${JSON.stringify(event.metadata)}::jsonb) id`.execute(transaction!);
        if(failAudit)throw Error("audit failure after write");
        return {...event,id:result.rows[0]!.id,occurredAt:new Date().toISOString()};
      }};
      const service=createPublicationPolicyEnrollment({database:bound,authorizer:{authorize:async()=>({allowed:allow,reason:"qualification"})},audit,
        signer:{sign:async()=>{throw Error("unexpected signing");},verify:async()=>false},environment:"local",instance:"dev",domainSuffix:"dev.athyper.test",
        authority:{tenantId:policy.authorityTenantId,realmKey:"platform-control",issuer:"https://iam.dev.athyper.test/realms/platform-control",audience:"athyper-platform-control-api"}});
      // A separate connection holds the exact execution lock before this
      // transaction ever acquires it. Replacement must fail without waiting.
      const other=await pool.connect();
      try {
        await other.query("BEGIN");await other.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`reference-publication:${member.entityId}`]);
        await sql`SET LOCAL ROLE athyper_control_api`.execute(tx);
        await expect(service.propose(admin,{...policy,compiler:{...policy.compiler,buildHash:"0".repeat(64)},
          predecessors:policy.predecessors.map(p=>({...p,compiler:{...p.compiler,buildHash:"0".repeat(64)}}))})).rejects.toThrow("COMPILER_BUILD_CHANGED");
        const pending=await service.propose(admin,policy);
        await expect(service.replace(owner,pending.id,pending.hash,pins)).rejects.toThrow("EXECUTION_IN_PROGRESS");
        await other.query("ROLLBACK");
        await expect(service.activate(owner,pending.id,pending.hash)).rejects.toThrow("REPLACEMENT_REQUIRED");
        await expect(service.replace(owner,pending.id,"0".repeat(64),pins)).rejects.toThrow("PIN_MISMATCH");
        await expect(service.replace(owner,pending.id,pending.hash,[{...pins[0]!,hash:"0".repeat(64)},pins[1]!])).rejects.toThrow("PIN_MISMATCH");
        await expect(service.replace(owner,pending.id,pending.hash,[pins[0]!])).rejects.toThrow("OVERLAP_CHANGED");
        await expect(service.replace(admin,pending.id,pending.hash,pins)).rejects.toThrow();
        await expect(service.replace({...owner,realmKey:"athyper"},pending.id,pending.hash,pins)).rejects.toThrow("CONTEXT_DENIED");
        await expect(service.replace({...owner,assurance:"baseline"} as VerifiedRequestContext,pending.id,pending.hash,pins)).rejects.toThrow("MFA_REQUIRED");
        allow=false;await expect(service.replace(owner,pending.id,pending.hash,pins)).rejects.toThrow("FORBIDDEN");allow=true;
        await sql`SELECT set_config('app.current_principal_id',${owner.principalId},true)`.execute(tx);
        const probe=async(work:()=>Promise<unknown>)=>{
          await sql`SAVEPOINT immutable_probe`.execute(tx);
          try{await expect(work()).rejects.toThrow();}finally{await sql`ROLLBACK TO SAVEPOINT immutable_probe`.execute(tx);await sql`RELEASE SAVEPOINT immutable_probe`.execute(tx);}
        };
        await probe(()=>sql`UPDATE control.policy_definition SET status='retired' WHERE id=${pins[0]!.id}::uuid`.execute(tx));
        failAudit=true;await expect(service.replace(owner,pending.id,pending.hash,pins)).rejects.toThrow("audit failure after write");failAudit=false;
        const state=async()=>(await sql<{id:string;status:string}>`SELECT id,status FROM control.policy_definition WHERE id=ANY(${[pending.id,...pins.map(p=>p.id)]}::uuid[]) ORDER BY id`.execute(tx)).rows;
        expect((await state()).find(p=>p.id===pending.id)?.status).toBe("pending_approval");
        expect((await state()).filter(p=>p.status==="active")).toHaveLength(2);
        expect((await sql`SELECT replacement_id FROM control.publication_policy_replacement WHERE replacement_id=${pending.id}::uuid`.execute(tx)).rows).toHaveLength(0);
        const receipt=await service.replace(owner,pending.id,pending.hash,pins);
        expect(receipt).toMatchObject({id:pending.id,status:"active",replayed:false});
        expect((await state()).filter(p=>p.status==="active")).toEqual([{id:pending.id,status:"active"}]);
        expect((await state()).filter(p=>p.status==="retired")).toHaveLength(2);
        await probe(()=>sql`UPDATE control.policy_definition SET name='forged' WHERE id=${pins[0]!.id}::uuid`.execute(tx));
        await probe(()=>sql`UPDATE control.policy_definition SET status='active' WHERE id=${pins[0]!.id}::uuid`.execute(tx));
        await probe(()=>sql`DELETE FROM control.publication_policy_replacement WHERE replacement_id=${pending.id}::uuid`.execute(tx));
        expect(await service.replace(owner,pending.id,pending.hash,pins)).toMatchObject({replayed:true});
        expect((await sql`SELECT replacement_id FROM control.publication_policy_replacement WHERE replacement_id=${pending.id}::uuid`.execute(tx)).rows).toHaveLength(1);
      }finally{await other.query("ROLLBACK");other.release();}
      throw rollback;
    })).rejects.toBe(rollback);
    expect((await sql`SELECT id,status,definition_hash,updated_by FROM control.policy_definition WHERE entity_type='metadata.publication' ORDER BY id`.execute(db)).rows).toEqual(before);
  }finally{await db.destroy();}
},60000);
