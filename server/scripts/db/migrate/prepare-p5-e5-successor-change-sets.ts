#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { MetaEntityOperationDraft, MetaEntityOperationScopeBindingDraft, MetaEntityPhase2Graph } from "@athyper/meta-entity-authoring-contracts";
import { MetaEntityAuthoringService } from "@athyper/svc-meta-entity-authoring";
import { PostgresMetaEntityAuthoringRepository } from "@athyper/svc-meta-entity-authoring";

const ACTOR="00000000-0000-0000-0000-000000000000";
function argument(name:string){return process.argv.find(v=>v.startsWith(`${name}=`))?.slice(name.length+1)}
function uuid(key:string){const h=createHash("sha256").update(key).digest("hex").slice(0,32).split("");h[12]="5";h[16]=((parseInt(h[16]!,16)&3)|8).toString(16);const v=h.join("");return `${v.slice(0,8)}-${v.slice(8,12)}-${v.slice(12,16)}-${v.slice(16,20)}-${v.slice(20)}`}
function remapGraph(source:MetaEntityPhase2Graph, coordinate:string):MetaEntityPhase2Graph {
  const ids=new Set<string>();
  const collect=(value:unknown):void=>{if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==="object")for(const [k,v] of Object.entries(value)) {if(k==="id"&&typeof v==="string")ids.add(v);collect(v)}};
  collect(source); const map=new Map([...ids].map(id=>[id,uuid(`${coordinate}:${id}`)]));
  const replace=(value:unknown):unknown=>Array.isArray(value)?value.map(replace):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])):typeof value==="string"&&map.has(value)?map.get(value):value;
  return replace(source) as MetaEntityPhase2Graph;
}
function operation(entity:string,plane:"neon"|"mesh",key:string,kind:MetaEntityOperationDraft["operationKind"]):MetaEntityOperationDraft{return {
  id:uuid(`p5-e5:${entity}:operation:${key}`),operationKey:key,operationKind:kind,label:key.replaceAll("_"," "),
  description:`P5-E5 qualification operation for ${key}.`,handlerKey:`${plane}.${entity}.${key}`,
  permissionCode:`${plane}.${entity}.${key}`,executionMode:"synchronous",idempotencyMode:"none",
  inputSurfaceKey:null,confirmationSurfaceKey:null,resultSurfaceKey:null,requiresMfa:false,
  auditEventCode:`${plane}.${entity}.${key}`,status:"active"};}
function binding(entity:string,plane:"neon"|"mesh",op:MetaEntityOperationDraft,mode:"entity_resource"|"collection",scope:"tenant"|"network_account"|"resource"):MetaEntityOperationScopeBindingDraft {
  const tenant=scope==="tenant"; const collection=mode==="collection";
  return {id:uuid(`p5-e5:${entity}:binding:${op.operationKey}:${scope}`),operationId:op.id,
    bindingKey:`${op.operationKey}.${plane}.${scope}`,targetPlane:plane,decisionMode:mode,scopeKind:scope,
    coordinateSource:tenant?"tenant_context":collection?"collection_field":"record_field",
    coordinateKey:tenant?null:scope==="network_account"?"network_account_id":"id",resolverKey:null,
    missingValueBehavior:"deny",status:"active"};
}
const url=argument("--admin-url")??process.env["META_ENTITY_DATABASE_URL"], expected=argument("--admin-database");
if(!url||!expected)throw new Error("Explicit Admin URL and database guard required");
const pool=new pg.Pool({connectionString:url});const db=new Kysely<never>({dialect:new PostgresDialect({pool})});
const service=new MetaEntityAuthoringService(new PostgresMetaEntityAuthoringRepository(db));
const context={tenantId:ACTOR,principalId:ACTOR,requestId:"p5-e5-successor-preparation",authority:"central_package" as const};
const targets=[
  {entity:"business_partner",source:"p5_e5_qualification_v2",change:"p5_e5_qualification_v3",plane:"neon" as const,version:"2.2.2",scope:"tenant" as const},
];
try {
 const guard=await pool.query<{database_name:string}>("SELECT current_database() database_name");if(guard.rows[0]?.database_name!==expected)throw new Error("Admin database guard rejected target");
 for(const target of targets){
  const found=await pool.query<{entity_id:string;source_id:string;base_release_id:string;successor_id:string|null;lock_version:string|null}>(`SELECT e.id::text entity_id,src.id::text source_id,
    (SELECT id::text FROM metadata.entity_release WHERE entity_id=e.id ORDER BY release_no DESC LIMIT 1) base_release_id,
    dst.id::text successor_id,dst.lock_version::text FROM metadata.entity e JOIN metadata.entity_change_set src ON src.entity_id=e.id AND src.change_set_code=$2
    LEFT JOIN metadata.entity_change_set dst ON dst.entity_id=e.id AND dst.change_set_code=$3 WHERE e.tenant_id IS NULL AND e.entity_code=$1`,[target.entity,target.source,target.change]);
  const row=found.rows[0];if(!row)throw new Error(`source_missing:${target.entity}`);if(row.successor_id){process.stdout.write(`P5_E5_CHANGE_SET_NOOP entity=${target.entity}\n`);continue}
  const sourceGraph=await service.getGraph(context,row.source_id);const graph=remapGraph(sourceGraph,`${target.entity}:${target.change}`);
  const list=operation(target.entity,target.plane,"list","read"),shared=operation(target.entity,target.plane,"shared_read","read"),override=operation(target.entity,target.plane,"override_execute","execute");
  const additions=[list,shared,override].filter(candidate=>!graph.operations.some(existing=>existing.operationKey===candidate.operationKey));
  const augmented={...graph,operations:[...graph.operations,...additions],operationScopeBindings:[...(graph.operationScopeBindings??[]),
    ...additions.map(op=>binding(target.entity,target.plane,op,op.operationKey==="list"?"collection":"entity_resource",op.operationKey==="shared_read"?"resource":target.scope))]};
  const inserted=await pool.query<{id:string;lock_version:string}>(`INSERT INTO metadata.entity_change_set (tenant_id,entity_id,change_set_code,branch_code,base_release_id,title,change_summary,change_reason_code,ticket_reference,created_by)
    VALUES (NULL,$1::uuid,$2,'main',$3::uuid,$4,$5,'qualification','P5-E5',$6::uuid) RETURNING id::text,lock_version::text`,[row.entity_id,target.change,row.base_release_id,`P5-E5 ${target.entity} qualification successor`,`Adds list, ACL-share, and exceptional-override qualification operations.`,ACTOR]);
  await service.saveGraph(context,{commandId:uuid(`p5-e5:save:${target.entity}`),changeSetId:inserted.rows[0]!.id,expectedLockVersion:Number(inserted.rows[0]!.lock_version),graph:augmented});
  process.stdout.write(`P5_E5_CHANGE_SET_OK entity=${target.entity} version=${target.version}\n`);
 }
} finally {await db.destroy()}
