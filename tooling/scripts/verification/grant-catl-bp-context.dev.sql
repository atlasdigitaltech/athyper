-- DEV NEON only. Default rehearsal; psql -v apply=true commits.
-- User-authorized resolution of the CATL maker/company-scope acceptance blocker.
\if :{?apply}
\else
\set apply false
\endif
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $grant$
DECLARE
 t constant uuid := '44444444-4444-4444-8444-444444444444';
 ref constant text := 'bp2-catl-context-20260923';
 maker constant uuid := 'cca94907-7519-5871-8e3c-6b11aa545c93';
 actor uuid; r uuid; g uuid; p uuid; scope record;
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Neon required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(ref,0));
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=t AND code='seed.three-plane-provisioner' AND status='active';
 IF NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=t AND id=maker AND code='catl.admin' AND status='active') THEN RAISE EXCEPTION 'Maker changed'; END IF;
 SELECT id INTO STRICT p FROM authz.permission WHERE canonical_code='neon.context.catalog.read' AND status='published';
 IF EXISTS(SELECT 1 FROM authz.role WHERE tenant_id=t AND code='dev.bp2.catl.context') THEN RAISE EXCEPTION 'Grant already exists; inspect before rerun'; END IF;
 INSERT INTO authz.role(tenant_id,code,name,role_kind,source_type,source_ref,status,created_by)
 VALUES(t,'dev.bp2.catl.context','CATL BP maker context catalog','custom','manual',ref,'draft',actor) RETURNING id INTO r;
 INSERT INTO authz.role_permission(tenant_id,role_id,permission_id,created_by) VALUES(t,r,p,actor);
 UPDATE authz.role SET status='active',status_changed_at=now(),status_changed_by=actor WHERE id=r;
 INSERT INTO authz.principal_group(tenant_id,code,name,group_kind,source_type,source_ref,status,created_by)
 VALUES(t,'dev.bp2.catl.context','CATL BP maker context','custom','manual',ref,'active',actor) RETURNING id INTO g;
 INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,effective_until,created_by)
 VALUES(t,g,maker,'manual',ref,'active',now()+interval '24 hours',actor);
 FOR scope IN SELECT * FROM (VALUES
   ('company_code','793b6cb3-3c61-57c0-9562-2cbc288bd4cf'::uuid,'exact'),
   ('operating_organization','a478f9c0-8226-5d22-9599-b8fb27a45180'::uuid,'subtree')
 ) v(kind,target,propagation) LOOP
   INSERT INTO authz.group_role(tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,effective_until,created_by)
   SELECT t,g,r,s.id,scope.propagation::authz.propagation_mode_d,'manual',ref,'active',now()+interval '24 hours',actor
   FROM authz.scope_target s WHERE s.tenant_id=t AND s.scope_kind=scope.kind AND s.target_id=scope.target AND s.status='active';
   IF NOT FOUND THEN RAISE EXCEPTION 'Expected scope absent'; END IF;
 END LOOP;
END $grant$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT source_ref,count(*) AS assignments FROM authz.group_role WHERE source_ref='bp2-catl-context-20260923' GROUP BY source_ref;
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
