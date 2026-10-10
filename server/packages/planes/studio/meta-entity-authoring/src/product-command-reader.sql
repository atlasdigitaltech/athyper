-- Uninstalled companion to product-command-authority.sql. Closed canonical
-- legacy-reader inventory, not all tables in a schema. Installation is atomic
-- with the admission candidate; ledger replay belongs to migration tooling.
-- Require pre-existing forced RLS; never silently alter another role's policy.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'entity',
  'entity_capability',
  'entity_class_profile',
  'entity_runtime_profile',
  'entity_field',
  'entity_key',
  'entity_key_field',
  'entity_search_profile',
  'entity_search_field',
  'entity_relation',
  'entity_relation_target',
  'entity_relation_field',
  'entity_surface',
  'entity_surface_section',
  'entity_surface_field_binding',
  'entity_operation',
  'entity_operation_permission',
  'entity_surface_operation',
  'entity_operation_rule',
  'entity_policy_binding',
  'entity_field_policy_binding',
  'entity_operation_scope_binding',
  'entity_operation_context_requirement',
  'entity_field_reference_binding'
 ] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='metadata' AND c.relname=t AND c.relrowsecurity AND c.relforcerowsecurity) THEN
   RAISE EXCEPTION 'PRODUCT_COMMAND_READER_FORCED_RLS_REQUIRED: %', t;
  END IF;
 END LOOP;
END $$;

-- A restrictive fence also applies when an existing PUBLIC policy permits reads.
-- The permissive policy supplies admission; the fence prevents inherited policies
-- from turning an admitted command into an unrestricted graph browser.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'entity_capability',
  'entity_runtime_profile',
  'entity_field',
  'entity_key',
  'entity_key_field',
  'entity_search_profile',
  'entity_search_field',
  'entity_relation',
  'entity_relation_target',
  'entity_relation_field',
  'entity_surface',
  'entity_surface_section',
  'entity_surface_field_binding',
  'entity_operation',
  'entity_operation_permission',
  'entity_surface_operation',
  'entity_operation_rule',
  'entity_policy_binding',
  'entity_field_policy_binding',
  'entity_operation_scope_binding',
  'entity_operation_context_requirement',
  'entity_field_reference_binding'
 ] LOOP
  EXECUTE format('GRANT SELECT ON metadata.%I TO athyper_product_command_app',t);
  EXECUTE format('CREATE POLICY product_command_graph_read ON metadata.%I FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id))',t);
  EXECUTE format('CREATE POLICY product_command_graph_fence ON metadata.%I AS RESTRICTIVE FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id))',t);
 END LOOP;
END $$;

GRANT SELECT ON metadata.entity, metadata.entity_class_profile TO athyper_product_command_app;
CREATE POLICY product_command_entity_read ON metadata.entity FOR SELECT TO athyper_product_command_app
 USING(tenant_id IS NULL AND (
  EXISTS(SELECT 1 FROM metadata.entity_change_set c WHERE c.entity_id=entity.id AND entity_command_private.admitted(c.id))
  OR EXISTS(SELECT 1 FROM metadata.entity_relation_target r WHERE r.target_entity_id=entity.id AND entity_command_private.admitted(r.change_set_id))));
CREATE POLICY product_command_entity_fence ON metadata.entity AS RESTRICTIVE FOR SELECT TO athyper_product_command_app
 USING(tenant_id IS NULL AND (
  EXISTS(SELECT 1 FROM metadata.entity_change_set c WHERE c.entity_id=entity.id AND entity_command_private.admitted(c.id))
  OR EXISTS(SELECT 1 FROM metadata.entity_relation_target r WHERE r.target_entity_id=entity.id AND entity_command_private.admitted(r.change_set_id))));
CREATE POLICY product_command_class_read ON metadata.entity_class_profile FOR SELECT TO athyper_product_command_app
 USING(EXISTS(SELECT 1 FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id
 WHERE e.entity_class=entity_class_profile.entity_class AND entity_command_private.admitted(c.id)));
CREATE POLICY product_command_class_fence ON metadata.entity_class_profile AS RESTRICTIVE FOR SELECT TO athyper_product_command_app
 USING(EXISTS(SELECT 1 FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id
 WHERE e.entity_class=entity_class_profile.entity_class AND entity_command_private.admitted(c.id)));
CREATE POLICY product_command_root_fence ON metadata.entity_change_set AS RESTRICTIVE FOR SELECT TO athyper_product_command_app
 USING(tenant_id IS NULL AND entity_command_private.admitted(id));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['entity_label','entity_label_translation','entity_authoring_command_receipt'] LOOP
  EXECUTE format('CREATE POLICY product_command_root_fence ON metadata.%I AS RESTRICTIVE FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id))',t);
 END LOOP;
END $$;
CREATE POLICY product_command_history_fence ON snapshot.entity_draft_save AS RESTRICTIVE FOR SELECT TO athyper_product_command_app
 USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id));

-- Existing permissive policies must not widen the candidate's mutation surface.
CREATE POLICY product_command_write_fence ON metadata.entity_change_set AS RESTRICTIVE FOR UPDATE TO athyper_product_command_app
 USING(tenant_id IS NULL AND entity_command_private.admitted(id) AND status IN ('draft','rejected'))
 WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(id) AND status IN ('draft','rejected') AND updated_by=master.current_principal_id_soft());
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['entity_label','entity_label_translation'] LOOP
  EXECUTE format('CREATE POLICY product_command_insert_fence ON metadata.%I AS RESTRICTIVE FOR INSERT TO athyper_product_command_app WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(change_set_id) AND created_by=master.current_principal_id_soft())',t);
  EXECUTE format('CREATE POLICY product_command_update_fence ON metadata.%I AS RESTRICTIVE FOR UPDATE TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id)) WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(change_set_id) AND updated_by=master.current_principal_id_soft())',t);
  EXECUTE format('CREATE POLICY product_command_delete_fence ON metadata.%I AS RESTRICTIVE FOR DELETE TO athyper_product_command_app USING(tenant_id IS NULL AND entity_command_private.admitted(change_set_id))',t);
 END LOOP;
END $$;
CREATE POLICY product_command_insert_fence ON metadata.entity_authoring_command_receipt AS RESTRICTIVE FOR INSERT TO athyper_product_command_app
 WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(change_set_id) AND actor_id=master.current_principal_id_soft());
CREATE POLICY product_command_insert_fence ON snapshot.entity_draft_save AS RESTRICTIVE FOR INSERT TO athyper_product_command_app
 WITH CHECK(tenant_id IS NULL AND entity_command_private.admitted(change_set_id) AND captured_by=master.current_principal_id_soft());
