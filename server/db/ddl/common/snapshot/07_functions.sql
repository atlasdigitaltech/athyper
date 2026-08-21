CREATE OR REPLACE FUNCTION snapshot.fn_compute_entity_snapshot_hash(
    p_tenant_id uuid,
    p_entity_type text,
    p_entity_id uuid,
    p_version_number integer,
    p_payload_schema_version integer,
    p_entity_contract_hash text,
    p_capture_event text,
    p_capture_kind snapshot.capture_kind_d,
    p_payload_json jsonb,
    p_previous_snapshot_id uuid,
    p_previous_payload_hash text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, snapshot
AS $$
    SELECT encode(
        public.digest(
            jsonb_build_object(
                'tenant_id', p_tenant_id,
                'entity_type', p_entity_type,
                'entity_id', p_entity_id,
                'version_number', p_version_number,
                'payload_schema_version', p_payload_schema_version,
                'entity_contract_hash', p_entity_contract_hash,
                'capture_event', p_capture_event,
                'capture_kind', p_capture_kind,
                'payload', p_payload_json,
                'previous_snapshot_id', p_previous_snapshot_id,
                'previous_payload_hash', p_previous_payload_hash
            )::text,
            'sha256'
        ),
        'hex'
    );
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_entity_snapshot_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
DECLARE
    v_previous snapshot.entity_snapshot_identity%ROWTYPE;
BEGIN
    IF NEW.previous_snapshot_id IS NULL THEN
        IF NEW.chain_seq <> 1 OR NEW.version_number <> 1 THEN
            RAISE EXCEPTION
                'First entity snapshot must use chain_seq 1 and version_number 1'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    SELECT *
      INTO v_previous
      FROM snapshot.entity_snapshot_identity
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.previous_snapshot_id;

    IF NOT FOUND
       OR v_previous.entity_type <> NEW.entity_type
       OR v_previous.entity_id <> NEW.entity_id
       OR v_previous.payload_hash <> NEW.previous_payload_hash
       OR v_previous.chain_seq + 1 <> NEW.chain_seq
       OR v_previous.version_number + 1 <> NEW.version_number THEN
        RAISE EXCEPTION
            'Snapshot predecessor must be the immediately preceding version of the same tenant entity'
            USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM snapshot.entity_snapshot_identity newer
         WHERE newer.tenant_id = NEW.tenant_id
           AND newer.entity_type = NEW.entity_type
           AND newer.entity_id = NEW.entity_id
           AND newer.chain_seq > v_previous.chain_seq
    ) THEN
        RAISE EXCEPTION 'Snapshot predecessor is no longer the current chain head'
            USING ERRCODE = 'serialization_failure';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_validate_entity_snapshot_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
DECLARE
    v_identity snapshot.entity_snapshot_identity%ROWTYPE;
    v_expected_hash text;
    v_payload_size bigint;
BEGIN
    SELECT *
      INTO v_identity
      FROM snapshot.entity_snapshot_identity
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.snapshot_id
       AND captured_at = NEW.captured_at;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Snapshot payload requires its exact identity header'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    v_payload_size := octet_length(NEW.payload_json::text);
    IF v_payload_size <> v_identity.payload_size_bytes THEN
        RAISE EXCEPTION
            'Snapshot payload size % does not match identity evidence %',
            v_payload_size, v_identity.payload_size_bytes
            USING ERRCODE = 'check_violation';
    END IF;

    v_expected_hash := snapshot.fn_compute_entity_snapshot_hash(
        v_identity.tenant_id,
        v_identity.entity_type,
        v_identity.entity_id,
        v_identity.version_number,
        v_identity.payload_schema_version,
        v_identity.entity_contract_hash,
        v_identity.capture_event,
        v_identity.capture_kind,
        NEW.payload_json,
        v_identity.previous_snapshot_id,
        v_identity.previous_payload_hash
    );

    IF v_expected_hash <> v_identity.payload_hash THEN
        RAISE EXCEPTION 'Snapshot payload hash does not match identity evidence'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.trg_reject_entity_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, snapshot
