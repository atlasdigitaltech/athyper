-- Creation admission is independent of publication review. No ticket, entity,
-- draft or initializer evidence is seeded by this migration.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='metadata.entity_change_set'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_product_command_app' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole)
 OR pg_has_role('athyper_product_command_app','athyper_product_command_owner','MEMBER')
 OR pg_has_role('athyper_product_command_app','athyper_product_command_issuer','MEMBER') THEN
  RAISE EXCEPTION 'PRODUCT_CREATION_ROLE_OR_RLS_UNSAFE';
 END IF;
END $$;
ALTER TABLE entity_command_private.admission ADD COLUMN creation_entity_id uuid REFERENCES metadata.entity(id);
GRANT INSERT(creation_entity_id) ON entity_command_private.admission TO athyper_product_command_issuer;
CREATE FUNCTION entity_command_private.admitted_creation(p_target uuid,p_entity uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT entity_command_private.admitted(p_target) OR NOT EXISTS(
  SELECT 1 FROM entity_command_private.admission WHERE change_set_id=p_target AND creation_entity_id=p_entity
  AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid()
  AND login_role=session_user AND NOT revoked AND expires_at>clock_timestamp()
  AND actor_id::text=current_setting('app.current_principal_id',true)
  AND authority_tenant_id::text=current_setting('app.current_tenant_id',true)) THEN RETURN false; END IF;
 -- Recheck and lock the platform-owned entity through command commit; a current
 -- authenticated issuer decision is still mandatory and supplies the exact key.
 PERFORM 1 FROM metadata.entity WHERE id=p_entity AND tenant_id IS NULL AND ownership_model='system' FOR SHARE;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION entity_command_private.admitted_creation(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.admitted_creation(uuid,uuid) TO athyper_product_command_app;
GRANT INSERT(id,tenant_id,entity_id,change_set_code,branch_code,title,created_by,base_release_id)
 ON metadata.entity_change_set TO athyper_product_command_app;
CREATE POLICY product_creation_insert ON metadata.entity_change_set FOR INSERT TO athyper_product_command_app
 WITH CHECK(tenant_id IS NULL AND status='draft' AND lock_version=0
 AND source_kind IS NULL AND native_core_layout_version IS NULL
 AND created_by=master.current_principal_id_soft() AND entity_command_private.admitted_creation(id,entity_id));
CREATE POLICY product_creation_insert_fence ON metadata.entity_change_set AS RESTRICTIVE FOR INSERT TO athyper_product_command_app
 WITH CHECK(tenant_id IS NULL AND status='draft' AND lock_version=0
 AND source_kind IS NULL AND native_core_layout_version IS NULL
 AND created_by=master.current_principal_id_soft() AND entity_command_private.admitted_creation(id,entity_id));
-- Native writes, operation initialization, publication and review grants are
-- intentionally separate. Creation tickets cannot insert pinned roots directly.
