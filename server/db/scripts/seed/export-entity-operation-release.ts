import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";
import type { MetadataReleaseProjectionSource } from "./entity-operation-projection-compiler.js";

const databaseUrl=option("--database-url")??process.env.STUDIO_DATABASE_URL?.trim();
const releaseId=option("--release-id");
const plane=option("--plane");
const output=option("--output");
const expectedDatabase=option("--expected-database");
if(!databaseUrl||!releaseId||!output||!(["neon","mesh"] as string[]).includes(plane??""))throw new Error("Usage: export-entity-operation-release.ts --database-url=URL --release-id=UUID --plane=neon|mesh --output=PATH [--expected-database=NAME]");
const targetPlane=plane as "neon"|"mesh";
const client=new pg.Client({connectionString:databaseUrl,application_name:"entity-operation-release-export"});
await client.connect();
try{
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const identity=(await client.query<{name:string}>("SELECT current_database() name")).rows[0]!.name;
  if(expectedDatabase&&identity!==expectedDatabase)throw new Error(`database guard rejected ${identity}; expected ${expectedDatabase}`);
  const header=(await client.query<{tenant_id:string|null;entity_id:string;entity_code:string;release_id:string;release_hash:string;compiled_hash:string}>(`
    SELECT release.tenant_id::text,release.entity_id::text,entity.entity_code,
           release.id::text release_id,release.release_hash,artifact.compiled_hash
      FROM metadata.entity_release release
      JOIN metadata.entity entity ON entity.id=release.entity_id
      JOIN snapshot.entity_release_artifact artifact ON artifact.source_release_id=release.id AND artifact.plane_key=$2
     WHERE release.id=$1::uuid
  `,[releaseId,targetPlane])).rows[0];
  if(!header)throw new Error(`published Metadata release artifact is missing: ${releaseId}/${targetPlane}`);
  if(header.tenant_id!==null)throw new Error(`global entity-operation projection rejects tenant-owned release: ${releaseId}`);
  const operations=(await client.query<{id:string;operation_key:string;status:"active"|"deprecated"}>(`
    SELECT operation.id::text,operation.operation_key,operation.status::text
      FROM metadata.entity_release release JOIN metadata.entity_operation operation ON operation.change_set_id=release.change_set_id
     WHERE release.id=$1::uuid ORDER BY operation.operation_key
  `,[releaseId])).rows.map(row=>({id:row.id,operationKey:row.operation_key,status:row.status}));
  const operationPermissions=(await client.query<{entity_operation_id:string;target_plane:"neon"|"mesh";permission_code:string;permission_kind:"entity_operation"|"capability";status:"active"|"deprecated"}>(`
    SELECT permission.entity_operation_id::text,permission.target_plane,permission.permission_code,permission.permission_kind,permission.status::text
      FROM metadata.entity_release release JOIN metadata.entity_operation_permission permission ON permission.change_set_id=release.change_set_id
     WHERE release.id=$1::uuid AND permission.target_plane=$2 ORDER BY permission.entity_operation_id
  `,[releaseId,targetPlane])).rows.map(row=>({entityOperationId:row.entity_operation_id,targetPlane:row.target_plane,permissionCode:row.permission_code,permissionKind:row.permission_kind,status:row.status}));
  const operationScopeBindings=(await client.query<{entity_operation_id:string;target_plane:"neon"|"mesh";decision_mode:"entity_resource"|"collection";scope_kind:MetadataReleaseProjectionSource["operationScopeBindings"][number]["scopeKind"];coordinate_source:MetadataReleaseProjectionSource["operationScopeBindings"][number]["coordinateSource"];coordinate_key:string|null;resolver_key:string|null;missing_value_behavior:"deny";status:"active"|"deprecated"}>(`
    SELECT scope.entity_operation_id::text,scope.target_plane,scope.decision_mode,scope.scope_kind,scope.coordinate_source,
           scope.coordinate_key,scope.resolver_key,scope.missing_value_behavior,scope.status::text
      FROM metadata.entity_release release JOIN metadata.entity_operation_scope_binding scope ON scope.change_set_id=release.change_set_id
     WHERE release.id=$1::uuid AND scope.target_plane=$2 ORDER BY scope.entity_operation_id,scope.scope_kind
  `,[releaseId,targetPlane])).rows.map(row=>({entityOperationId:row.entity_operation_id,targetPlane:row.target_plane,decisionMode:row.decision_mode,scopeKind:row.scope_kind,coordinateSource:row.coordinate_source,coordinateKey:row.coordinate_key,resolverKey:row.resolver_key,missingValueBehavior:row.missing_value_behavior,status:row.status}));
  const result:MetadataReleaseProjectionSource={contractVersion:"athyper.metadata.entity-operation-release.v1",source:{tenantId:header.tenant_id as null,entityId:header.entity_id,entityCode:header.entity_code,releaseId:header.release_id,releaseHash:header.release_hash,compiledHash:header.compiled_hash},targetPlane,operations,operationPermissions,operationScopeBindings};
  const path=resolve(output);await mkdir(dirname(path),{recursive:true});await writeFile(path,`${JSON.stringify(result,null,2)}\n`,`utf8`);
  await client.query("COMMIT");console.log(JSON.stringify({database:identity,releaseId,targetPlane,operations:operations.length,permissionMappings:operationPermissions.length,scopeCoordinates:operationScopeBindings.length,output:path},null,2));
}catch(error){await client.query("ROLLBACK");throw error;}finally{await client.end();}

function option(name:string):string|undefined{const value=process.argv.slice(2).find(item=>item.startsWith(`${name}=`));return value?.slice(name.length+1).trim()||undefined;}
