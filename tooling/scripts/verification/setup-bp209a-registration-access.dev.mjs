/** User-approved CATL bank-registration grant. No verification/reveal/request-create grants. */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const mode=process.argv[2]??'--dry-run';
if(process.argv.length>3||!['--dry-run','--apply'].includes(mode))throw Error('Use --dry-run or --apply');
const source=readFileSync('server/db/ddl/planes/neon/authz/14_permission_reference_seed.sql','utf8');
const reference=source.split('-- BP2-09A REGISTER BEGIN:')[1]?.split('\n').slice(1).join('\n').split('-- BP2-09A REGISTER END')[0];
if(!reference)throw Error('Dedicated permission reference not found');
const statement=`BEGIN;
SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';
SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true);
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Local Neon required'; END IF; END $$;
SELECT pg_advisory_xact_lock(hashtextextended('bp209a-catl-registration-20260923',0));
${reference}
DO $grant$
DECLARE
 t constant uuid:='44444444-4444-4444-8444-444444444444';
 target constant uuid:='cca94907-7519-5871-8e3c-6b11aa545c93';
 ref constant text:='bp209a-catl-registration-20260923';
 grant_code constant text:='dev.catl.partner_bank_registrant';
 actor uuid; permission_id uuid; role_id uuid; group_id uuid; scope_id uuid;
BEGIN
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
 IF NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=t AND id=target AND code='catl.admin' AND status='active') THEN RAISE EXCEPTION 'CATL admin changed'; END IF;
 SELECT p.id INTO STRICT permission_id FROM authz.permission p JOIN control.module m ON m.id=p.module_id
 WHERE p.canonical_code='neon.business_partner_bank.register' AND p.id='07e5d051-6f2d-49b0-8d4a-fcf75e3ee901' AND m.code='bp' AND p.status='published' AND p.risk_tier='medium' AND NOT p.requires_mfa AND NOT p.requires_sod AND NOT p.is_shareable AND NOT p.is_delegable AND NOT p.is_overridable;
 SELECT id INTO STRICT scope_id FROM authz.scope_target WHERE tenant_id=t AND scope_kind='tenant' AND scope_key='cirrusatlantic' AND status='active';
 IF EXISTS(SELECT 1 FROM authz.role WHERE tenant_id=t AND code=grant_code) THEN RAISE EXCEPTION 'Grant already exists; inspect instead of duplicating'; END IF;
 INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,metadata,status,created_by)
 VALUES(t,grant_code,'CATL partner bank registrant','custom','manual',ref,'{"userApproved":true,"permissionBoundary":"bank registration only"}','draft',actor) RETURNING id INTO role_id;
 INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) VALUES(t,role_id,permission_id,actor);
 UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=role_id;
 INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
 VALUES(t,grant_code,'CATL partner bank registrants','custom','manual',ref,'active',actor) RETURNING id INTO group_id;
 INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by) VALUES(t,group_id,target,'manual',ref,'active',actor);
 INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
 VALUES(t,group_id,role_id,scope_id,'exact','manual',ref,'active',actor);
END $grant$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT jsonb_build_object('principal','catl.admin','permission',p.canonical_code,'scopeKind',s.scope_kind,'scopeKey',s.scope_key,'roleId',r.id,'groupId',g.id)
FROM authz.role r JOIN authz.role_permission rp ON rp.role_id=r.id AND rp.tenant_id=r.tenant_id JOIN authz.permission p ON p.id=rp.permission_id
JOIN authz.group_role gr ON gr.role_id=r.id AND gr.tenant_id=r.tenant_id JOIN authz.scope_target s ON s.id=gr.scope_target_id JOIN authz.principal_group g ON g.id=gr.group_id
WHERE r.tenant_id='44444444-4444-4444-8444-444444444444' AND r.source_ref='bp209a-catl-registration-20260923';
${mode==='--apply'?'COMMIT':'ROLLBACK'};`;
console.log(execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-At','-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8'}).trim());
