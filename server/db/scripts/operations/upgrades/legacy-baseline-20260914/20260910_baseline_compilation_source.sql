BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION publication.fn_initial_baseline_compilation_source(p_release_id uuid)
RETURNS TABLE(publication_release_id uuid,tenant_id uuid,release_key text,release_no bigint,release_kind text,compatibility_level text,minimum_runtime_version text,revision_id uuid,published_at timestamptz,published_by uuid,entity_id uuid,entity_code text,contract_schema_code text,contract_schema_version text,contract_json jsonb,contract_hash text,contract_signature text,signature_algorithm text,contract_signing_key_id text,descriptor_id uuid,plane_key text,compiled_json jsonb,compiled_hash text,created_at timestamptz,imported_baseline jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,publication,metadata,snapshot,shared AS $$
SELECT pr.id publication_release_id,pr.tenant_id,pr.release_key,pr.release_no,pr.release_kind::text,
        pr.compatibility_level::text,pr.minimum_runtime_version,er.revision_id,er.published_at,er.published_by,
        b.source_entity_id AS entity_id,b.entity_code,b.payload->'source'->'contract'->>'contract_schema_code' AS contract_schema_code,
        b.payload->'source'->'contract'->>'contract_schema_version' AS contract_schema_version,
        b.payload->'source'->'contract'->'contract_json' AS contract_json,
        er.contract_hash,er.contract_signature,er.signature_algorithm,er.signing_key_id AS contract_signing_key_id,
        a.id AS descriptor_id,a.plane_key,a.compiled_json,a.compiled_hash,a.created_at,
        jsonb_build_object('baselineImportId',b.id,'contentHash',b.content_hash,'appliedReleaseId',b.payload->'source'->'head'->>'applied_release_id',
          'rowVersion',b.payload->'source'->'head'->>'row_version','sourceReleaseNo',b.source_release_no,'artifactHash',b.payload->'source'->'head'->>'artifact_hash') AS imported_baseline
        FROM publication.release pr JOIN publication.entity_baseline_release_link l ON l.publication_release_id=pr.id AND l.tenant_id=pr.tenant_id
        JOIN metadata.entity_baseline_import b ON b.id=l.baseline_id AND b.tenant_id=l.tenant_id
        JOIN metadata.entity_release er ON er.id=l.entity_release_id AND er.tenant_id=l.tenant_id
        JOIN snapshot.entity_release_artifact a ON a.source_release_id=er.id AND a.tenant_id=er.tenant_id
        WHERE pr.tenant_id=shared.current_tenant_id() AND pr.id=p_release_id AND pr.status IN ('approved','published')
          AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation revoked WHERE revoked.baseline_id=b.id);
$$;
REVOKE ALL ON FUNCTION publication.fn_initial_baseline_compilation_source(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publication.fn_initial_baseline_compilation_source(uuid) TO athyper_publication_service;
COMMIT;
