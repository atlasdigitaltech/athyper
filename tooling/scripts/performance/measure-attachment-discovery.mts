/** Local DEV only. Executes production-generated SQL as the runtime role.
 * Synthetic rows, including audit rows, are always rolled back. */
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
const {Kysely,DummyDriver,PostgresAdapter,PostgresIntrospector,PostgresQueryCompiler}=createRequire(new URL("../../../server/packages/services/attachments/package.json",import.meta.url))("kysely");
import {createAttachmentDiscoveryService} from "../../../server/packages/services/attachments/src/attachment-discovery-routes.js";

const args=new Map(process.argv.slice(2).map((arg,i,all)=>[arg,all[i+1]]));
const series=Number(args.get("--series")??10000),runs=Number(args.get("--runs")??5);
if(!Number.isSafeInteger(series)||series<100||series>30000||!Number.isSafeInteger(runs)||runs<1||runs>10)throw Error("Invalid fixture bounds");
const container="athyper-dev-db-1",database="athyper_neon";
function psql(input:string){const r=spawnSync("docker",["exec","-i",container,"psql","-U","postgres","-d",database,"-X","-q","-At","-v","ON_ERROR_STOP=1"],{input,encoding:"utf8",maxBuffer:64*1024*1024,timeout:900000});if(r.status!==0)throw Error(r.stderr||String(r.error));return r.stdout.trim();}
const quote=(v:unknown):string=>v===null?"NULL":typeof v==="boolean"?String(v):typeof v==="number"?String(v):"'"+String(v).replaceAll("'","''")+"'";
const [tenantId,principalId]=psql("SELECT tenant_id,created_by FROM document.attachment ORDER BY created_at LIMIT 1").split("|");
if(!tenantId||!principalId)throw Error("An existing DEV tenant and principal are required");
const id=(kind:string,n:number)=>{const hex=createHash("md5").update(`perf-discovery:${kind}:${n}`).digest("hex");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;};
type Query={sql:string;parameters:readonly unknown[]};
let queries:Query[]=[];
class Driver extends DummyDriver{override async acquireConnection(){return {executeQuery:async<R>(q:Query)=>{queries.push(q);return {rows:[] as R[]}},async *streamQuery<R>():AsyncGenerator<{rows:R[]}>{throw Error("unused")}};}}
const db=new Kysely({dialect:{createDriver:()=>new Driver(),createAdapter:()=>new PostgresAdapter(),createQueryCompiler:()=>new PostgresQueryCompiler(),createIntrospector:db=>new PostgresIntrospector(db)}});
const context={planeKey:"neon",tenantId,principalId} as any;
const target={entityType:"performance_fixture",entityId:"attachment-discovery"};
const service=createAttachmentDiscoveryService({authorizeCapability:async()=>({...target,admittedReleaseHash:"fixture",admittedPolicyHash:"fixture"}) as any,transactions:{run:async(_p:any,_c:any,work:any)=>work(db)},storage:{} as any});
const cases:Record<string,{kind:"browse"|"search";input:any}>={
  browse:{kind:"browse",input:target},
  name:{kind:"browse",input:{...target,name:"proof-99"}},
  category:{kind:"browse",input:{...target,category:"evidence"}},
  unfiled:{kind:"browse",input:{...target,unfiled:true}},
  cursor:{kind:"browse",input:{...target,after:id("v2",Math.floor(series/2))}},
  history:{kind:"browse",input:{...target,attachmentId:id("v2",99),includeHistory:true}},
  content:{kind:"search",input:{...target,q:"needle"}},
  contentCursor:{kind:"search",input:{...target,q:"needle",after:id("v2",Math.floor(series/2))}},
};
const captured:Record<string,string>={};
for(const [name,test] of Object.entries(cases)){queries=[];await service[test.kind](context,test.input);const query=queries.find(q=>!q.sql.startsWith("SET"))!;captured[name]=query.sql.replace(/\$(\d+)/g,(_,n)=>quote(query.parameters[Number(n)-1]));}
await db.destroy();
const baselinePath=args.get("--baseline");
const baseline=baselinePath?JSON.parse(readFileSync(baselinePath,"utf8")):undefined;
if(baseline&&(baseline.tenantId!==tenantId||baseline.principalId!==principalId))throw Error("Baseline actor coordinates differ");
// Scale only the synthetic midpoint cursor; baseline SQL remains unchanged.
const baselineQueries=baseline?Object.fromEntries(Object.entries(baseline.queries as Record<string,string>).map(([key,query])=>[key,query.replaceAll(id("v2",Math.floor(baseline.series/2)),id("v2",Math.floor(series/2)))])):undefined;
const variants=baseline?{baseline:baselineQueries!,candidate:captured}:{baseline:captured};
const fixture=`
BEGIN;
SET LOCAL statement_timeout='180s';
SELECT set_config('app.current_tenant_id',${quote(tenantId)},true);
SELECT set_config('app.current_principal_id',${quote(principalId)},true);
CREATE TEMP TABLE perf_fixture AS SELECT n,md5('perf-discovery:series:'||n)::uuid sid,md5('perf-discovery:v1:'||n)::uuid a1,md5('perf-discovery:v2:'||n)::uuid a2,md5('perf-discovery:v3:'||n)::uuid a3 FROM generate_series(1,${series*2}) n;
INSERT INTO document.attachment_series(id,tenant_id,created_by) SELECT sid,${quote(tenantId)}::uuid,${quote(principalId)}::uuid FROM perf_fixture;
ANALYZE document.attachment_series;
INSERT INTO document.attachment(id,tenant_id,series_id,file_name,storage_bucket,storage_key,is_virus_scanned,created_by,uploaded_by,created_at,extracted_text,text_extraction_status)
SELECT a1,${quote(tenantId)}::uuid,sid,'proof-'||n||'.txt','performance-fixture','perf-discovery/'||a1,true,${quote(principalId)}::uuid,${quote(principalId)}::uuid,'2026-01-01'::timestamptz+(n/10)*interval '1 second',repeat('realistic document body ',80)||CASE WHEN n%10=0 THEN 'needle' ELSE 'ordinary' END,'extracted' FROM perf_fixture;
ANALYZE document.attachment;
INSERT INTO document.attachment(id,tenant_id,series_id,file_name,storage_bucket,storage_key,is_virus_scanned,created_by,uploaded_by,created_at,extracted_text,text_extraction_status,parent_attachment_id,version_no)
SELECT a2,${quote(tenantId)}::uuid,sid,'proof-'||n||'.txt','performance-fixture','perf-discovery/'||a2,true,${quote(principalId)}::uuid,${quote(principalId)}::uuid,'2026-01-02'::timestamptz+(n/10)*interval '1 second',repeat('realistic document body ',80)||CASE WHEN n%10=0 THEN 'needle' ELSE 'ordinary' END,'extracted',a1,2 FROM perf_fixture;
ANALYZE document.attachment;
INSERT INTO document.attachment(id,tenant_id,series_id,file_name,storage_bucket,storage_key,is_virus_scanned,created_by,uploaded_by,created_at,extracted_text,text_extraction_status,parent_attachment_id,version_no)
SELECT a3,${quote(tenantId)}::uuid,sid,'proof-'||n||'.txt','performance-fixture','perf-discovery/'||a3,true,${quote(principalId)}::uuid,${quote(principalId)}::uuid,'2026-01-03'::timestamptz+(n/10)*interval '1 second',repeat('realistic document body ',80)||CASE WHEN n%10=0 THEN 'needle' ELSE 'ordinary' END,'extracted',a2,3 FROM perf_fixture;
ANALYZE document.attachment;
UPDATE document.attachment_series s SET current_attachment_id=f.a3 FROM perf_fixture f WHERE s.id=f.sid;
INSERT INTO document.attachment_link(id,tenant_id,entity_type,entity_id,attachment_series_id,pinned_attachment_id,created_by,created_at,link_kind,metadata)
SELECT md5('perf-discovery:link'||v||':'||n)::uuid,${quote(tenantId)}::uuid,'performance_fixture',CASE WHEN n<=${series} THEN 'attachment-discovery' ELSE 'other-record' END,sid,CASE v WHEN 1 THEN a1 WHEN 2 THEN a2 ELSE NULL END,${quote(principalId)}::uuid,'2026-02-01'::timestamptz+v*interval '1 second','record',jsonb_build_object('category',CASE WHEN n%5=0 THEN 'evidence' ELSE 'general' END) FROM perf_fixture CROSS JOIN generate_series(1,3) v;
ANALYZE document.attachment; ANALYZE document.attachment_series; ANALYZE document.attachment_link;
CREATE TEMP TABLE perf_results(variant text,scenario text,run integer,plan jsonb);
GRANT ALL ON perf_results TO athyper_runtime;
GRANT SELECT ON perf_fixture TO athyper_runtime;
SET LOCAL ROLE athyper_runtime;
DO $$ BEGIN IF (SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname=current_user) THEN RAISE EXCEPTION 'Runtime role must enforce RLS'; END IF; END $$;
`;
let measurements="";
for(const [variant,values] of Object.entries(variants))for(const [scenario,query] of Object.entries(values as Record<string,string>))for(let run=0;run<runs;run++) measurements+=`DO $measure$ DECLARE p jsonb; BEGIN EXECUTE ${quote("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+query)} INTO p; INSERT INTO perf_results VALUES(${quote(variant)},${quote(scenario)},${run},p); END $measure$;\n`;
// Execute the real generated query, not a comparator mock. Every expected
// series has two pinned versions and an unpinned current version; pagination
// must never resurrect the older pin after its winning version was consumed.
const correctness = baseline ? `
DO $correctness$
DECLARE batch jsonb; item jsonb; seen uuid[] := '{}'; cursor_id text; query text;
BEGIN
  query := ${quote(captured.browse!)};
  LOOP
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) FROM ('||query||') r' INTO batch;
    EXIT WHEN jsonb_array_length(batch)=0;
    FOR item IN SELECT value FROM jsonb_array_elements(batch) WITH ORDINALITY e(value,n) WHERE n<=50 LOOP
      IF (item->>'series_id')::uuid=ANY(seen) THEN RAISE EXCEPTION 'Duplicate series across pages'; END IF;
      IF NOT EXISTS(SELECT 1 FROM perf_fixture WHERE n<=${series} AND sid=(item->>'series_id')::uuid AND a2=(item->>'id')::uuid) THEN RAISE EXCEPTION 'Wrong record or pinned winner'; END IF;
      seen := array_append(seen,(item->>'series_id')::uuid);
      cursor_id := item->>'id';
    END LOOP;
    EXIT WHEN jsonb_array_length(batch)<=50;
    query := replace(${quote(captured.cursor!)},${quote(id("v2",Math.floor(series/2)))},cursor_id);
  END LOOP;
  IF cardinality(seen)<>${series} THEN RAISE EXCEPTION 'Missing series: %',cardinality(seen); END IF;
  EXECUTE 'SELECT to_jsonb(r) FROM ('||${quote(captured.history!)}||') r' INTO item;
  IF jsonb_array_length(item->'version_history')<>3 THEN RAISE EXCEPTION 'History lost versions'; END IF;
END $correctness$;
SELECT set_config('app.current_tenant_id','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
DO $isolation$ DECLARE count_rows integer; BEGIN
  EXECUTE 'SELECT count(*) FROM ('||${quote(captured.browse!)}||') r' INTO count_rows;
  IF count_rows<>0 THEN RAISE EXCEPTION 'Cross-tenant disclosure'; END IF;
END $isolation$;
SELECT set_config('app.current_tenant_id',${quote(tenantId)},true);
` : "";
let output:string;
try{output=psql(fixture+measurements+correctness+"SELECT 'PERF_RESULT:'||jsonb_agg(to_jsonb(r))::text FROM perf_results r; ROLLBACK;");}
finally{psql("ANALYZE document.attachment; ANALYZE document.attachment_series; ANALYZE document.attachment_link;");}
const line=output!.split("\n").find(line=>line.startsWith("PERF_RESULT:"));if(!line)throw Error("No performance result");
const plans=JSON.parse(line.slice(12));
const summary:any[]=[];
for(const variant of Object.keys(variants))for(const scenario of Object.keys(cases)){
  const rows=plans.filter((p:any)=>p.variant===variant&&p.scenario===scenario),times=rows.map((p:any)=>p.plan[0]["Execution Time"]).sort((a:number,b:number)=>a-b);
  summary.push({variant,scenario,medianMs:times[Math.floor(times.length/2)],p95Ms:times[Math.ceil(times.length*.95)-1],rows:rows[0].plan[0].Plan["Actual Rows"],sharedHitBlocks:rows[0].plan[0].Plan["Shared Hit Blocks"]});
}
if(psql("SELECT count(*) FROM document.attachment WHERE storage_bucket='performance-fixture' AND storage_key LIKE 'perf-discovery/%'")!=="0")throw Error("Fixture cleanup failed");
const report={schemaVersion:1,measuredAt:new Date().toISOString(),database,role:"athyper_runtime",series,attachmentRows:series*6,linkRows:series*6,runs,tenantId,principalId,queries:captured,summary,plans,correctness:baseline?{allPages:true,pinnedWinner:true,recordIsolation:true,tenantIsolation:true,history:true}:null,rolledBack:true};
if(args.get("--output"))writeFileSync(args.get("--output")!,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({series,runs,summary,rolledBack:true},null,2));
