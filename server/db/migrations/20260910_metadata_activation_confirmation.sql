BEGIN;
SET LOCAL lock_timeout='5s';
-- The API may confirm an acknowledged native publication, never emit arbitrary events.
CREATE OR REPLACE FUNCTION publication.fn_confirm_metadata_activation(p_release_id uuid,p_plane text,p_event_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,publication,metadata,shared AS $$
DECLARE v_release record; v_actor uuid:=NULLIF(current_setting('app.current_principal_id',true),'')::uuid;
BEGIN
 SELECT r.tenant_id,e.entity_code,pr.release_no INTO v_release
 FROM metadata.entity_release r JOIN metadata.entity e ON e.id=r.entity_id
 JOIN metadata.entity_change_set cs ON cs.id=r.change_set_id AND cs.tenant_id=r.tenant_id
 JOIN publication.release pr ON pr.id=r.id AND pr.tenant_id=r.tenant_id
 WHERE r.id=p_release_id AND r.tenant_id=shared.current_tenant_id() AND v_actor IS NOT NULL
 AND p_plane=ANY(r.target_planes) AND cs.status='published'
 AND cs.approved_by IS NOT NULL AND cs.approved_by<>cs.created_by AND cs.approved_by IS DISTINCT FROM cs.submitted_by
 AND EXISTS(SELECT 1 FROM publication.artifact a JOIN publication.deployment d ON d.artifact_id=a.id
   WHERE a.publication_release_id=pr.id AND a.status='signed' AND d.target_plane::text=p_plane AND d.status='activated');
 IF NOT FOUND THEN RAISE EXCEPTION 'METADATA_ACTIVATION_ACKNOWLEDGEMENT_REQUIRED' USING ERRCODE='insufficient_privilege'; END IF;
 RETURN publication.fn_emit_outbox(v_release.tenant_id,'metadata.generation.advanced',p_event_id::text,'metadata.entity_release',p_release_id,v_actor,NULL,
   jsonb_build_object('eventId',p_event_id,'planeKey',p_plane,'tenantId',v_release.tenant_id,'entityCode',v_release.entity_code,'generation',v_release.release_no,'releaseId',p_release_id));
END; $$;
REVOKE ALL ON FUNCTION publication.fn_confirm_metadata_activation(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_confirm_metadata_activation(uuid,text,uuid) TO athyperapp;
COMMIT;
