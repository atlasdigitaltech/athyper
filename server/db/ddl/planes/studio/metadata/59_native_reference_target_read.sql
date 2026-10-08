-- A fresh graph may reference a product root before its relation rows exist.
-- Expose only exact coordinate existence to an admitted command; no record data,
-- tenant roots, target mutation or general metadata SELECT is granted.
CREATE FUNCTION entity_command_private.native_reference_target_exists(
 p_draft uuid,p_target uuid,p_code text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_draft IS NULL OR p_target IS NULL OR p_code IS NULL OR length(p_code)>200
 OR entity_command_private.admitted(p_draft) IS NOT TRUE
 THEN RAISE EXCEPTION 'NATIVE_REFERENCE_TARGET_ADMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN EXISTS(SELECT 1 FROM metadata.entity
 WHERE id=p_target AND entity_code=p_code AND tenant_id IS NULL AND ownership_model='system');
END $$;
REVOKE ALL ON FUNCTION entity_command_private.native_reference_target_exists(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.native_reference_target_exists(uuid,uuid,text) TO athyper_product_command_app;
