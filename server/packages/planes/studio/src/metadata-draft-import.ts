import { sql, type Kysely, type Transaction } from "kysely";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type { GovernedImportAdapter } from "@athyper/server-contract-records";
import { KyselyMetaEntityAuthoringRepository, validateGraph } from "@athyper/server-plane-studio-meta-entity-authoring";

type Database=Record<string,never>;
type Tx=Transaction<Database>;
type Row=Readonly<Record<string,unknown>>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createStudioMetadataDraftImportAdapter():GovernedImportAdapter<Tx>{const adapter:GovernedImportAdapter<Tx>={
  key:"studio.metadata_entity.draft.v1",
  supports:descriptor=>descriptor.planeKey==="studio"&&descriptor.entityCode==="metadata_entity"&&descriptor.storage.schema==="metadata"&&descriptor.storage.object==="entity",
  operations:()=>Object.freeze(["create","update","upsert","replace"]as const),
  async validate({context,row,rowNumber,session}){
    const errors:string[]=[];const changeSetId=optionalText(row,"change_set_id");
    if(session.operation==="update"&&!changeSetId)errors.push("IMPORT_CHANGE_SET_REQUIRED:change_set_id:Update requires a draft change-set id");
    if(changeSetId&&!UUID.test(changeSetId))errors.push("IMPORT_FIELD_INVALID:change_set_id:change_set_id must be a UUID");
    if(!changeSetId){for(const key of ["entity_id","entity_code","branch_code","title"])if(!text(row,key))errors.push(`IMPORT_FIELD_REQUIRED:${key}:${key} is required`);if(text(row,"entity_id")&&!UUID.test(text(row,"entity_id")!))errors.push("IMPORT_FIELD_INVALID:entity_id:entity_id must be a UUID");}
    const graph=row["graph"];
    if(!graph||typeof graph!=="object"||Array.isArray(graph))errors.push("IMPORT_GRAPH_REQUIRED:graph:A metadata contract graph is required");
    else{const report=validateGraph(graph as MetaEntityGraph);for(const issue of report.issues)errors.push(`${issue.code}:graph.${issue.path}:${issue.message}`);if((graph as MetaEntityGraph).entity?.entityCode&&text(row,"entity_code")&&(graph as MetaEntityGraph).entity.entityCode!==text(row,"entity_code"))errors.push("IMPORT_ENTITY_CODE_MISMATCH:graph.entity.entityCode:The row and graph entity codes differ");}
    if(context.planeKey!=="studio")errors.push("IMPORT_PLANE_INVALID:scope:Studio draft imports must execute in Studio");
    return{rowNumber,valid:errors.length===0,errors};
  },
  async apply({context,row,session,transaction}){
    const repository=new KyselyMetaEntityAuthoringRepository(transaction as unknown as Kysely<Database>),graph=row["graph"]as MetaEntityGraph,requestedId=optionalText(row,"change_set_id");
    let changeSetId=requestedId,expectedRevision=number(row,"expected_revision")??1;
    if(requestedId){const existing=(await sql<{tenant_id:string|null;status:string;lock_version:number|string}>`SELECT tenant_id,status::text,lock_version FROM metadata.entity_change_set WHERE id=${requestedId}::uuid FOR UPDATE`.execute(transaction)).rows[0];if(!existing||existing.tenant_id!==context.tenantId){if(session.conflictPolicy==="skip")return{outcome:"skipped"as const};throw new Error("Studio draft was not found in the current tenant");}if(existing.status!=="draft")throw new Error("Only draft Studio change sets can be imported");expectedRevision=number(row,"expected_revision")??Number(existing.lock_version);}
    else{const draft=await repository.createDraft({tenantId:context.tenantId,entityId:text(row,"entity_id")!,entityCode:text(row,"entity_code")!,branchCode:text(row,"branch_code")!,title:text(row,"title")!,actorId:context.principalId});changeSetId=draft.id;expectedRevision=draft.revision;}
    await repository.replaceGraphInTransaction({changeSetId:changeSetId!,expectedRevision,graph,actorId:context.principalId},transaction as unknown as Kysely<Database>);
    return{outcome:"drafted"as const,recordId:changeSetId};
  },
};return Object.freeze(adapter);}
function text(row:Row,key:string){const value=row[key];return typeof value==="string"&&value.trim()?value.trim():undefined;}
function optionalText(row:Row,key:string){return text(row,key);}
function number(row:Row,key:string){const value=row[key];return typeof value==="number"&&Number.isSafeInteger(value)&&value>0?value:undefined;}
