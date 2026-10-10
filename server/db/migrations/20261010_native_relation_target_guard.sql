BEGIN;
SET LOCAL lock_timeout='5s';
-- Validate a freshly inserted relation before RLS can see its NEW membership.
-- Keep normal tenant visibility, adding exact product-root checks for admitted commands.
CREATE FUNCTION entity_command_private.native_product_target_visible(p_draft uuid,p_target uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_draft IS NULL OR p_target IS NULL OR entity_command_private.admitted(p_draft) IS NOT TRUE
 THEN RAISE EXCEPTION 'NATIVE_REFERENCE_TARGET_ADMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN EXISTS(SELECT 1 FROM metadata.entity WHERE id=p_target AND tenant_id IS NULL AND ownership_model='system');
END $$;
REVOKE ALL ON FUNCTION entity_command_private.native_product_target_visible(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.native_product_target_visible(uuid,uuid) TO athyper_product_command_app;
DO $install$
DECLARE body text; old text; replacement text;
BEGIN
 body:=pg_get_functiondef('metadata.trg_validate_entity_graph_binding()'::regprocedure);
 old:=$old$            RAISE EXCEPTION 'Relation target Entity is not visible in the source Entity scope'
                USING ERRCODE = 'foreign_key_violation';$old$;
 replacement:=$new$            IF NOT (v_tenant_id IS NULL
              AND pg_has_role(session_user,'athyper_product_command_app','member')
              AND entity_command_private.native_product_target_visible(v_change_set_id,NEW.target_entity_id)) THEN
              RAISE EXCEPTION 'Relation target Entity is not visible in the source Entity scope'
                USING ERRCODE = 'foreign_key_violation';
            END IF;$new$;
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'NATIVE_RELATION_TARGET_PREDECESSOR_MISMATCH'; END IF;
 EXECUTE replace(body,old,replacement);
END $install$;
COMMIT;
