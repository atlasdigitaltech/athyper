-- Finish native aggregate validation while exact publication authority is in
-- scope. Deferred invoker guards cannot browse NULL-tenant product graphs after
-- returning to the application role. No guard is disabled or replaced.
CREATE FUNCTION publication.finish_native_publication_validation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r metadata.entity_release; c metadata.entity_change_set; authority jsonb;
BEGIN
 SELECT * INTO STRICT r FROM metadata.entity_release WHERE id=NEW.entity_release_id;
 SELECT * INTO STRICT c FROM metadata.entity_change_set WHERE id=r.change_set_id;
 IF c.native_core_layout_version IS NULL OR c.tenant_id IS NOT NULL THEN RETURN NEW; END IF;
 authority:=publication.fn_system_entity_authority(c.id,'prepare');
 IF (authority->>'humanReview')::boolean IS DISTINCT FROM true
 OR c.source_kind IS DISTINCT FROM 'product' OR c.status::text IS DISTINCT FROM 'published'
 OR r.published_by IS DISTINCT FROM master.current_principal_id_soft()
 OR NEW.publication_release_id IS DISTINCT FROM r.id
 OR NOT EXISTS(SELECT 1 FROM publication.release p WHERE p.id=r.id
   AND p.tenant_id=shared.current_tenant_id_soft() AND p.created_by=r.published_by
   AND p.metadata->'humanExecutionPolicy'=authority->'executionPolicy')
 THEN RAISE EXCEPTION 'NATIVE_PUBLICATION_VALIDATION_DENIED' USING ERRCODE='42501'; END IF;
 SET CONSTRAINTS metadata.native_layout_final_guard,metadata.native_core_final_guard,metadata.native_root_final_guard,metadata.native_snapshot_final_guard,metadata.settings_locale_check IMMEDIATE;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION publication.finish_native_publication_validation() FROM PUBLIC;
CREATE TRIGGER entity_release_link_native_validation
 AFTER INSERT ON publication.entity_release_link FOR EACH ROW
 EXECUTE FUNCTION publication.finish_native_publication_validation();
