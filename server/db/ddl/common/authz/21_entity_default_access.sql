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