AS $$
BEGIN
    RAISE EXCEPTION 'snapshot.% is immutable; capture a new version instead',
        TG_TABLE_NAME
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.fn_capture_entity(
    p_entity_type text,
    p_entity_id uuid,
    p_entity_code text,
    p_payload_schema_version integer,
    p_entity_contract_hash text,
    p_source_record_version bigint,
    p_capture_event text,
    p_capture_kind snapshot.capture_kind_d,
    p_payload_json jsonb,
    p_correlation_id uuid DEFAULT NULL,
    p_audit_event_id uuid DEFAULT NULL,
    p_valid_from timestamptz DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL,
    p_retention_class snapshot.retention_class_d DEFAULT 'standard',
    p_capture_source text DEFAULT 'application'
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
    v_previous_id uuid;
    v_previous_hash text;
    v_previous_seq integer;
    v_previous_version integer;
    v_new_id uuid := shared.uuidv7();
    v_captured_at timestamptz := clock_timestamp();
    v_version integer;
    v_chain_seq integer;
    v_payload_hash text;
    v_payload_size bigint;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_payload_json IS NULL OR jsonb_typeof(p_payload_json) <> 'object' THEN
        RAISE EXCEPTION 'Snapshot payload must be a JSON object'
            USING ERRCODE = 'check_violation';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            v_tenant_id::text || ':' || p_entity_type || ':' || p_entity_id::text,
            0
        )
    );

    SELECT id, payload_hash, chain_seq, version_number
      INTO v_previous_id, v_previous_hash, v_previous_seq, v_previous_version
      FROM snapshot.entity_snapshot_identity
     WHERE tenant_id = v_tenant_id
       AND entity_type = p_entity_type
       AND entity_id = p_entity_id
     ORDER BY chain_seq DESC
     LIMIT 1;

    v_version := COALESCE(v_previous_version, 0) + 1;
    v_chain_seq := COALESCE(v_previous_seq, 0) + 1;
    v_payload_size := octet_length(p_payload_json::text);
    v_payload_hash := snapshot.fn_compute_entity_snapshot_hash(
        v_tenant_id,
        p_entity_type,
        p_entity_id,
        v_version,
        p_payload_schema_version,
        p_entity_contract_hash,
        p_capture_event,
        p_capture_kind,
        p_payload_json,
        v_previous_id,
        v_previous_hash
    );

    INSERT INTO snapshot.entity_snapshot_identity (
        id,
        tenant_id,
        entity_type,
        entity_id,
        entity_code,
        version_number,
        payload_schema_version,
        entity_contract_hash,
        source_record_version,
        capture_event,
        capture_kind,
        payload_hash,
        previous_snapshot_id,
        previous_payload_hash,
        chain_seq,
        correlation_id,
        audit_event_id,
        valid_from,
        valid_until,
        retention_class,
        payload_size_bytes,
        captured_at,
        captured_by,
        capture_source
    )
    VALUES (
        v_new_id,
        v_tenant_id,
        p_entity_type,
        p_entity_id,
        NULLIF(btrim(p_entity_code), ''),
        v_version,
        p_payload_schema_version,
        p_entity_contract_hash,
        p_source_record_version,
        p_capture_event,
        p_capture_kind,
        v_payload_hash,
        v_previous_id,
        v_previous_hash,
        v_chain_seq,
        p_correlation_id,
        p_audit_event_id,
        p_valid_from,
        p_valid_until,
        p_retention_class,
        v_payload_size,
        v_captured_at,
        v_actor_id,
        p_capture_source
    );

    INSERT INTO snapshot.entity_snapshot (
        tenant_id, snapshot_id, captured_at, payload_json
    )
    VALUES (
        v_tenant_id, v_new_id, v_captured_at, p_payload_json
    );

    RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION snapshot.fn_get_entity_snapshot(
    p_snapshot_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, snapshot, shared
SET row_security = on
AS $$
    SELECT jsonb_build_object(
        'id', i.id,
        'entity_type', i.entity_type,
        'entity_id', i.entity_id,
        'entity_code', i.entity_code,
        'version_number', i.version_number,
        'payload_schema_version', i.payload_schema_version,
        'entity_contract_hash', i.entity_contract_hash,
        'source_record_version', i.source_record_version,
        'capture_event', i.capture_event,
        'capture_kind', i.capture_kind,
        'payload_hash', i.payload_hash,
        'previous_snapshot_id', i.previous_snapshot_id,
        'chain_seq', i.chain_seq,
        'valid_from', i.valid_from,
        'valid_until', i.valid_until,
        'retention_class', i.retention_class,
        'captured_at', i.captured_at,
        'captured_by', i.captured_by,
        'capture_source', i.capture_source,
        'payload', p.payload_json
    )
      FROM snapshot.entity_snapshot_identity i
      JOIN snapshot.entity_snapshot p
        ON p.tenant_id = i.tenant_id
       AND p.snapshot_id = i.id
       AND p.captured_at = i.captured_at
     WHERE i.tenant_id = shared.current_tenant_id()
       AND i.id = p_snapshot_id;
$$;

CREATE OR REPLACE FUNCTION snapshot.fn_verify_entity_snapshot_hash(
    p_snapshot_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, snapshot, shared
SET row_security = on
AS $$
    SELECT COALESCE(
        bool_and(
            i.payload_hash = snapshot.fn_compute_entity_snapshot_hash(
                i.tenant_id,
                i.entity_type,
                i.entity_id,
                i.version_number,
                i.payload_schema_version,
                i.entity_contract_hash,
                i.capture_event,
                i.capture_kind,
                p.payload_json,
                i.previous_snapshot_id,
                i.previous_payload_hash
            )
        ),
        false
    )
      FROM snapshot.entity_snapshot_identity i
      JOIN snapshot.entity_snapshot p
        ON p.tenant_id = i.tenant_id
       AND p.snapshot_id = i.id
       AND p.captured_at = i.captured_at
     WHERE i.tenant_id = shared.current_tenant_id()
       AND i.id = p_snapshot_id;
$$;

CREATE OR REPLACE FUNCTION snapshot.fn_verify_entity_snapshot_chain(
    p_entity_type text,
    p_entity_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, snapshot, shared
SET row_security = on
AS $$
    WITH chain AS (
        SELECT
            i.*,
            p.payload_json,
            row_number() OVER (ORDER BY i.chain_seq) AS expected_seq,
            lag(i.id) OVER (ORDER BY i.chain_seq) AS expected_previous_id,
            lag(i.payload_hash) OVER (ORDER BY i.chain_seq)
                AS expected_previous_hash
          FROM snapshot.entity_snapshot_identity i
          JOIN snapshot.entity_snapshot p
            ON p.tenant_id = i.tenant_id
           AND p.snapshot_id = i.id
           AND p.captured_at = i.captured_at
         WHERE i.tenant_id = shared.current_tenant_id()
           AND i.entity_type = p_entity_type
           AND i.entity_id = p_entity_id
    )
    SELECT COALESCE(
        bool_and(
            chain_seq = expected_seq
            AND version_number = expected_seq
            AND previous_snapshot_id IS NOT DISTINCT FROM expected_previous_id
            AND previous_payload_hash IS NOT DISTINCT FROM expected_previous_hash
            AND payload_hash = snapshot.fn_compute_entity_snapshot_hash(
                tenant_id,
                entity_type,
                entity_id,
                version_number,
                payload_schema_version,
                entity_contract_hash,
                capture_event,
                capture_kind,
                payload_json,
                previous_snapshot_id,
                previous_payload_hash
            )
        ),
        false
    )
    FROM chain;
$$;
