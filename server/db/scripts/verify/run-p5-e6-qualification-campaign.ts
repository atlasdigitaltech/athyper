#!/usr/bin/env tsx
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

type Plane="neon"|"mesh";
function argument(name:string):string|undefined{return process.argv.find(value=>value.startsWith(`${name}=`))?.slice(name.length+1)}
function positiveInteger(name:string,fallback:number):number{const value=Number(argument(name)??fallback);if(!Number.isSafeInteger(value)||value<1)throw new Error(`${name} must be a positive integer`);return value}
const targets:{plane:Plane;url:string|undefined;database:string|undefined}[]=[
 {plane:"neon",url:argument("--neon-url")??process.env["NEON_DATABASE_URL"],database:argument("--neon-database")??process.env["NEON_DATABASE_NAME"]},
 {plane:"mesh",url:argument("--mesh-url")??process.env["MESH_DATABASE_URL"],database:argument("--mesh-database")??process.env["MESH_DATABASE_NAME"]},
];
if(targets.some(target=>!target.url||!target.database))throw new Error("Explicit Neon/Mesh URLs and database guards are required");
const cycles=positiveInteger("--cycles",361),intervalMs=positiveInteger("--interval-ms",240_000);
if(cycles>1&&intervalMs<60_000)throw new Error("Multi-cycle qualification must preserve real observation time; interval must be at least 60 seconds");

async function sample():Promise<void>{
 const command=process.execPath;
 const args=[fileURLToPath(import.meta.resolve("tsx/cli")),"scripts/verify/qualify-p5-e5-expanded-operation-scope.ts",
  `--neon-url=${targets[0]!.url}`,`--neon-database=${targets[0]!.database}`,
  `--mesh-url=${targets[1]!.url}`,`--mesh-database=${targets[1]!.database}`];
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(command,args,{cwd:import.meta.dirname.replace(/[\\/]scripts[\\/]verify$/u,""),stdio:["ignore","pipe","pipe"]});
  let stdout="",stderr="";child.stdout.on("data",chunk=>stdout+=String(chunk));child.stderr.on("data",chunk=>stderr+=String(chunk));
  child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(new Error(`qualification sampler failed (${code}): ${(stderr||stdout).slice(-2000)}`)));
 });
}

async function status(target:typeof targets[number]){
 const client=new pg.Client({connectionString:target.url});await client.connect();
 try{
  const identity=await client.query<{database_name:string}>("select current_database() database_name");if(identity.rows[0]?.database_name!==target.database)throw new Error(`campaign database guard rejected ${target.plane}`);
  const rows=await client.query<{operation_key:string;sample_count:string;mismatch_count:string;candidate_error_count:string;observed_from:Date;observed_through:Date;qualifies_default:boolean}>(`select b.operation_key,q.sample_count::text,q.mismatch_count::text,q.candidate_error_count::text,q.observed_from,q.observed_through,q.qualifies_default from authz.entity_operation_binding b join ops.authorization_shadow_qualification_v q on q.plane_code=b.plane_code and q.entity_code=b.entity_code and q.source_entity_operation_id=b.source_entity_operation_id and q.source_release_hash=b.source_release_hash and q.source_artifact_hash=b.source_compiled_hash where b.plane_code=$1 and b.status='published' and b.tenant_id is null order by b.operation_key`,[target.plane]);
  return {plane:target.plane,operations:rows.rows.map(row=>({...row,sample_count:Number(row.sample_count),mismatch_count:Number(row.mismatch_count),candidate_error_count:Number(row.candidate_error_count)}))};
 }finally{await client.end()}
}

async function certifyQualified(target:typeof targets[number]):Promise<number>{
 const client=new pg.Client({connectionString:target.url});await client.connect();
 try{await client.query("begin");await client.query("select set_config('app.database_plane',$1,true)",[target.plane]);
  const result=await client.query(`select ops.certify_authorization_operation_parity(q.plane_code,q.entity_code,q.source_entity_operation_id,q.source_release_hash,q.source_artifact_hash,'00000000-0000-0000-0000-000000000000'::uuid) from ops.authorization_shadow_qualification_v q where q.plane_code=$1 and q.qualifies_default and not exists(select 1 from ops.authorization_parity_certification c where c.plane_code=q.plane_code and c.entity_code=q.entity_code and c.source_entity_operation_id=q.source_entity_operation_id and c.source_release_hash=q.source_release_hash and c.source_artifact_hash=q.source_artifact_hash and c.status='qualified')`,[target.plane]);await client.query("commit");return result.rowCount??0;
 }catch(error){await client.query("rollback");throw error}finally{await client.end()}
}

for(let cycle=1;cycle<=cycles;cycle++){
 await sample();const states=await Promise.all(targets.map(status));
 const operations=states.flatMap(state=>state.operations),bad=operations.filter(row=>row.mismatch_count||row.candidate_error_count);
 const qualified=operations.filter(row=>row.qualifies_default).length;
 const certified=qualified?await Promise.all(targets.map(certifyQualified)):[0,0];
 const summary={cycle,at:new Date().toISOString(),operations:operations.length,qualified,certified:certified.reduce((a,b)=>a+b,0),
  minimumSamples:Math.min(...operations.map(row=>row.sample_count)),maximumSamples:Math.max(...operations.map(row=>row.sample_count)),bad:bad.map(row=>row.operation_key)};
 process.stdout.write(JSON.stringify(summary)+"\n");if(bad.length)throw new Error("qualification campaign stopped on mismatch or candidate error");
 if(operations.length>0&&operations.every(row=>row.qualifies_default)){process.stdout.write(JSON.stringify({status:"qualified",certificatesReady:true})+"\n");break;}
 if(cycle<cycles)await new Promise(resolve=>setTimeout(resolve,intervalMs));
}
