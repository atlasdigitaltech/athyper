CREATE OR REPLACE FUNCTION snapshot.fn_compute_entity_release_artifact_hash(
    p_source_release_id uuid,
    p_source_revision_id uuid,
    p_entity_id uuid,
    p_plane_key text,
    p_release_hash text,
    p_contract_hash text,
    p_compiled_json jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT encode(public.digest(jsonb_build_object(
        'source_release_id', p_source_release_id,
        'source_revision_id', p_source_revision_id,
        'entity_id', p_entity_id,
        'plane_key', p_plane_key,
        'release_hash', p_release_hash,
        'contract_hash', p_contract_hash,
        'compiled', p_compiled_json
    )::text, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_entity_release_artifact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, metadata, snapshot
AS $$
DECLARE
    v_release metadata.entity_release%ROWTYPE;
    v_expected text;
BEGIN
    SELECT * INTO v_release
      FROM metadata.entity_release
     WHERE id = NEW.source_release_id;
    IF NOT FOUND
       OR v_release.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR v_release.entity_id <> NEW.entity_id
       OR v_release.revision_id <> NEW.source_revision_id
       OR v_release.release_hash <> NEW.release_hash
       OR v_release.contract_hash <> NEW.contract_hash
       OR NOT (NEW.plane_key = ANY(v_release.target_planes)) THEN
        RAISE EXCEPTION 'Release artifact coordinates do not match the immutable source release'
            USING ERRCODE = 'check_violation';
    END IF;

    v_expected := snapshot.fn_compute_entity_release_artifact_hash(
        NEW.source_release_id, NEW.source_revision_id, NEW.entity_id,
        NEW.plane_key, NEW.release_hash, NEW.contract_hash, NEW.compiled_json
    );
    IF NEW.compiled_hash <> v_expected THEN
        RAISE EXCEPTION 'Release artifact compiled hash is invalid'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_reject_entity_release_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'Entity release artifacts are immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;
