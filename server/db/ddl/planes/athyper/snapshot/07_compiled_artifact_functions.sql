CREATE OR REPLACE FUNCTION snapshot.fn_compute_compiled_artifact_hash(
    p_source_snapshot_id uuid,
    p_source_payload_hash text,
    p_artifact_kind text,
    p_artifact_scope text,
    p_plane_key text,
    p_overlay_set_hash text,
    p_source_contract_hash text,
    p_compiled_json jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, snapshot
AS $$
    SELECT encode(
        public.digest(
            jsonb_build_object(
                'source_snapshot_id', p_source_snapshot_id,
                'source_payload_hash', p_source_payload_hash,
                'artifact_kind', p_artifact_kind,
                'artifact_scope', p_artifact_scope,
                'plane_key', p_plane_key,
                'overlay_set_hash', p_overlay_set_hash,
                'source_contract_hash', p_source_contract_hash,
                'compiled', p_compiled_json
            )::text,
            'sha256'
        ),
        'hex'
    );
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_compiled_artifact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
DECLARE
    v_source snapshot.entity_snapshot_identity%ROWTYPE;
    v_expected_hash text;
BEGIN
    SELECT *
      INTO v_source
      FROM snapshot.entity_snapshot_identity
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.source_snapshot_id;

    IF NOT FOUND
       OR v_source.entity_type <> NEW.entity_type
       OR v_source.entity_id <> NEW.entity_id
       OR v_source.entity_contract_hash <> NEW.source_contract_hash THEN
        RAISE EXCEPTION
            'Compiled artifact coordinates and contract must match its source snapshot'
            USING ERRCODE = 'check_violation';
    END IF;

    v_expected_hash := snapshot.fn_compute_compiled_artifact_hash(
        NEW.source_snapshot_id,
        v_source.payload_hash,
        NEW.artifact_kind,
        NEW.artifact_scope,
        NEW.plane_key,
        NEW.overlay_set_hash,
        NEW.source_contract_hash,
        NEW.compiled_json
    );

    IF NEW.compiled_hash <> v_expected_hash THEN
        RAISE EXCEPTION 'Compiled artifact hash is invalid'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.fn_publish_compiled_artifact(
    p_source_snapshot_id uuid,
    p_artifact_kind text,
    p_artifact_scope text,
    p_plane_key text,
    p_overlay_set_hash text,
    p_compiled_json jsonb,
    p_compliance_report jsonb DEFAULT '{}'::jsonb,
    p_compliance_score numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, snapshot, shared, master
SET row_security = on
AS $$
DECLARE
    v_tenant_id uuid := shared.current_tenant_id();
    v_actor_id uuid := master.current_principal_id_soft();
    v_source snapshot.entity_snapshot_identity%ROWTYPE;
    v_new_id uuid := shared.uuidv7();
    v_compiled_hash text;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_compiled_json IS NULL OR jsonb_typeof(p_compiled_json) <> 'object' THEN
        RAISE EXCEPTION 'Compiled artifact must be a JSON object'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_compliance_report IS NULL
       OR jsonb_typeof(p_compliance_report) <> 'object' THEN
        RAISE EXCEPTION 'Compliance report must be a JSON object'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT *
      INTO v_source
      FROM snapshot.entity_snapshot_identity
     WHERE tenant_id = v_tenant_id
       AND id = p_source_snapshot_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source snapshot does not exist in the current tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    v_compiled_hash := snapshot.fn_compute_compiled_artifact_hash(
        p_source_snapshot_id,
        v_source.payload_hash,
        p_artifact_kind,
        p_artifact_scope,
        p_plane_key,
        p_overlay_set_hash,
        v_source.entity_contract_hash,
        p_compiled_json
    );

    INSERT INTO snapshot.compiled_artifact (
        id,
        tenant_id,
        source_snapshot_id,
        entity_type,
        entity_id,
        artifact_kind,
        artifact_scope,
        plane_key,
        overlay_set_hash,
        source_contract_hash,
        compiled_json,
        compiled_hash,
        compliance_report,
        compliance_score,
        created_by
    )
    VALUES (
        v_new_id,
        v_tenant_id,
        p_source_snapshot_id,
        v_source.entity_type,
        v_source.entity_id,
        p_artifact_kind,
        p_artifact_scope,
        NULLIF(btrim(p_plane_key), ''),
        NULLIF(btrim(p_overlay_set_hash), ''),
        v_source.entity_contract_hash,
        p_compiled_json,
        v_compiled_hash,
        p_compliance_report,
        p_compliance_score,
        v_actor_id
    );

    RETURN v_new_id;
END;
$$;
