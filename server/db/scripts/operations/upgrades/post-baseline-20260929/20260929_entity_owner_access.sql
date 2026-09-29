-- Apply independently to Studio, Neon and Mesh using the normal migration workflow.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('athyper_studio','athyper_neon','athyper_mesh') THEN RAISE EXCEPTION 'Known plane database required'; END IF;
 PERFORM set_config('app.database_plane',substr(current_database(),9),true);
END $$;
ALTER TABLE master.principal_profile ADD COLUMN record_version bigint NOT NULL DEFAULT 1 CHECK (record_version>0);
ALTER TABLE master.principal_notification_preference ADD COLUMN record_version bigint NOT NULL DEFAULT 1 CHECK (record_version>0);
-- Shared Entity Framework support for owner-scoped records. Service operation
-- authorization precedes the transaction-local admin marker; tenant scope remains mandatory.
CREATE OR REPLACE FUNCTION shared.fn_entity_owner_admin_access(p_schema text,p_object text,p_tenant uuid,p_write boolean)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT p_tenant=shared.current_tenant_id_soft()
   AND COALESCE(NULLIF(current_setting('app.entity_owner_access',true),'')::jsonb->>'admin','false')='true'
   AND NULLIF(current_setting('app.entity_owner_access',true),'')::jsonb->>'schema'=p_schema
   AND NULLIF(current_setting('app.entity_owner_access',true),'')::jsonb->>'object'=p_object
   AND NULLIF(current_setting('app.entity_owner_access',true),'')::jsonb->>'tenantId'=p_tenant::text
   AND NULLIF(current_setting('app.entity_owner_access',true),'')::jsonb->>'actorId'=master.current_principal_id_soft()::text
   AND (NOT p_write OR NULLIF(current_setting('app.entity_owner_access',true),'')::jsonb->>'operation' IN ('create','patch'))
$$;

CREATE OR REPLACE FUNCTION shared.trg_record_optimistic_version()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.record_version IS DISTINCT FROM OLD.record_version AND NEW.record_version<>OLD.record_version+1 THEN
  RAISE EXCEPTION 'Record version must increment by one' USING ERRCODE='check_violation';
 END IF;
 NEW.record_version:=OLD.record_version+1;
 RETURN NEW;
END $$;

CREATE POLICY entity_owner_admin_read ON master.principal FOR SELECT TO athyperapp
 USING (shared.fn_entity_owner_admin_access('master','principal',tenant_id,false));

CREATE POLICY entity_owner_admin_read ON master.principal_profile FOR SELECT TO athyperapp
 USING (shared.fn_entity_owner_admin_access('master','principal_profile',tenant_id,false));
CREATE POLICY entity_owner_admin_insert ON master.principal_profile FOR INSERT TO athyperapp
 WITH CHECK (shared.fn_entity_owner_admin_access('master','principal_profile',tenant_id,true));
CREATE POLICY entity_owner_admin_update ON master.principal_profile FOR UPDATE TO athyperapp
 USING (shared.fn_entity_owner_admin_access('master','principal_profile',tenant_id,true))
 WITH CHECK (shared.fn_entity_owner_admin_access('master','principal_profile',tenant_id,true));
CREATE TRIGGER trg_entity_record_version BEFORE UPDATE ON master.principal_profile
 FOR EACH ROW EXECUTE FUNCTION shared.trg_record_optimistic_version();

CREATE POLICY entity_owner_admin_read ON master.principal_notification_preference FOR SELECT TO athyperapp
 USING (shared.fn_entity_owner_admin_access('master','principal_notification_preference',tenant_id,false));
CREATE POLICY entity_owner_admin_insert ON master.principal_notification_preference FOR INSERT TO athyperapp
 WITH CHECK (shared.fn_entity_owner_admin_access('master','principal_notification_preference',tenant_id,true));
CREATE POLICY entity_owner_admin_update ON master.principal_notification_preference FOR UPDATE TO athyperapp
 USING (shared.fn_entity_owner_admin_access('master','principal_notification_preference',tenant_id,true))
 WITH CHECK (shared.fn_entity_owner_admin_access('master','principal_notification_preference',tenant_id,true));
CREATE TRIGGER trg_entity_record_version BEFORE UPDATE ON master.principal_notification_preference
 FOR EACH ROW EXECUTE FUNCTION shared.trg_record_optimistic_version();


