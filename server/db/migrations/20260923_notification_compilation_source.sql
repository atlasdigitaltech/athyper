BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN IF current_database()<>'athyper_studio' THEN RAISE EXCEPTION 'Studio database required'; END IF; END $$;
-- Narrow read of reviewed notification artifacts; the worker never needs direct metadata access.
CREATE OR REPLACE FUNCTION publication.fn_notification_configuration_compilation_source(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid,tenant_id uuid,release_key text,release_no bigint,release_kind text,compatibility_level text,minimum_runtime_version text,release_hash text,revision_id uuid,contract_schema_code text,contract_schema_version text,contract_hash text,contract_signature text,signature_algorithm text,contract_signing_key_id text,published_at timestamptz,published_by uuid,entity_id uuid,entity_code text,contract_json jsonb,descriptor_id uuid,plane_key text,compiled_json jsonb,compiled_hash text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,publication,metadata,snapshot,shared AS $$
 SELECT pr.id,pr.tenant_id,pr.release_key,pr.release_no,pr.release_kind::text,pr.compatibility_level::text,pr.minimum_runtime_version,
 er.release_hash,er.revision_id,er.contract_schema_code,er.contract_schema_version,er.contract_hash,er.contract_signature,
 er.signature_algorithm,er.signing_key_id,er.published_at,er.published_by,e.id,e.entity_code,r.contract_json,
 a.id,a.plane_key,a.compiled_json,a.compiled_hash,a.created_at
 FROM publication.release pr
 JOIN publication.entity_release_link l ON l.publication_release_id=pr.id
 JOIN metadata.entity_release er ON er.id=l.entity_release_id AND er.tenant_id=pr.tenant_id
 JOIN metadata.entity e ON e.id=er.entity_id AND e.tenant_id=er.tenant_id
 JOIN snapshot.entity_contract_revision r ON r.id=er.revision_id AND r.tenant_id=er.tenant_id
 JOIN snapshot.entity_release_artifact a ON a.source_release_id=er.id AND a.tenant_id=er.tenant_id
 WHERE pr.id=p_release_id AND pr.tenant_id=shared.current_tenant_id() AND pr.status IN ('approved','published')
 AND e.entity_class='configuration' AND a.plane_key='neon' AND a.compiled_json->>'schema'='athyper.entity-notifications/1'
 AND pr.release_key='metadata.notifications.'||(a.compiled_json->>'entityCode')||'.'||replace(pr.tenant_id::text,'-','');
$$;
REVOKE ALL ON FUNCTION publication.fn_notification_configuration_compilation_source(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_notification_configuration_compilation_source(uuid) TO athyper_publication_service;

COMMIT;
