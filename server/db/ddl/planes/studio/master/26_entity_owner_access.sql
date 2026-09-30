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
