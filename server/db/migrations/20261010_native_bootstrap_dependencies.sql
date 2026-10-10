BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF to_regprocedure('entity_command_private.admitted(uuid)') IS NULL
 OR to_regprocedure('entity_command_private.read_reference_resource(uuid,text,text,text,text,integer)') IS NULL
 THEN RAISE EXCEPTION 'NATIVE_BOOTSTRAP_TRANSPORT_PREREQUISITES_REQUIRED'; END IF;
END $$;
-- A fresh graph may reference a product root before its relation rows exist.
-- Expose only exact coordinate existence to an admitted command; no record data,
-- tenant roots, target mutation or general metadata SELECT is granted.
CREATE OR REPLACE FUNCTION entity_command_private.native_reference_target_exists(
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

-- Readiness returns only availability for an exact configured descriptor pin.
-- Command-time readers still verify signatures, admission and current reviewers.
CREATE OR REPLACE FUNCTION entity_command_private.native_descriptor_ready(
 p_tenant uuid,p_release uuid,p_key text,p_unsigned text,p_artifact text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(
 SELECT 1 FROM publication.release r
 JOIN publication.artifact a ON a.publication_release_id=r.id AND a.plane_code='studio'
 JOIN publication.artifact_compilation c ON c.publication_release_id=r.id AND c.plane_code=a.plane_code AND c.artifact_kind=a.artifact_kind
 JOIN runtime_meta.applied_release installed ON installed.source_release_id=r.id AND installed.publication_key=r.release_key AND installed.artifact_hash=a.content_hash
 JOIN runtime_meta.release_activation_head h ON h.applied_release_id=installed.id AND h.publication_key=installed.publication_key AND h.artifact_hash=installed.artifact_hash AND h.source_release_no=installed.source_release_no
 WHERE r.id=p_release AND r.tenant_id=p_tenant AND r.release_key=p_key
 AND r.status='published' AND r.approved_at IS NOT NULL AND r.approved_by IS NOT NULL AND r.created_by<>r.approved_by
 AND a.artifact_kind='entity_authoring_descriptor' AND a.content_hash=p_artifact AND a.status='signed' AND a.validated_at IS NOT NULL
 AND c.unsigned_hash=p_unsigned AND installed.status='active' AND installed.verified_at IS NOT NULL AND installed.source_release_no=r.release_no)
$$;
REVOKE ALL ON FUNCTION entity_command_private.native_descriptor_ready(uuid,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION entity_command_private.native_descriptor_ready(uuid,uuid,text,text,text) TO athyper_product_command_app;
COMMIT;
