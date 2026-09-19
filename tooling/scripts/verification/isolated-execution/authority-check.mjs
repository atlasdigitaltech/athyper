import {execFileSync} from 'node:child_process';import{createHash}from'node:crypto';
const tables=['authz.role','authz.role_permission','authz.group_member','authz.group_role','authz.plane_membership','authz.delegation_grant','authz.permission','authz.permission_scope_kind','authz.deny_rule','authz.record_acl','authz.override','authz.scope_target','authz.principal_group'];
export function authoritySnapshot(){
 const query=tables.map(t=>`SELECT '${t}',coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM ${t} t`).join(' UNION ALL ');
 const read=container=>execFileSync('docker',['exec',container,'psql','-X','-U','postgres','-d','athyper_neon','-Atc',query],{encoding:'utf8',maxBuffer:20000000,stdio:['pipe','pipe','pipe']});
 const source=createHash('sha256').update(read('athyper-dev-db-1')).digest('hex'),clone=createHash('sha256').update(read('athyper-bp-r19-db')).digest('hex');
 return{capturedAt:new Date().toISOString(),tables,source,clone};
}
export function assertAuthorityUnchanged(){const snapshot=authoritySnapshot();if(snapshot.source!==snapshot.clone)throw Error('SOURCE_CLONE_AUTHORITY_DRIFT');return{capturedAt:snapshot.capturedAt,tables:snapshot.tables,sha256:snapshot.source,sourceCloneMatch:true};}
if(process.argv[1]?.endsWith('/authority-check.mjs'))console.log(JSON.stringify(assertAuthorityUnchanged()));
