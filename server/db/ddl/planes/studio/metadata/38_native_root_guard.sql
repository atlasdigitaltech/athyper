-- Root integrity is not host publication, product-write authority or signature
-- evidence. Caller pins must still come from independently admitted policy.
CREATE OR REPLACE FUNCTION metadata.fn_assert_native_root(draft uuid, expected_hash text, expected_version integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
DECLARE root metadata.entity_change_set%ROWTYPE;
BEGIN
 SELECT * INTO STRICT root FROM metadata.entity_change_set WHERE id=draft FOR UPDATE;
 IF expected_version IS NULL OR expected_version NOT IN (1,2)
   OR root.native_core_layout_version IS DISTINCT FROM expected_version
   OR expected_hash IS NULL OR expected_hash !~ '^[0-9a-f]{64}$'
   OR root.authoring_schema_hash IS DISTINCT FROM expected_hash
 THEN RAISE EXCEPTION 'NATIVE_ROOT_PIN_INVALID' USING ERRCODE='23514'; END IF;
 IF ((root.source_kind='product' AND root.tenant_id IS NULL)
   OR (root.source_kind='tenant_entity' AND root.tenant_id IS NOT NULL)) IS NOT TRUE
 THEN RAISE EXCEPTION 'NATIVE_ROOT_SOURCE_UNSUPPORTED' USING ERRCODE='23514'; END IF;
 IF root.reference_contract_version IS DISTINCT FROM 1 OR root.default_locale IS NULL OR btrim(root.default_locale)=''
   OR root.required_locales IS NULL OR cardinality(root.required_locales)=0
   OR array_ndims(root.required_locales) IS DISTINCT FROM 1 OR array_lower(root.required_locales,1) IS DISTINCT FROM 1
   OR array_position(root.required_locales,NULL) IS NOT NULL OR NOT(root.default_locale=ANY(root.required_locales))
   OR cardinality(root.required_locales)<>(SELECT count(DISTINCT locale) FROM unnest(root.required_locales) locale)
 THEN RAISE EXCEPTION 'NATIVE_ROOT_DEPENDENCIES_INVALID' USING ERRCODE='23514'; END IF;
 IF (expected_version=2 AND root.entity_label_id IS NULL) OR (root.entity_label_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM metadata.entity_label l WHERE l.id=root.entity_label_id AND l.change_set_id=root.id
     AND l.entity_id=root.entity_id AND l.tenant_id IS NOT DISTINCT FROM root.tenant_id AND l.source_kind='owned'))
 THEN RAISE EXCEPTION 'NATIVE_ROOT_LABEL_INVALID' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION metadata.native_root_transition_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.native_core_layout_version IS NOT NULL THEN RAISE EXCEPTION 'NATIVE_ROOT_EXPLICIT_CONVERSION_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSIF OLD.native_core_layout_version IS NOT NULL AND (
   NEW.native_core_layout_version IS DISTINCT FROM OLD.native_core_layout_version
   OR NEW.authoring_schema_hash IS DISTINCT FROM OLD.authoring_schema_hash
   OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
   OR NEW.reference_contract_version IS DISTINCT FROM OLD.reference_contract_version)
 THEN RAISE EXCEPTION 'NATIVE_ROOT_REPIN_REQUIRES_VERSIONED_MIGRATION' USING ERRCODE='23514'; END IF;
 -- Initial conversion still passes the existing root revision/provenance and
 -- authoring guards. No session flag authorizes it and no pending check drops.
 RETURN NEW;
END $$;
CREATE TRIGGER native_root_transition_guard BEFORE INSERT OR UPDATE ON metadata.entity_change_set
FOR EACH ROW EXECUTE FUNCTION metadata.native_root_transition_guard();

CREATE OR REPLACE FUNCTION metadata.native_root_final_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,metadata AS $$
DECLARE draft uuid; root metadata.entity_change_set%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='entity_change_set' THEN draft:=COALESCE(NEW.id,OLD.id);
 ELSE draft:=COALESCE(NEW.change_set_id,OLD.change_set_id); END IF;
 SELECT * INTO STRICT root FROM metadata.entity_change_set WHERE id=draft FOR UPDATE;
 IF root.native_core_layout_version IS NOT NULL THEN
   PERFORM metadata.fn_assert_native_root(draft,root.authoring_schema_hash,root.native_core_layout_version);
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER native_root_final_guard AFTER INSERT OR UPDATE ON metadata.entity_change_set
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.native_root_final_guard();
CREATE CONSTRAINT TRIGGER native_root_final_guard AFTER INSERT OR UPDATE OR DELETE ON metadata.entity_label
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.native_root_final_guard();
