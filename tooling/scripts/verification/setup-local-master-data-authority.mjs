#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const tenant='44444444-4444-4444-8444-444444444444',actor='cca94907-7519-5871-8e3c-6b11aa545c93',source='local-master-data-authority:v1';
const prefix='neon.relationship.business_partner.', sensitive=['read_contact_sensitive','read_address_sensitive','write_contact_sensitive','write_address_sensitive'];
function uuid(name,ns='6ba7b810-9dad-11d1-80b4-00c04fd430c8'){const b=createHash('sha1').update(Buffer.from(ns.replaceAll('-',''),'hex')).update(name).digest().subarray(0,16);b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
function db(sql){const r=spawnSync('docker',['exec','-i','athyper-dev-db-1','psql','-U','postgres','-d','athyper_neon','-X','-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});if(r.status)throw new Error(r.stderr);return r.stdout.split('\n').filter(x=>x&&x!=='BEGIN'&&x!=='COMMIT');}
const base=JSON.parse(db(`BEGIN READ ONLY; SELECT json_build_object('contract',c.contract_json,'descriptor',d.compiled_json,'releaseNo',c.release_no) FROM runtime_meta.entity_descriptor d JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id JOIN runtime_meta.applied_release a ON a.id=d.applied_release_id WHERE c.entity_code='business_partner' AND c.tenant_id IS NULL AND c.status='published' AND d.status='active' AND a.status='active'; COMMIT;`)[0]);
const rootPermissions=Object.fromEntries(db(`BEGIN READ ONLY; SELECT canonical_code||'|'||id FROM authz.permission WHERE canonical_code IN ('${prefix}read','${prefix}update') AND status='published'; COMMIT;`).map(v=>v.split('|')));
if(Object.keys(rootPermissions).length!==2)throw new Error('Published root read/update required');
const orgB=uuid(source+'.organization-b'),partnerB=uuid(source+'.partner-b');
const fixtures=[{username:'catl.admin',org:'a478f9c0-8226-5d22-9599-b8fb27a45180',partner:'f7688c3d-8c92-5651-a469-da3f4f786375'}, {username:'catl.owner',org:orgB,partner:partnerB}];
const publicationKey='metadata.entity.business_partner.local-master-data.cirrusatlantic';
const releaseId=uuid(source+'.release'),entityId=uuid(source+'.entity'),releaseNo=1;
const contract=structuredClone(base.contract);contract.operations.push({code:'update',permissionCode:prefix+'update'});
const contractHash=hash(contract),descriptor=structuredClone(base.descriptor);
descriptor.operations.update={code:'update',permissionCode:prefix+'update'};
descriptor.source={entity_id:entityId,release_hash:contractHash};
descriptor.operation_scope_bindings=['read','update'].map(operationKey=>({bindingId:uuid(source+'.binding.'+operationKey),scopeBindingId:uuid(source+'.scope.'+operationKey),sourceEntityOperationId:uuid(source+'.operation.'+operationKey),entityCode:'business_partner',operationKey,permissionId:rootPermissions[prefix+operationKey],permissionCode:prefix+operationKey,permissionKind:'entity_operation',decisionMode:operationKey==='read'?'collection':'entity_resource',scopeKind:'operating_organization',coordinateSource:operationKey==='read'?'relation_resolver':'record_field',coordinateKey:operationKey==='read'?null:'operatingOrganizationId',resolverKey:operationKey==='read'?'neon.business_partner.operating_organization.v1':null}));
const compiledHash=hash(descriptor),publishedAt='2026-09-06T00:00:00.000Z';
const manifest={schema:'athyper.development-runtime-publication/1.0',sourceVersion:source,publicationKey,releaseId,releaseNo,tenantId:tenant,targetPlane:'neon',contractHash,compiledHash};
const projection={contract:{id:uuid(source+'.contract'),tenant_id:tenant,entity_id:entityId,entity_code:'business_partner',release_id:releaseId,revision_id:uuid(source+'.revision'),release_no:releaseNo,contract_schema_code:'athyper.meta-entity-contract',contract_schema_version:'2.1',contract_hash:contractHash,contract_json:contract,publication_key:publicationKey,signature_algorithm:'development-local-sha256',signing_key_id:'local-development-runtime-bootstrap',signature:hash({contractHash,releaseId,tenantId:tenant,targetPlane:'neon'}),published_at:publishedAt},descriptor:{id:uuid(source+'.descriptor'),plane_code:'neon',descriptor_kind:'entity_runtime',descriptor_schema_version:'1.0.0',source_contract_hash:contractHash,compiled_hash:compiledHash,compiled_json:descriptor,compiler_version:source,compatibility_level:'backward_compatible',generated_at:publishedAt}};
const verification={signature_verified:true,manifest_valid:true,runtime_compatible:true,target_plane:'neon',contract_hash:contractHash,descriptor_source_hash:contractHash,contract_schema_version:'2.1',descriptor_schema_version:'1.0.0',signature_algorithm:'development-local-sha256',signing_key_id:'local-development-runtime-bootstrap'};
const artifactHash=hash({manifest,contract,descriptor});
const roleRoot=uuid(source+'.root-role'),roleSensitive=uuid(source+'.sensitive-role');
let sql=`BEGIN; SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id','${tenant}',true),set_config('app.current_principal_id','${actor}',true); SELECT pg_advisory_xact_lock(hashtextextended('${source}',0));
DO $$ BEGIN IF current_database()<>'athyper_neon' OR NOT EXISTS(SELECT 1 FROM master.tenant WHERE id='${tenant}' AND code='cirrusatlantic' AND status='active') THEN RAISE EXCEPTION 'Local tenant mismatch'; END IF; END $$;
`;
sql+=readFileSync(new URL('../../../server/db/scripts/provisioning/sql/local-master-data-authority-lock.sql',import.meta.url),'utf8')+'\nGRANT EXECUTE ON FUNCTION control.lock_master_data_owner_registry() TO athyper_runtime;\n';
for(const suffix of sensitive){const code=prefix+suffix,id=uuid(code,uuid('athyper.authorization.catalog.v2'));sql+=`
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,metadata,status,created_by)
SELECT '${id}','${code}','capability',module_id,'medium',false,false,false,false,'{"source":"${source}","qualification":"local-synthetic-pilot-only"}','published','${actor}' FROM authz.permission WHERE canonical_code='${prefix}read' AND status='published' ON CONFLICT(canonical_code) DO NOTHING;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM authz.permission WHERE id='${id}' AND canonical_code='${code}' AND status='published' AND permission_kind='capability' AND risk_tier='medium' AND NOT requires_mfa AND NOT requires_sod AND NOT is_shareable AND NOT is_delegable AND metadata->>'source'='${source}') THEN RAISE EXCEPTION 'Sensitive capability conflict'; END IF; END $$;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) VALUES('${id}','operating_organization','exact','active','${actor}') ON CONFLICT DO NOTHING;
`;}
sql+=`INSERT INTO master.operating_organization(id,tenant_id,code,name,domain,status,metadata,created_by) VALUES('${orgB}','${tenant}','local.master-data.b','Local synthetic master-data organization B','procurement','active','{"source":"${source}"}','${actor}') ON CONFLICT DO NOTHING;
INSERT INTO master.business_partner(id,tenant_id,code,name,partner_category,ownership_class,category_locked_by,status,metadata,created_by) VALUES('${partnerB}','${tenant}','LOCAL-MASTER-DATA-B','Local synthetic master-data partner B','organization','external','${actor}','active','{"source":"${source}"}','${actor}') ON CONFLICT DO NOTHING;
INSERT INTO master.supplier(id,tenant_id,business_partner_id,supplier_code,metadata,created_by) VALUES('${uuid(source+'.supplier-b')}','${tenant}','${partnerB}','LOCAL-MASTER-DATA-B','{"source":"${source}"}','${actor}') ON CONFLICT DO NOTHING;
INSERT INTO master.business_partner_operating_organization_assignment(id,tenant_id,business_partner_id,operating_organization_id,partner_role,status,metadata,created_by) VALUES('${uuid(source+'.assignment-b')}','${tenant}','${partnerB}','${orgB}','supplier','active','{"source":"${source}"}','${actor}') ON CONFLICT DO NOTHING;
INSERT INTO authz.scope_target(id,tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,display_name,metadata,status,created_by) VALUES('${uuid(source+'.scope-target-b')}','${tenant}','operating_organization','local.master-data.b','${orgB}',(SELECT id FROM authz.scope_target WHERE tenant_id='${tenant}' AND scope_kind='tenant' AND status='active'),'Local master-data B','{"source":"${source}"}','active','${actor}') ON CONFLICT DO NOTHING;
`;
for(const [role,kind,codes] of [[roleRoot,'root',['read','update']],[roleSensitive,'sensitive',sensitive]]){
 sql+=`INSERT INTO authz.role(id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by) VALUES('${role}','${tenant}','local.master-data.${kind}','Local master-data ${kind}','Selected local synthetic pilot only','system','seed','${source}','{}','draft','${actor}') ON CONFLICT DO NOTHING;\n`;
 for(const code of codes)sql+=`INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by) SELECT '${uuid(source+'.'+kind+'.'+code)}','${tenant}','${role}',p.id,'${actor}' FROM authz.permission p WHERE p.canonical_code='${prefix+code}' AND p.status='published' AND NOT EXISTS(SELECT 1 FROM authz.role_permission WHERE tenant_id='${tenant}' AND role_id='${role}' AND permission_id=p.id);\n`;
 sql+=`UPDATE authz.role SET status='active' WHERE id='${role}' AND tenant_id='${tenant}' AND status='draft';\n`;
}
for(const f of fixtures){const group=uuid(source+'.group.'+f.username);
 sql+=`INSERT INTO authz.principal_group(id,tenant_id,code,name,description,group_kind,source_type,source_ref,metadata,status,created_by) VALUES('${group}','${tenant}','local.master-data.${f.username}','Local master-data ${f.username}','One selected local actor','system','seed','${source}','{}','active','${actor}') ON CONFLICT DO NOTHING;
INSERT INTO authz.group_member(id,tenant_id,group_id,principal_id,source_type,source_ref,metadata,status,created_by) SELECT '${uuid(source+'.member.'+f.username)}','${tenant}','${group}',id,'seed','${source}','{}','active','${actor}' FROM master.principal WHERE tenant_id='${tenant}' AND code='${f.username}' AND status='active' ON CONFLICT DO NOTHING;\n`;
 for(const [role,mode] of [[roleRoot,'subtree'],[roleSensitive,'exact'],...(f.username==='catl.owner'?[[uuid('athyper.local.contact-verification.role'),'exact']]:[])])sql+=`INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,status,created_by) SELECT '${uuid(source+'.grant.'+f.username+'.'+role)}','${tenant}','${group}','${role}',id,'${mode}','seed','${source}','{}','active','${actor}' FROM authz.scope_target WHERE tenant_id='${tenant}' AND scope_kind='operating_organization' AND target_id='${f.org}' AND status='active' ON CONFLICT DO NOTHING;\n`;
}
sql+=`INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status) VALUES('master_contact_address_mutation_event','^master[.](contact[.](created|deactivated)|address[.](linked|deactivated))$',34,ARRAY['create','update','execute']::audit.operation_d[],'info',ARRAY['user','service_account','system']::audit.actor_type_d[],'tenant',false,'metadata',16384,1,'{"source":"${source}","owner":"master-data","sensitive":true}','active') ON CONFLICT(code) DO NOTHING;
DO $$ DECLARE staged record; checked record; BEGIN
 SELECT * INTO staged FROM runtime_meta.fn_stage_release_projection('${publicationKey}','${releaseId}',${releaseNo},'${uuid(source+'.deployment')}','${artifactHash}',${q(JSON.stringify(manifest))}::jsonb,${q(JSON.stringify(projection))}::jsonb);
 IF staged.status<>'active' THEN
 SELECT * INTO checked FROM runtime_meta.fn_verify_release(staged.id,'${artifactHash}',${q(JSON.stringify(verification))}::jsonb);
 IF checked.status<>'verified' THEN RAISE EXCEPTION 'Local metadata verification failed: %',checked.failure_code; END IF;
 PERFORM runtime_meta.fn_activate_release(staged.id,'{"source":"${source}","qualification":"local-only"}'::jsonb);
 END IF;
END $$;
DO $$ BEGIN
 IF (SELECT count(*) FROM authz.role_permission WHERE role_id='${roleRoot}' AND tenant_id='${tenant}')<>2 OR (SELECT count(*) FROM authz.role_permission WHERE role_id='${roleSensitive}' AND tenant_id='${tenant}')<>4 THEN RAISE EXCEPTION 'Unexpected local role authority'; END IF;
 IF (SELECT count(*) FROM authz.group_member WHERE source_ref='${source}' AND status='active')<>2 THEN RAISE EXCEPTION 'Expected two selected members'; END IF;
 IF (SELECT count(*) FROM authz.group_role WHERE source_ref='${source}' AND status='active')<>5 THEN RAISE EXCEPTION 'Expected five scoped role grants'; END IF;
END $$;
COMMIT;`;
const plan={environment:'local',tenant,source,capabilities:sensitive.map(s=>prefix+s),riskTier:'medium',requiresMfa:false,requiresSod:false,shareable:false,delegable:false,sensitiveScope:'operating_organization/exact',rootScope:'operating_organization/subtree',fixtures,publicationKey,releaseId,artifactHash};
if(!process.argv.includes('--apply')){console.log(JSON.stringify({...plan,status:'planned'},null,2));process.exit(0);}
db(sql);writeFileSync('/tmp/athyper-local-master-authority-publication.json',JSON.stringify({...plan,status:'applied'},null,2));console.log(JSON.stringify({...plan,status:'applied'},null,2));
