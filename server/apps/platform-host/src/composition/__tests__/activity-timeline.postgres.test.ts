import {execFileSync} from "node:child_process";
import {mkdtempSync,chmodSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Kysely,PostgresDialect,sql} from "kysely";
import {Pool} from "pg";
import {expect,it} from "vitest";
import {queryActivityTimeline} from "../shared/entity-runtime/activity-timeline.js";
const image=process.env.ATHYPER_ACTIVITY_DDL_IMAGE;
it.skipIf(!image)("timeline SQL preserves source order, tenant scope and filter semantics",async()=>{
 const socket=mkdtempSync(join(tmpdir(),"timeline-pg-"));chmodSync(socket,0o777);
 let container:string|undefined;let db:Kysely<Record<string,never>>|undefined;
 try {
  container=execFileSync("docker",["run","--rm","-d","--network","none","--user","postgres","-v",`${socket}:/socket`,"--entrypoint","sh",image!,"-c","/usr/lib/postgresql/16/bin/initdb -D /tmp/timeline-pg -A trust >/dev/null && exec /usr/lib/postgresql/16/bin/postgres -D /tmp/timeline-pg -k /socket -h ''"],{encoding:"utf8"}).trim();
  for(let n=0;n<50;n++){try{execFileSync("docker",["exec",container,"pg_isready","-h","/socket"],{stdio:"ignore"});break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  db=new Kysely({dialect:new PostgresDialect({pool:new Pool({host:socket,user:"postgres",database:"postgres"})})});
  await sql.raw(`CREATE SCHEMA audit; CREATE SCHEMA snapshot;
    CREATE DOMAIN audit.outcome_d AS text CHECK(VALUE IN ('success','failure','denied'));
    CREATE DOMAIN audit.operation_d AS text;
    CREATE TABLE audit.audit_log(id uuid,tenant_id uuid,plane_code text,entity_type text,entity_id uuid,occurred_at timestamptz,event_code text,operation audit.operation_d,outcome audit.outcome_d,actor_principal_id uuid,changed_fields text[],correlation_id uuid);
    CREATE TABLE snapshot.entity_snapshot_identity(id uuid,tenant_id uuid,entity_type text,entity_code text,entity_id uuid,captured_at timestamptz,captured_by uuid);
    CREATE TABLE snapshot.record_version(id uuid,tenant_id uuid,plane_code text,entity_type text,entity_code text,entity_id uuid,occurred_at timestamptz,operation text,actor_principal_id uuid,changed_fields text[]);`).execute(db);
  const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const at="2026-09-28T00:00:00.000123Z";
  for(const [tenant,n] of [[id(1),10],[id(99),11]] as const)await sql`INSERT INTO audit.audit_log VALUES(${id(n)}::uuid,${tenant}::uuid,'neon','example',${id(2)}::uuid,${at}::timestamptz,'record.updated','update','failure',${id(3)}::uuid,ARRAY['name','secret'],${id(4)}::uuid)`.execute(db);
  await sql`INSERT INTO snapshot.entity_snapshot_identity VALUES(${id(12)}::uuid,${id(1)}::uuid,'master.example','example',${id(2)}::uuid,${at}::timestamptz,${id(3)}::uuid)`.execute(db);
  const subject={context:{tenantId:id(1),principalId:id(3),planeKey:"neon"},entityCode:"example",recordId:id(2)} as any;
  const admission={projection:{actions:[{key:"timeline_query"},{key:"snapshots_read"}]},binding:{}} as any;
  const window={from:"2026-09-01",until:"2026-10-01",limit:1};
  const first=await queryActivityTimeline(db as never,subject,admission,window,'master.example',new Set(['name']));
  expect(first[0]?.source).toBe('snapshot');
  const next=await queryActivityTimeline(db as never,subject,admission,{...window,after:{at:first[0]!.occurredAt,id:first[0]!.id}},'master.example',new Set(['name']));
  expect(next).toHaveLength(1);expect(next[0]).toMatchObject({source:'audit',changedFields:['name'],occurredAt:at});
  const filtered=await queryActivityTimeline(db as never,subject,admission,{...window,limit:10,filters:{outcome:'failure',actor:id(3),event:'record.updated'}},'master.example',new Set(['name']));
  expect(filtered).toHaveLength(1);
  admission.projection.actions=[{key:'timeline_query'}];
  expect((await queryActivityTimeline(db as never,subject,admission,{...window,limit:10},'master.example',new Set())).map(row=>row.source)).toEqual(['audit']);
 } finally {await db?.destroy();if(container)execFileSync('docker',['rm','-f',container],{stdio:'ignore'});rmSync(socket,{recursive:true,force:true});}
},30000);
