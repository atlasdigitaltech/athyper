/** Explicit user-approved DEV NEON company access. Defaults to a rolled-back rehearsal. */
import { execFileSync } from 'node:child_process';

const mode = process.argv[2] ?? '--dry-run';
if (process.argv.length > 3 || !['--dry-run', '--apply'].includes(mode)) {
  throw new Error('Use --dry-run or --apply');
}
const statement = `
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT set_config('app.database_plane','neon',true);
SELECT set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true);
DO $grant$
DECLARE
  t constant uuid := '11111111-1111-4111-8111-111111111111';
  ref constant text := 'user-approved-athyper-company-access-20260923';
  grant_code constant text := 'dev.athyper.all_active_companies.20260923';
  actor uuid; role_id uuid; group_id uuid;
BEGIN
  IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'DEV Neon required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(ref,0));
  SELECT id INTO STRICT actor FROM master.principal
    WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
  IF (SELECT count(*) FROM master.principal p JOIN authz.plane_membership m
        ON m.tenant_id=p.tenant_id AND m.principal_id=p.id
        WHERE p.tenant_id=t AND p.status='active' AND m.status='active'
        AND m.effective_from<=now() AND (m.effective_until IS NULL OR m.effective_until>now())
        AND (p.code,p.id) IN (('athyper.admin','d4250b08-6e5e-5887-b4e1-6f3eb31d7c8c'::uuid),
                             ('athyper.owner','71667bf5-941b-5f6d-aab0-355e39c0bbde'::uuid)))<>2
    THEN RAISE EXCEPTION 'Expected recipients changed'; END IF;
  IF EXISTS(SELECT 1 FROM authz.role r WHERE r.tenant_id=t AND r.code=grant_code)
    OR EXISTS(SELECT 1 FROM authz.principal_group g WHERE g.tenant_id=t AND g.code=grant_code)
    THEN RAISE EXCEPTION 'Dedicated grant already exists; inspect before rerunning'; END IF;
  CREATE TEMP TABLE approved_permissions ON COMMIT DROP AS
    SELECT p.id FROM authz.permission p WHERE p.status='published'
    AND EXISTS(SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=p.id
      AND s.scope_kind='company_code' AND s.propagation_mode='exact' AND s.status='active');
  -- Two existing active companies lack their canonical company scope. Complete
  -- only those targets, under the existing legal-entity parent; never reactivate
  -- a retired scope or change a permission's compatibility contract.
  INSERT INTO authz.scope_target(tenant_id,scope_kind,scope_key,target_id,parent_scope_target_id,
      display_name,metadata,status,created_by)
    SELECT t,'company_code','company_code:'||c.code,c.id,parent.id,c.name,
      jsonb_build_object('sourceRef',ref),'active',actor
    FROM master.company_code c JOIN authz.scope_target parent
      ON parent.tenant_id=c.tenant_id AND parent.scope_kind='legal_entity'
      AND parent.target_id=c.legal_entity_id AND parent.status='active'
    WHERE c.tenant_id=t AND c.status='active'
      AND c.id IN ('01a0b51b-ff3b-7810-adcb-5e166cbf96d9'::uuid,'01a0b51b-ff3c-78a3-b01f-7072f519e2f9'::uuid)
      AND NOT EXISTS(SELECT 1 FROM authz.scope_target s WHERE s.tenant_id=t
        AND s.scope_kind='company_code' AND s.target_id=c.id);
  CREATE TEMP TABLE approved_scopes ON COMMIT DROP AS
    SELECT s.id FROM authz.scope_target s JOIN master.company_code c
      ON c.tenant_id=s.tenant_id AND c.id=s.target_id
    WHERE s.tenant_id=t AND s.scope_kind='company_code' AND s.status='active' AND c.status='active';
  IF (SELECT count(*) FROM approved_permissions)<>23
    OR (SELECT count(*) FROM approved_scopes)<>19
    OR (SELECT count(*) FROM master.company_code WHERE tenant_id=t AND status='active')<>19
    THEN RAISE EXCEPTION 'Reviewed permission/company catalog changed'; END IF;
  INSERT INTO authz.role(tenant_id,code,name,description,role_kind,source_type,source_ref,metadata,status,created_by)
    VALUES(t,grant_code,'Athyper DEV company access','All catalog-compatible company permissions; no tenant bypass.',
      'custom','manual',ref,jsonb_build_object('approval','grant all authorization for athyper.admin and athyper.owner for all company'),
      'draft',actor) RETURNING id INTO role_id;
  INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by)
    SELECT t,role_id,id,actor FROM approved_permissions;
  UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=role_id;
  INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
    VALUES(t,grant_code,'Athyper DEV admin and owner company access','custom','manual',ref,'active',actor)
    RETURNING id INTO group_id;
  INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
    SELECT t,group_id,p.id,'manual',ref,'active',actor FROM master.principal p
    WHERE p.tenant_id=t AND p.code IN ('athyper.admin','athyper.owner');
  INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by)
    SELECT t,group_id,role_id,id,'exact','manual',ref,'active',actor FROM approved_scopes;
END $grant$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT jsonb_build_object('tenant','athyper','plane','neon','permissions',23,'activeCompanies',19,
  'accounts',jsonb_build_array('athyper.admin','athyper.owner'),'propagation','exact',
  'sourceRef','user-approved-athyper-company-access-20260923','applied',${mode === '--apply'});
${mode === '--apply' ? 'COMMIT' : 'ROLLBACK'};
`;
// Deliberately pinned to the existing local DEV container; no environment-selected target.
const output = execFileSync('docker', ['exec', '-i', 'athyper-dev-db-1', 'psql', '-X',
  '-U', 'postgres', '-d', 'athyper_neon', '-At', '-v', 'ON_ERROR_STOP=1'],
  { input: statement, encoding: 'utf8' });
console.log(output.trim());
