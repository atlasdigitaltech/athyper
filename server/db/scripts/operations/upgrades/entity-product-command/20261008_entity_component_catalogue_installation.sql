BEGIN;
SET LOCAL lock_timeout='5s';
-- Publication-role-only access to exact reviewed active component evidence.
-- No direct catalogue INSERT/UPDATE/DELETE grants are introduced.
CREATE FUNCTION publication.read_active_ui_component(p_applied uuid)
RETURNS TABLE(source_json jsonb,signed_document jsonb,artifact_hash text,payload_hash text,release_hash text,reviewed_source jsonb,deployment_bundle jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RETURN QUERY SELECT p.payload_json,p.coordinates->'signed_document',r.artifact_hash,p.payload_hash,s.release_hash,s.metadata->'authoringResourceSource',
 jsonb_build_object('deploymentId',d.id,'deploymentStatus',d.status,'targetPlane',d.target_plane,
 'targetEnvironment',d.target_environment,'targetInstance',d.target_instance,'publicationKey',r.publication_key,
 'sourceReleaseId',s.id,'sourceReleaseNo',s.release_no,'artifactUri',a.artifact_uri,'artifactHash',a.content_hash,
 'signatureAlgorithm',a.signature_algorithm,'signingKeyId',a.signing_key_id,'signature',a.signature)
 FROM runtime_meta.release_activation_head h
 JOIN runtime_meta.applied_release r ON r.id=h.applied_release_id AND r.publication_key=h.publication_key
   AND r.source_release_no=h.source_release_no AND r.artifact_hash=h.artifact_hash
 JOIN runtime_meta.applied_release_payload p ON p.applied_release_id=r.id
 JOIN publication.release s ON s.id=r.source_release_id
 JOIN publication.deployment d ON d.id=r.deployment_id AND d.target_plane='studio'
 JOIN publication.artifact a ON a.id=d.artifact_id AND a.publication_release_id=s.id
   AND a.artifact_kind='entity_ui_component' AND a.content_hash=r.artifact_hash AND a.plane_code='studio' 
 WHERE r.id=p_applied AND r.status='active' AND p.artifact_kind='entity_ui_component'
   AND p.tenant_id IS NULL AND p.coordinates->>'plane_code'='studio'
   AND r.manifest->>'artifactKind'='entity_ui_component'
   AND r.manifest->>'payloadSha256'=p.payload_hash
   AND r.verification_evidence->>'signature_verified'='true'
   AND r.verification_evidence->>'manifest_valid'='true'
   AND r.verification_evidence->>'runtime_compatible'='true'
   AND s.tenant_id=shared.current_tenant_id_soft() AND s.status IN ('approved','published')
   AND s.release_key=r.publication_key AND s.release_no=r.source_release_no
   AND s.approved_at IS NOT NULL AND s.approved_by IS NOT NULL AND s.approved_by<>s.created_by
   AND s.metadata->>'artifactKind'='entity_ui_component'
   AND s.metadata#>'{authoringResourceSource,payload}'=p.payload_json
   AND p.payload_json->>'schema'='entity.ui-component-resource/1'
   AND p.payload_json#>'{declaration,tenantId}'='null'::jsonb
   AND p.payload_json#>>'{declaration,publicationResourceKey}'=r.publication_key
 FOR SHARE OF h,r,p,s,d,a;
 IF NOT FOUND THEN RAISE EXCEPTION 'UI_COMPONENT_ACTIVE_REVIEWED_SOURCE_REQUIRED' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION publication.read_active_ui_component(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.read_active_ui_component(uuid) TO athyper_publication_service;

CREATE FUNCTION publication.install_active_ui_component(p_applied uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e record; expected jsonb; stored jsonb;
BEGIN
 SELECT * INTO STRICT e FROM publication.read_active_ui_component(p_applied);
 expected := jsonb_build_object(
 'id',e.source_json#>'{declaration,id}',
 'tenant_id',e.source_json#>'{declaration,tenantId}',
 'component_key',e.source_json#>'{declaration,componentKey}',
 'component_version',e.source_json#>'{declaration,componentVersion}',
 'component_level',e.source_json#>'{declaration,componentLevel}',
 'component_tier',e.source_json#>'{declaration,componentTier}',
 'manifest_hash',to_jsonb(e.payload_hash),
 'resource_owner',e.source_json#>'{declaration,resourceOwner}',
 'resource_namespace',e.source_json#>'{declaration,resourceNamespace}',
 'publication_resource_key',e.source_json#>'{declaration,publicationResourceKey}',
 'publication_release_hash',to_jsonb(e.release_hash),
 'supported_data_types',e.source_json#>'{declaration,supportedDataTypes}',
 'supported_planes',e.source_json#>'{declaration,supportedPlanes}',
 'supported_surface_kinds',e.source_json#>'{declaration,supportedSurfaceKinds}',
 'supported_modes',e.source_json#>'{declaration,supportedModes}',
 'cardinalities',e.source_json#>'{declaration,cardinalities}',
 'option_keys',e.source_json#>'{declaration,optionKeys}',
 'filter_operators',e.source_json#>'{declaration,filterOperators}',
 'compatible_display_ids',e.source_json#>'{declaration,compatibleDisplayIds}',
 'masked_representation_safe',e.source_json#>'{declaration,maskedRepresentationSafe}',
 'status','"active"'::jsonb);
 INSERT INTO metadata.ui_component_contract SELECT (jsonb_populate_record(NULL::metadata.ui_component_contract,expected)).*
 ON CONFLICT(id) DO NOTHING;
 SELECT to_jsonb(c) INTO STRICT stored FROM metadata.ui_component_contract c WHERE c.id=(expected->>'id')::uuid;
 IF stored IS DISTINCT FROM expected THEN RAISE EXCEPTION 'UI_COMPONENT_INSTALLATION_CONFLICT' USING ERRCODE='23514'; END IF;
 RETURN stored;
END $$;
REVOKE ALL ON FUNCTION publication.install_active_ui_component(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.install_active_ui_component(uuid) TO athyper_publication_service;

COMMIT;
