#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

type Plane = "neon" | "mesh";
interface Coordinate { plane:Plane; entityCode:string; operationKey:string; sourceEntityOperationId:string; sourceReleaseHash:string; sourceArtifactHash:string }
interface ActivationManifest { operations:Coordinate[] }
interface RetirementManifest { contractVersion:string; minimumStableActiveHours:number; runtimeBlockers:Array<{code:string;path:string;symbol:string;requiredResolution:string}> }
function argument(name:string):string|undefined{return process.argv.find(value=>value.startsWith(`${name}=`))?.slice(name.length+1)}

const urls:{plane:Plane;url:string|undefined;database:string|undefined}[]=[
  {plane:"neon",url:argument("--neon-url"),database:argument("--neon-database")},
  {plane:"mesh",url:argument("--mesh-url"),database:argument("--mesh-database")},
];
const adminUrl=argument("--admin-url"),adminDatabase=argument("--admin-database");
if(!adminUrl||!adminDatabase||urls.some(item=>!item.url||!item.database))throw new Error("Explicit Admin/Neon/Mesh URLs and database guards are required");
const configDir=resolve(import.meta.dirname,"config");
const activationText=await readFile(resolve(configDir,"p5-e6-operation-activation-manifest.v1.json"),"utf8");
const activationManifestSha256=createHash("sha256").update(activationText).digest("hex");
const activation=JSON.parse(activationText) as ActivationManifest;
const retirement=JSON.parse(await readFile(resolve(configDir,"p5-e7-legacy-retirement-manifest.v1.json"),"utf8")) as RetirementManifest;
const admin=new pg.Client({connectionString:adminUrl});await admin.connect();
let releaseCoverage:{entityCode:string;operations:number;bindings:number;missingBindings:string[];unmanifestedOperations:string[]}[]=[];
try{
 const identity=await admin.query<{database_name:string}>("select current_database() database_name");if(identity.rows[0]?.database_name!==adminDatabase)throw new Error("P5-E7 Admin database guard rejected target");
 const releases=await admin.query<{entity_code:string;operations:unknown;bindings:unknown}>(`with latest as (select distinct on(r.entity_id) r.entity_id,s.contract_json from metadata.entity_release r join snapshot.entity_contract_revision s on s.id=r.revision_id order by r.entity_id,r.release_no desc) select e.entity_code,coalesce(l.contract_json->'operations','[]'::jsonb) operations,coalesce(l.contract_json->'operation_scope_bindings','[]'::jsonb) bindings from metadata.entity e left join latest l on l.entity_id=e.id where e.tenant_id is null order by e.entity_code`);
 releaseCoverage=releases.rows.map(row=>{const operations=Array.isArray(row.operations)?row.operations as Array<Record<string,unknown>>:[],bindings=Array.isArray(row.bindings)?row.bindings as Array<Record<string,unknown>>:[];
  const active=operations.filter(operation=>operation["status"]==="active"),keys=new Set(bindings.filter(binding=>binding["status"]==="active").map(binding=>String(binding["operation_key"])));
  const missingBindings=active.map(operation=>String(operation["operation_key"])).filter(key=>!keys.has(key));
  const unmanifestedOperations=active.filter(operation=>{const permission=String(operation["permission_code"]??"");const plane=permission.startsWith("mesh.")?"mesh":permission.startsWith("neon.")?"neon":null;return !plane||!activation.operations.some(item=>item.plane===plane&&item.entityCode===row.entity_code&&item.operationKey===operation["operation_key"])}).map(operation=>String(operation["operation_key"]));
  return {entityCode:row.entity_code,operations:active.length,bindings:keys.size,missingBindings,unmanifestedOperations};});
}finally{await admin.end()}
const results=[];
for(const target of urls){
 const client=new pg.Client({connectionString:target.url});await client.connect();
 try{
  const identity=await client.query<{database_name:string}>("select current_database() database_name");if(identity.rows[0]?.database_name!==target.database)throw new Error(`P5-E7 database guard rejected ${target.plane}`);
  const expected=activation.operations.filter(item=>item.plane===target.plane);
  const published=await client.query<{operation_key:string;source_entity_operation_id:string;source_release_hash:string;source_artifact_hash:string}>(`select distinct b.operation_key,b.source_entity_operation_id::text,b.source_release_hash,b.source_compiled_hash source_artifact_hash from authz.entity_operation_scope_binding b where b.plane_code=$1 and b.status='published' and b.tenant_id is null`,[target.plane]);
  const rollout=await client.query<{source_entity_operation_id:string;source_release_hash:string;source_artifact_hash:string;mode:string;certification_status:string|null;activated_at:Date|null}>(`select r.source_entity_operation_id::text,r.source_release_hash,r.source_artifact_hash,r.mode,c.status certification_status,r.activated_at from ops.authorization_operation_rollout r left join ops.authorization_parity_certification c on c.id=r.certification_id where r.plane_code=$1`,[target.plane]);
  const drills=await client.query<{source_entity_operation_id:string;source_release_hash:string;source_artifact_hash:string}>(`select source_entity_operation_id::text,source_release_hash,source_artifact_hash from ops.authorization_operation_cutover_drill where plane_code=$1 and outcome='passed' and legacy_fallback_count=0`,[target.plane]);
  const approval=await client.query<{approval_action:string;activation_manifest_sha256:string;covered_operation_count:number}>(`select approval_action,activation_manifest_sha256,covered_operation_count from ops.authorization_legacy_retirement_approval where plane_code=$1 order by decided_at desc,id desc limit 1`,[target.plane]);
  const byOperation=new Map(rollout.rows.map(row=>[row.source_entity_operation_id,row]));
  const unmanifested=published.rows.filter(row=>!expected.some(item=>item.sourceEntityOperationId===row.source_entity_operation_id&&item.sourceReleaseHash===row.source_release_hash&&item.sourceArtifactHash===row.source_artifact_hash)).map(row=>row.operation_key);
  const missing=expected.filter(item=>!published.rows.some(row=>row.source_entity_operation_id===item.sourceEntityOperationId&&row.source_release_hash===item.sourceReleaseHash&&row.source_artifact_hash===item.sourceArtifactHash)).map(item=>item.operationKey);
  const notQualified=expected.filter(item=>byOperation.get(item.sourceEntityOperationId)?.certification_status!=="qualified").map(item=>item.operationKey);
  const notActive=expected.filter(item=>byOperation.get(item.sourceEntityOperationId)?.mode!=="active").map(item=>item.operationKey);
  const unstable=expected.filter(item=>{const at=byOperation.get(item.sourceEntityOperationId)?.activated_at;return !at||Date.now()-new Date(at).getTime()<retirement.minimumStableActiveHours*3600000}).map(item=>item.operationKey);
  const missingDrill=expected.filter(item=>!drills.rows.some(row=>row.source_entity_operation_id===item.sourceEntityOperationId&&row.source_release_hash===item.sourceReleaseHash&&row.source_artifact_hash===item.sourceArtifactHash)).map(item=>item.operationKey);
  const latestApproval=approval.rows[0],approvalReady=latestApproval?.approval_action==="approve"&&latestApproval.activation_manifest_sha256===activationManifestSha256&&latestApproval.covered_operation_count===expected.length;
  results.push({plane:target.plane,publishedOperations:published.rowCount,manifestOperations:expected.length,unmanifested,missing,notQualified,notActive,unstable,missingDrill,approvalReady,databaseReady:!unmanifested.length&&!missing.length&&!notQualified.length&&!notActive.length&&!unstable.length&&!missingDrill.length&&approvalReady});
 }finally{await client.end()}
}
const releaseCoverageReady=releaseCoverage.every(entity=>!entity.missingBindings.length&&!entity.unmanifestedOperations.length);
const databaseReady=releaseCoverageReady&&results.every(result=>result.databaseReady);
const runtimeReady=retirement.runtimeBlockers.length===0;
const ready=databaseReady&&runtimeReady;
process.stdout.write(JSON.stringify({contractVersion:retirement.contractVersion,ready,databaseReady,runtimeReady,releaseCoverageReady,activationManifestSha256,minimumStableActiveHours:retirement.minimumStableActiveHours,releases:releaseCoverage,planes:results,runtimeBlockers:retirement.runtimeBlockers},null,2)+"\n");
if(!ready)process.exitCode=2;
