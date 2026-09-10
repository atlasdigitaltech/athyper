import {request} from '@playwright/test';
import {sql,tenant,save} from './atlas-f6-common.mjs';
const origin='https://studio.dev.athyper.test',principal='81cd1978-2df5-5c9a-938a-2f8c291aea13';
const c=await request.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:'tests/e2e/.auth/dev/studio/catl.admin.json'});
try{
 const session=await(await c.get('/api/auth/session')).json();
 if(session.state!=='authenticated'||session.principalId!==principal||session.tenantId!==tenant)throw Error('Refresh DEV Cirrus Studio catl.admin');
 const entityId='253c9d44-311d-49ec-8f60-9d61527ceacc';
 // Operator scaffolding for the imported baseline. Creates only a new draft
 // identity; all review, signature, release and activation use authoring APIs.
 sql('studio',`BEGIN; SET LOCAL lock_timeout='5s';
 INSERT INTO metadata.entity(id,tenant_id,module_id,entity_code,entity_class,ownership_model,status,created_by)
 SELECT '${entityId}','${tenant}',e.module_id,'network_relationship','configuration','overlay','draft','${principal}' FROM metadata.entity e WHERE e.id='3015f9d4-a067-5a39-b155-f355a1228ed6' AND e.tenant_id IS NULL
 AND EXISTS(SELECT 1 FROM metadata.entity_baseline_import b WHERE b.id='75674873-1b92-4100-b489-b5676ef7d1dc' AND b.tenant_id='${tenant}' AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation WHERE baseline_id=b.id)) ON CONFLICT DO NOTHING;
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM metadata.entity WHERE id='${entityId}' AND tenant_id='${tenant}' AND entity_code='network_relationship' AND ownership_model='overlay') THEN RAISE EXCEPTION 'DRAFT_SCAFFOLD_MISMATCH'; END IF; END $$; COMMIT;`);
 const existing=sql('studio',`SELECT jsonb_build_object('id',id) FROM metadata.entity_change_set WHERE tenant_id='${tenant}' AND entity_id='${entityId}' AND branch_code='atlas-mesh-tenant-fork' ORDER BY created_at LIMIT 1`);
 let status=200,body;
 if(existing)body=JSON.parse(existing);
 else {
 const csrf=(await c.storageState()).cookies.find(x=>x.name==='__Host-athyper-csrf'&&x.domain==='studio.dev.athyper.test');if(!csrf)throw Error('Missing CSRF');
 const r=await c.post('/api/relay/meta-entity-authoring/change-sets',{headers:{origin,'x-csrf-token':decodeURIComponent(csrf.value)},data:{entityId,entityCode:'network_relationship',branchCode:'atlas-mesh-tenant-fork',title:'Cirrus Mesh AI from observed global release 5'}});status=r.status();body=await r.json();
 }
 save('mesh-native-draft.json',{observedAt:new Date().toISOString(),actor:'catl.admin',entityId,operatorScaffold:true,status,body});console.log(JSON.stringify({status,body}));
 if(status>=400)process.exitCode=1;
}finally{await c.dispose();}
