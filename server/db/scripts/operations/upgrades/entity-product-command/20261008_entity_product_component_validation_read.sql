BEGIN;
SET LOCAL lock_timeout='5s';
-- Read only installed active product components actually referenced by the
-- transaction-admitted draft. This is validation access, not catalogue browsing
-- or publication/installation authority. Existing admission checks bind actor,
-- tenant, login, transaction, backend, expiry and revocation.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='metadata.ui_component_contract'::regclass
   AND relrowsecurity AND relforcerowsecurity)
 OR to_regprocedure('entity_command_private.admitted(uuid)') IS NULL
 THEN RAISE EXCEPTION 'COMPONENT_VALIDATION_READ_PREREQUISITE'; END IF;
END $$;
GRANT SELECT ON metadata.ui_component_contract TO athyper_product_command_app;
CREATE POLICY product_command_component_read ON metadata.ui_component_contract FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND status='active' AND (
 EXISTS(SELECT 1 FROM metadata.entity_surface s WHERE s.tenant_id IS NULL
   AND s.component_contract_id=ui_component_contract.id AND entity_command_private.admitted(s.change_set_id))
 OR EXISTS(SELECT 1 FROM metadata.entity_surface_section s WHERE s.tenant_id IS NULL
   AND s.component_contract_id=ui_component_contract.id AND entity_command_private.admitted(s.change_set_id))
 OR EXISTS(SELECT 1 FROM metadata.entity_surface_field_binding b WHERE b.tenant_id IS NULL
   AND ui_component_contract.id IN (b.component_display_id,b.component_input_id,b.component_filter_id,b.component_format_id)
   AND entity_command_private.admitted(b.change_set_id))));
CREATE POLICY product_command_component_fence ON metadata.ui_component_contract AS RESTRICTIVE FOR SELECT TO athyper_product_command_app USING(tenant_id IS NULL AND status='active' AND (
 EXISTS(SELECT 1 FROM metadata.entity_surface s WHERE s.tenant_id IS NULL
   AND s.component_contract_id=ui_component_contract.id AND entity_command_private.admitted(s.change_set_id))
 OR EXISTS(SELECT 1 FROM metadata.entity_surface_section s WHERE s.tenant_id IS NULL
   AND s.component_contract_id=ui_component_contract.id AND entity_command_private.admitted(s.change_set_id))
 OR EXISTS(SELECT 1 FROM metadata.entity_surface_field_binding b WHERE b.tenant_id IS NULL
   AND ui_component_contract.id IN (b.component_display_id,b.component_input_id,b.component_filter_id,b.component_format_id)
   AND entity_command_private.admitted(b.change_set_id))));
COMMIT;
