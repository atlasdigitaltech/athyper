-- Fresh-root scope validation reads the Entity before any draft row exists.
-- Preserve existing admitted-draft/relation reads; add only exact creation scope.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='metadata.entity'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='metadata.entity'::regclass AND polname='product_command_entity_read' AND polpermissive)
 OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='metadata.entity'::regclass AND polname='product_command_entity_fence' AND NOT polpermissive)
 THEN RAISE EXCEPTION 'PRODUCT_CREATION_ENTITY_READ_PREREQUISITE'; END IF;
END $$;
CREATE FUNCTION entity_command_private.admitted_creation_entity(p_entity uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM entity_command_private.admission
  WHERE creation_entity_id=p_entity AND transaction_id=pg_current_xact_id()
  AND backend_pid=pg_backend_pid() AND login_role=session_user AND NOT revoked
  AND expires_at>clock_timestamp()
  AND actor_id::text=current_setting('app.current_principal_id',true)
  AND authority_tenant_id::text=current_setting('app.current_tenant_id',true))
$$;
REVOKE ALL ON FUNCTION entity_command_private.admitted_creation_entity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.admitted_creation_entity(uuid) TO athyper_product_command_app;
ALTER POLICY product_command_entity_read ON metadata.entity USING(tenant_id IS NULL AND (
 EXISTS(SELECT 1 FROM metadata.entity_change_set c WHERE c.entity_id=entity.id AND entity_command_private.admitted(c.id))
 OR EXISTS(SELECT 1 FROM metadata.entity_relation_target r WHERE r.target_entity_id=entity.id AND entity_command_private.admitted(r.change_set_id))
 OR (ownership_model='system' AND entity_command_private.admitted_creation_entity(id))));
ALTER POLICY product_command_entity_fence ON metadata.entity USING(tenant_id IS NULL AND (
 EXISTS(SELECT 1 FROM metadata.entity_change_set c WHERE c.entity_id=entity.id AND entity_command_private.admitted(c.id))
 OR EXISTS(SELECT 1 FROM metadata.entity_relation_target r WHERE r.target_entity_id=entity.id AND entity_command_private.admitted(r.change_set_id))
 OR (ownership_model='system' AND entity_command_private.admitted_creation_entity(id))));

-- Whole-graph readers/guards must verify these branches are empty. This grants
-- scoped reads only; phase-one bootstrap still cannot INSERT any AI member.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='metadata.entity_ai_profile'::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'NATIVE_BOOTSTRAP_RLS_REQUIRED: entity_ai_profile'; END IF; END $$;
GRANT SELECT ON metadata.entity_ai_profile TO athyper_product_command_app;
CREATE POLICY native_bootstrap_read ON metadata.entity_ai_profile FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
CREATE POLICY native_bootstrap_read_fence ON metadata.entity_ai_profile AS RESTRICTIVE FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='metadata.entity_ai_field'::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'NATIVE_BOOTSTRAP_RLS_REQUIRED: entity_ai_field'; END IF; END $$;
GRANT SELECT ON metadata.entity_ai_field TO athyper_product_command_app;
CREATE POLICY native_bootstrap_read ON metadata.entity_ai_field FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
CREATE POLICY native_bootstrap_read_fence ON metadata.entity_ai_field AS RESTRICTIVE FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='metadata.entity_ai_binding'::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'NATIVE_BOOTSTRAP_RLS_REQUIRED: entity_ai_binding'; END IF; END $$;
GRANT SELECT ON metadata.entity_ai_binding TO athyper_product_command_app;
CREATE POLICY native_bootstrap_read ON metadata.entity_ai_binding FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
CREATE POLICY native_bootstrap_read_fence ON metadata.entity_ai_binding AS RESTRICTIVE FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='metadata.entity_ai_reference'::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'NATIVE_BOOTSTRAP_RLS_REQUIRED: entity_ai_reference'; END IF; END $$;
GRANT SELECT ON metadata.entity_ai_reference TO athyper_product_command_app;
CREATE POLICY native_bootstrap_read ON metadata.entity_ai_reference FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
CREATE POLICY native_bootstrap_read_fence ON metadata.entity_ai_reference AS RESTRICTIVE FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='metadata.entity_ai_term'::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'NATIVE_BOOTSTRAP_RLS_REQUIRED: entity_ai_term'; END IF; END $$;
GRANT SELECT ON metadata.entity_ai_term TO athyper_product_command_app;
CREATE POLICY native_bootstrap_read ON metadata.entity_ai_term FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
CREATE POLICY native_bootstrap_read_fence ON metadata.entity_ai_term AS RESTRICTIVE FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));