-- Exact capability catalog; no role grants, entity write permissions or activation.
-- UUIDv5: namespace UUIDv5(DNS, athyper.authorization.catalog.v2), name = code.
-- Self-edit permissions do not grant cross-owner access; administer is separate.
-- Runtime parent, tenant, plane and field admission remain mandatory.
DO $$
DECLARE
  permission record;
  v_module_id uuid;
BEGIN
  IF COALESCE(current_setting('app.database_plane',true),'') NOT IN ('studio','neon','mesh') THEN
    RAISE EXCEPTION 'Common identity catalog requires an exact local plane';
  END IF;
  SELECT id INTO STRICT v_module_id FROM control.module WHERE code='fnd' AND status='active';
  FOR permission IN SELECT * FROM (VALUES
    ('97e9de3d-36e7-5917-bc9b-614bdc681c49'::uuid,'common.identity.principal.read','low'),
    ('52ba2285-9bed-5ad6-a9bb-05e5798f9f06'::uuid,'common.identity.principal_profile.read','low'),
    ('76df2a11-bfef-54cb-8ee0-8a50853d1e8c'::uuid,'common.identity.principal_profile.edit','medium'),
    ('32e58242-82cb-5dee-8aa8-3758b66bb8d6'::uuid,'common.identity.principal_notification_preference.read','low'),
    ('9d6eb3ab-e6f0-5008-ad01-9a146eda365f'::uuid,'common.identity.principal_notification_preference.edit','medium'),
    ('cea6db1a-4c78-5a69-8340-b9e065b0da17'::uuid,'common.identity.principal.administer','high')
  ) AS expected(id,code,risk)
  LOOP
    INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,
      requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
    VALUES(permission.id,permission.code,'capability',v_module_id,permission.risk::authz.risk_tier_d,
      false,false,false,false,false,
      '{"namespace":"common","capability":"tenant_local_identity","_seed":{"pack":"common.identity-permissions","version":"1.0.0"}}'::jsonb,
      'published','00000000-0000-0000-0000-000000000000')
    ON CONFLICT(canonical_code) DO NOTHING;
    INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
    VALUES(permission.id,'tenant','exact','active','00000000-0000-0000-0000-000000000000')
    ON CONFLICT(permission_id,scope_kind,propagation_mode) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM authz.permission p
      WHERE p.id=permission.id AND p.canonical_code=permission.code AND p.module_id=v_module_id
        AND p.permission_kind='capability' AND p.status='published' AND p.risk_tier::text=permission.risk
        AND NOT p.requires_mfa AND NOT p.requires_sod AND NOT p.is_shareable
        AND NOT p.is_delegable AND NOT p.is_overridable)
      OR (SELECT count(*) FROM authz.permission_scope_kind s WHERE s.permission_id=permission.id AND s.status='active')<>1
      OR NOT EXISTS (SELECT 1 FROM authz.permission_scope_kind s WHERE s.permission_id=permission.id
        AND s.scope_kind='tenant' AND s.propagation_mode='exact' AND s.status='active') THEN
      RAISE EXCEPTION 'Common identity catalog conflict: %',permission.code;
    END IF;
  END LOOP;
END $$;

-- Shared Entity Framework: enroll explicitly configured default groups when a
-- human receives plane membership. This does not bypass IAM or create admin grants.
CREATE OR REPLACE FUNCTION authz.trg_entity_default_membership()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE g record;
BEGIN
 IF NEW.status<>'active' OR NOT EXISTS(SELECT 1 FROM master.principal p
   WHERE p.id=NEW.principal_id AND p.tenant_id=NEW.tenant_id AND p.principal_type='user' AND p.status='active') THEN RETURN NEW; END IF;
 FOR g IN SELECT id FROM authz.principal_group WHERE tenant_id=NEW.tenant_id AND status='active'
   AND group_kind='system' AND source_type='seed' AND metadata->>'entityFrameworkDefaultAccess'='true'
 LOOP
   -- Preserve explicit membership revocations; a login/provisioning retry must
   -- not reactivate a grant an administrator removed.
   IF NOT EXISTS(SELECT 1 FROM authz.group_member WHERE tenant_id=NEW.tenant_id AND group_id=g.id AND principal_id=NEW.principal_id) THEN
     INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,status,created_by)
       VALUES(NEW.tenant_id,g.id,NEW.principal_id,'seed','entity-framework:default-access:v1','active',NEW.created_by);
   END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION authz.trg_entity_default_membership() FROM PUBLIC;
CREATE TRIGGER trg_entity_default_membership AFTER INSERT OR UPDATE OF status ON authz.plane_membership
 FOR EACH ROW EXECUTE FUNCTION authz.trg_entity_default_membership();

COMMIT;
