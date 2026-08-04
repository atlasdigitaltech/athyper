#!/usr/bin/env tsx
import pg from"pg";
import{compileEntityPlaneArtifact}from"../../../packages/services/meta-entity-authoring/src/entity-plane-artifact-compiler.js";
import{validateCrossPlaneEntityArtifact}from"../../../../packages/shared/data-integration/entity-operation-scope-contracts/src/index.js";
function argument(name:string){return process.argv.find(value=>value.startsWith(`${name}=`))?.slice(name.length+1)}
const url=argument("--admin-url"),expected=argument("--admin-database");if(!url||!expected)throw new Error("Explicit Admin URL and database guard required");
const client=new pg.Client({connectionString:url});await client.connect();
try{
 const identity=await client.query<{database_name:string}>("select current_database() database_name");if(identity.rows[0]?.database_name!==expected)throw new Error("P5-F Admin database guard rejected target");
 const rows=await client.query<{entity_id:string;entity_code:string;release_id:string;release_hash:string;revision_id:string;revision_hash:string;contract_hash:string;contract_json:Record<string,unknown>}>(`select distinct on(e.id) e.id::text entity_id,e.entity_code,r.id::text release_id,r.release_hash,r.revision_id::text,s.revision_hash,r.contract_hash,s.contract_json from metadata.entity e join metadata.entity_release r on r.entity_id=e.id join snapshot.entity_contract_revision s on s.id=r.revision_id where e.tenant_id is null and e.entity_code=any($1::text[]) order by e.id,r.release_no desc`,[["business_partner","document_envelope"]]);
 const fixtures=[];
 for(const row of rows.rows){const plane=row.entity_code==="document_envelope"?"mesh" as const:"neon" as const;const artifact=compileEntityPlaneArtifact({plane,entityId:row.entity_id,entityCode:row.entity_code,releaseId:row.release_id,releaseHash:row.release_hash,revisionId:row.revision_id,revisionHash:row.revision_hash,contractHash:row.contract_hash,contract:row.contract_json});const problems=validateCrossPlaneEntityArtifact(artifact);if(problems.length)throw new Error(`P5-F ${row.entity_code} invalid:${problems.join(",")}`);const hash=await client.query<{compiled_hash:string}>("select snapshot.fn_compute_entity_release_artifact_hash($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::jsonb) compiled_hash",[row.release_id,row.revision_id,row.entity_id,plane,row.release_hash,row.contract_hash,JSON.stringify(artifact)]);fixtures.push({plane,entityCode:row.entity_code,releaseHash:row.release_hash,candidateCompiledHash:hash.rows[0]!.compiled_hash,schema:`${artifact.artifact_schema_code}@${artifact.artifact_schema_version}`,activationContract:artifact.activation_contract,bindings:artifact.operation_scope_bindings.length});}
 if(fixtures.length!==2)throw new Error("P5-F compatibility fixtures incomplete");
 const semantics=fixtures.map(fixture=>{const{targetPlane,...common}=fixture.activationContract;return JSON.stringify(common)});if(new Set(semantics).size!==1)throw new Error("P5-F activation semantics diverge across planes");
 process.stdout.write(JSON.stringify({status:"approved",format:"athyper.meta-entity-plane-artifact@1.1",fixtures},null,2)+"\n");
}finally{await client.end()}
