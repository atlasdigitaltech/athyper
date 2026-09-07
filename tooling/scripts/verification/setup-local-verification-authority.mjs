#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const code='neon.relationship.business_partner.verify_contact';
function uuid(name,namespace='6ba7b810-9dad-11d1-80b4-00c04fd430c8'){const b=createHash('sha1').update(Buffer.from(namespace.replaceAll('-',''),'hex')).update(name).digest().subarray(0,16);b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
const permission=uuid(code,uuid('athyper.authorization.catalog.v2'));
const role=uuid('athyper.local.contact-verification.role'),group=uuid('athyper.local.contact-verification.group');
const tenant='44444444-4444-4444-8444-444444444444',source='local-contact-verification:v1';
const sql=`BEGIN;
SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id','${tenant}',true),set_config('app.current_principal_id','cca94907-7519-5871-8e3c-6b11aa545c93',true);
DO $$ BEGIN
 IF current_database()<>'athyper_neon' OR NOT EXISTS(SELECT 1 FROM master.tenant WHERE id='${tenant}' AND code='cirrusatlantic' AND status='active') THEN RAISE EXCEPTION 'Local pilot tenant mismatch'; END IF;
END $$;
INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,metadata,status,created_by)
SELECT '${permission}','${code}','capability',module_id,'medium',false,false,false,false,'{"source":"${source}","qualification":"local-pilot-only"}','published','cca94907-7519-5871-8e3c-6b11aa545c93'
FROM authz.permission WHERE canonical_code='neon.relationship.business_partner.read' AND status='published'
ON CONFLICT(canonical_code) DO NOTHING;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM authz.permission WHERE id='${permission}' AND canonical_code='${code}' AND permission_kind='capability' AND status='published' AND metadata->>'source'='${source}') THEN RAISE EXCEPTION 'Capability conflict'; END IF; END $$;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
VALUES('${permission}','operating_organization','exact','active','cca94907-7519-5871-8e3c-6b11aa545c93') ON CONFLICT DO NOTHING;
INSERT INTO authz.role(id,tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
VALUES('${role}','${tenant}','local.contact-verifier','Local contact verifier','Local verification only, exact operating organization','system','seed','${source}','{}','draft','cca94907-7519-5871-8e3c-6b11aa545c93') ON CONFLICT DO NOTHING;
INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by)
SELECT '${uuid('local.contact-verification.role-permission')}','${tenant}','${role}','${permission}','cca94907-7519-5871-8e3c-6b11aa545c93' WHERE NOT EXISTS(SELECT 1 FROM authz.role_permission WHERE tenant_id='${tenant}' AND role_id='${role}' AND permission_id='${permission}') ON CONFLICT DO NOTHING;
UPDATE authz.role SET status='active' WHERE id='${role}' AND tenant_id='${tenant}' AND status='draft';
INSERT INTO authz.principal_group(id,tenant_id,code,name,description,group_kind,source_type,source_ref,metadata,status,created_by)
VALUES('${group}','${tenant}','local.contact-verifiers','Local contact verifiers','Two selected local test actors','system','seed','${source}','{}','active','cca94907-7519-5871-8e3c-6b11aa545c93') ON CONFLICT DO NOTHING;
${['catl.admin','catl.owner'].map(name=>`INSERT INTO authz.group_member(id,tenant_id,group_id,principal_id,source_type,source_ref,metadata,status,created_by)
SELECT '${uuid('local.verification.member.'+name)}','${tenant}','${group}',id,'seed','${source}','{}','active','cca94907-7519-5871-8e3c-6b11aa545c93' FROM master.principal WHERE tenant_id='${tenant}' AND code='${name}' AND status='active' ON CONFLICT DO NOTHING;`).join('\n')}
INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,metadata,status,created_by)
SELECT '${uuid('local.verification.organization-grant')}','${tenant}','${group}','${role}',id,'exact','seed','${source}','{}','active','cca94907-7519-5871-8e3c-6b11aa545c93'
FROM authz.scope_target WHERE tenant_id='${tenant}' AND scope_kind='operating_organization' AND target_id='a478f9c0-8226-5d22-9599-b8fb27a45180' AND status='active' ON CONFLICT DO NOTHING;
INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('master_contact_verification_event','^master[.]contact[.]verification_changed$',34,ARRAY['execute','update']::audit.operation_d[],'info',ARRAY['user','service_account','system']::audit.actor_type_d[],'tenant',false,'metadata',16384,1,'{"event_category":"contact_verification","owner":"master-data","sensitive":true}','active') ON CONFLICT(code) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM authz.role WHERE id='${role}' AND tenant_id='${tenant}' AND source_ref='${source}' AND status='active') OR NOT EXISTS(SELECT 1 FROM authz.principal_group WHERE id='${group}' AND tenant_id='${tenant}' AND source_ref='${source}' AND status='active') THEN RAISE EXCEPTION 'Local role/group conflict'; END IF;
 IF (SELECT count(*) FROM authz.role_permission WHERE tenant_id='${tenant}' AND role_id='${role}')<>1 THEN RAISE EXCEPTION 'Unexpected verifier role authority'; END IF;
 IF (SELECT count(*) FROM authz.group_member WHERE group_id='${group}' AND tenant_id='${tenant}' AND status='active')<>2 THEN RAISE EXCEPTION 'Expected exactly two local verifier members'; END IF;
 IF (SELECT count(*) FROM authz.group_role WHERE group_id='${group}' AND tenant_id='${tenant}' AND status='active')<>1 THEN RAISE EXCEPTION 'Expected one exact organization grant'; END IF;
END $$;
COMMIT;`;
const result=spawnSync('docker',['exec','-i','athyper-dev-db-1','psql','-U','postgres','-d','athyper_neon','-X','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
if(result.status!==0){process.stderr.write(result.stderr);process.exit(result.status??1);}
console.log(JSON.stringify({permission,code,tenant,users:['catl.admin','catl.owner'],scope:'operating_organization/exact',target:'a478f9c0-8226-5d22-9599-b8fb27a45180',status:'applied'}));
