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
