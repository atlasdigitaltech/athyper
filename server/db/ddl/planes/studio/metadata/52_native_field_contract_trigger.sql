-- Retire only legacy JSON validation for explicitly native roots. Native typed
-- row/core/snapshot guards remain mandatory; pending cutover checks remain.
DO $$
DECLARE body text; anchor text := 'BEGIN' || chr(10) || '    v_allowed := CASE NEW.data_type::text'; prefix text;
BEGIN
 body := pg_get_functiondef('metadata.trg_validate_entity_field_contract()'::regprocedure);
 IF md5(body)<>'2fe598492d889b6665bbadc40e9f59c2' THEN
  RAISE EXCEPTION 'NATIVE_FIELD_CONTRACT_PREDECESSOR_CHANGED';
 END IF;
 IF to_regprocedure('metadata.fn_assert_native_typed_rows(uuid,integer)') IS NULL
 OR to_regprocedure('metadata.fn_assert_native_authoring_snapshot(uuid,text,integer)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='metadata.entity_field'::regclass
   AND tgname='native_snapshot_final_guard' AND tgenabled IN ('O','A') AND tgdeferrable AND tginitdeferred
   AND tgfoid='metadata.native_snapshot_final_guard()'::regprocedure)
 THEN RAISE EXCEPTION 'NATIVE_FIELD_TYPED_GUARDS_REQUIRED'; END IF;
 IF (length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN
  RAISE EXCEPTION 'NATIVE_FIELD_CONTRACT_ANCHOR_CHANGED';
 END IF;
 prefix := $prefix$BEGIN
    IF EXISTS(SELECT 1 FROM metadata.entity_change_set c
      WHERE c.id=NEW.change_set_id AND c.entity_id=NEW.entity_id
      AND c.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
      AND c.native_core_layout_version IN (1,2)) THEN
        IF num_nonnulls(NEW.field_key,NEW.type_config,NEW.default_spec,NEW.computation_spec,NEW.validation_spec)>0 THEN
            RAISE EXCEPTION 'NATIVE_FIELD_LEGACY_PAYLOAD_FORBIDDEN' USING ERRCODE='23514';
        END IF;
        -- Final typed validation is deferred until the graph is complete, never
        -- replaced with an empty legacy JSON object or omitted altogether.
        RETURN NEW;
    END IF;
    v_allowed := CASE NEW.data_type::text$prefix$;
 EXECUTE replace(body,anchor,prefix);
END $$;
