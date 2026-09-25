/** Repair only CATL local Inbox read access. Rehearses unless --apply is supplied. */
import { execFileSync } from 'node:child_process';
const mode = process.argv[2] ?? '--dry-run';
if (process.argv.length > 3 || !['--dry-run', '--apply'].includes(mode)) throw Error('Use --dry-run or --apply');
const statement = `
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT set_config('app.database_plane','neon',true);
SELECT set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true);
DO $repair$
DECLARE
 t constant uuid := '44444444-4444-4444-8444-444444444444';
 ref constant text := 'catl-inbox-read-repair-20260923';
 grant_code constant text := 'dev.catl.inbox_reader';
 actor uuid; permission uuid; role_id uuid; group_id uuid; scope_id uuid;
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Local Neon required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(ref,0));
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
 IF (SELECT count(*) FROM master.principal p WHERE p.tenant_id=t AND p.status='active' AND (p.code,p.id) IN
   (('catl.admin','cca94907-7519-5871-8e3c-6b11aa545c93'::uuid),('catl.owner','645b6a55-3355-526a-9643-3900425bde47'::uuid)))<>2 THEN RAISE EXCEPTION 'Expected accounts changed'; END IF;
 SELECT id INTO STRICT permission FROM authz.permission WHERE canonical_code='workflow.work_item.read' AND status='published' AND NOT requires_mfa AND NOT requires_sod;
 SELECT id INTO STRICT scope_id FROM authz.scope_target WHERE tenant_id=t AND scope_kind='tenant' AND scope_key='cirrusatlantic' AND status='active';
 -- Never alter an existing role, entitlement, deny or unrelated permission.
 IF EXISTS(SELECT 1 FROM authz.role r WHERE r.tenant_id=t AND r.code=grant_code) THEN RAISE EXCEPTION 'Repair exists; inspect instead of duplicating grants'; END IF;
 INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
 VALUES(t,grant_code,'CATL local Inbox reader','custom','manual',ref,'draft',actor) RETURNING id INTO role_id;
 INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) VALUES(t,role_id,permission,actor);
 UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=role_id;
 INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
 VALUES(t,grant_code,'CATL local Inbox readers','custom','manual',ref,'active',actor) RETURNING id INTO group_id;
 INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
 SELECT t,group_id,p.id,'manual',ref,'active',actor FROM master.principal p WHERE p.tenant_id=t AND p.code IN ('catl.admin','catl.owner') AND p.status='active';
 INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
 VALUES(t,group_id,role_id,scope_id,'exact','manual',ref,'active',actor);
END $repair$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT 'CATL admin/owner: workflow.work_item.read only; assigned/team/candidate filtering retained';
${mode === '--apply' ? 'COMMIT' : 'ROLLBACK'};
`;
console.log(execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-At','-v','ON_ERROR_STOP=1'],{input:statement,encoding:'utf8'}).trim());
